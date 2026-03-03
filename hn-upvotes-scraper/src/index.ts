import { Database } from "bun:sqlite";

const BASE_URL = "https://news.ycombinator.com";

type SubmissionRecord = {
  itemId: number;
  title: string;
  itemUrl: string | null;
  hnItemUrl: string;
  points: number | null;
  author: string | null;
  ageText: string | null;
  ageUrl: string | null;
  commentsCount: number | null;
  scrapedAt: string;
};

type CommentRecord = {
  itemId: number;
  author: string | null;
  ageText: string | null;
  ageUrl: string | null;
  commentHtml: string;
  commentText: string;
  parentItemUrl: string | null;
  scrapedAt: string;
};

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(headers: Headers) {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function"
      ? getSetCookie.call(headers)
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];

    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(";");
      const [name, ...rest] = nameValue.split("=");
      if (!name || rest.length === 0) continue;
      this.cookies.set(name.trim(), rest.join("=").trim());
    }
  }

  headerValue(): string {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

async function loadDotEnv(path = ".env") {
  try {
    const text = await Bun.file(path).text();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      const unquoted = rawValue.replace(/^['\"]|['\"]$/g, "");
      process.env[key] = unquoted;
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) {
      throw error;
    }
  }
}

function absoluteUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${BASE_URL}/${url.replace(/^\//, "")}`;
}

function parseSubmissions(html: string, scrapedAt: string): SubmissionRecord[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];

  const rows = Array.from(doc.querySelectorAll("tr.athing"));
  return rows.map((row) => {
    const itemId = Number(row.getAttribute("id") || "0");
    const titleLink = row.querySelector(".titleline > a") || row.querySelector(".title a");
    const title = titleLink?.textContent?.trim() || "(untitled)";
    const itemUrl = absoluteUrl(titleLink?.getAttribute("href") || null);

    const subtextRow = row.nextElementSibling;
    const subtext = subtextRow?.querySelector(".subtext");
    const points = Number((subtext?.querySelector(".score")?.textContent || "").replace(/\D+/g, "")) || null;
    const author = subtext?.querySelector(".hnuser")?.textContent?.trim() || null;
    const ageAnchor = subtext?.querySelector(".age > a") as HTMLAnchorElement | null;
    const ageText = ageAnchor?.textContent?.trim() || null;
    const ageUrl = absoluteUrl(ageAnchor?.getAttribute("href") || null);

    const allLinks = Array.from(subtext?.querySelectorAll("a") || []);
    const commentsAnchor = allLinks.find((a) => /comment/.test(a.textContent || ""));
    const commentsCountRaw = commentsAnchor?.textContent?.replace(/\D+/g, "") || "";

    return {
      itemId,
      title,
      itemUrl,
      hnItemUrl: `${BASE_URL}/item?id=${itemId}`,
      points,
      author,
      ageText,
      ageUrl,
      commentsCount: commentsCountRaw ? Number(commentsCountRaw) : 0,
      scrapedAt,
    };
  }).filter((s) => s.itemId > 0);
}

function parseComments(html: string, scrapedAt: string): CommentRecord[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];

  const commentRows = Array.from(doc.querySelectorAll("tr.comtr"));
  return commentRows.map((row) => {
    const itemId = Number(row.getAttribute("id") || "0");
    const author = row.querySelector(".hnuser")?.textContent?.trim() || null;
    const ageAnchor = row.querySelector(".age > a") as HTMLAnchorElement | null;
    const ageText = ageAnchor?.textContent?.trim() || null;
    const ageUrl = absoluteUrl(ageAnchor?.getAttribute("href") || null);

    const commtext = row.querySelector(".commtext");
    const commentHtml = commtext?.innerHTML?.trim() || "";
    const commentText = commtext?.textContent?.trim() || "";

    const parentItemAnchor = Array.from(row.querySelectorAll("a")).find((a) => {
      const href = a.getAttribute("href") || "";
      return href.startsWith("item?id=");
    });

    return {
      itemId,
      author,
      ageText,
      ageUrl,
      commentHtml,
      commentText,
      parentItemUrl: absoluteUrl(parentItemAnchor?.getAttribute("href") || null),
      scrapedAt,
    };
  }).filter((c) => c.itemId > 0);
}

function initDb(path: string): Database {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      item_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      item_url TEXT,
      hn_item_url TEXT NOT NULL,
      points INTEGER,
      author TEXT,
      age_text TEXT,
      age_url TEXT,
      comments_count INTEGER,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      item_id INTEGER PRIMARY KEY,
      author TEXT,
      age_text TEXT,
      age_url TEXT,
      comment_html TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      parent_item_url TEXT,
      scraped_at TEXT NOT NULL
    );
  `);
  return db;
}

async function request(pathOrUrl: string, cookieJar: CookieJar, init: RequestInit = {}): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  cookieJar.addFromResponse(res.headers);
  return res;
}

async function login(cookieJar: CookieJar, username: string, password: string): Promise<void> {
  const loginPage = await request("/login", cookieJar, { method: "GET" });
  const loginHtml = await loginPage.text();
  const doc = new DOMParser().parseFromString(loginHtml, "text/html");
  const fnid = doc?.querySelector('input[name="fnid"]')?.getAttribute("value");

  if (!fnid) {
    throw new Error("Could not find login form fnid. Hacker News login page format may have changed.");
  }

  const form = new URLSearchParams();
  form.set("fnid", fnid);
  form.set("goto", "news");
  form.set("acct", username);
  form.set("pw", password);

  const loginRes = await request("/login", cookieJar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const location = loginRes.headers.get("location") || "";
  if (loginRes.status !== 302 || location.includes("login")) {
    throw new Error("Login failed. Verify HN_USERNAME and HN_PASSWORD.");
  }

  await request(location.startsWith("http") ? location : `${BASE_URL}${location}`, cookieJar, { method: "GET" });
}

function saveSubmissions(db: Database, submissions: SubmissionRecord[]) {
  const insert = db.prepare(`
    INSERT INTO submissions (
      item_id, title, item_url, hn_item_url, points, author, age_text, age_url, comments_count, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      title=excluded.title,
      item_url=excluded.item_url,
      hn_item_url=excluded.hn_item_url,
      points=excluded.points,
      author=excluded.author,
      age_text=excluded.age_text,
      age_url=excluded.age_url,
      comments_count=excluded.comments_count,
      scraped_at=excluded.scraped_at;
  `);

  const tx = db.transaction((records: SubmissionRecord[]) => {
    for (const row of records) {
      insert.run(
        row.itemId,
        row.title,
        row.itemUrl,
        row.hnItemUrl,
        row.points,
        row.author,
        row.ageText,
        row.ageUrl,
        row.commentsCount,
        row.scrapedAt,
      );
    }
  });

  tx(submissions);
}

function saveComments(db: Database, comments: CommentRecord[]) {
  const insert = db.prepare(`
    INSERT INTO comments (
      item_id, author, age_text, age_url, comment_html, comment_text, parent_item_url, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      author=excluded.author,
      age_text=excluded.age_text,
      age_url=excluded.age_url,
      comment_html=excluded.comment_html,
      comment_text=excluded.comment_text,
      parent_item_url=excluded.parent_item_url,
      scraped_at=excluded.scraped_at;
  `);

  const tx = db.transaction((records: CommentRecord[]) => {
    for (const row of records) {
      insert.run(
        row.itemId,
        row.author,
        row.ageText,
        row.ageUrl,
        row.commentHtml,
        row.commentText,
        row.parentItemUrl,
        row.scrapedAt,
      );
    }
  });

  tx(comments);
}

async function fetchAllPages(startUrl: string, cookieJar: CookieJar): Promise<string[]> {
  const pages: string[] = [];
  let next: string | null = startUrl;

  while (next) {
    const res = await request(next, cookieJar, { method: "GET" });
    const html = await res.text();
    pages.push(html);

    const doc = new DOMParser().parseFromString(html, "text/html");
    const more = doc?.querySelector("a.morelink")?.getAttribute("href") || null;
    next = more ? absoluteUrl(more) : null;
  }

  return pages;
}

async function main() {
  await loadDotEnv();

  const username = process.env.HN_USERNAME;
  const password = process.env.HN_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing HN_USERNAME or HN_PASSWORD. Set env vars or provide them in a .env file.");
  }

  const dbPath = process.env.HN_DB_PATH || "hn-upvotes.sqlite";
  const cookieJar = new CookieJar();
  const db = initDb(dbPath);
  const scrapedAt = new Date().toISOString();

  await login(cookieJar, username, password);

  const submissionsPages = await fetchAllPages(`${BASE_URL}/upvoted?id=${encodeURIComponent(username)}`, cookieJar);
  const commentsPages = await fetchAllPages(`${BASE_URL}/upvoted?id=${encodeURIComponent(username)}&comments=t`, cookieJar);

  const submissions = submissionsPages.flatMap((html) => parseSubmissions(html, scrapedAt));
  const comments = commentsPages.flatMap((html) => parseComments(html, scrapedAt));

  saveSubmissions(db, submissions);
  saveComments(db, comments);

  console.log(`Saved ${submissions.length} submissions and ${comments.length} comments to ${dbPath}`);
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
