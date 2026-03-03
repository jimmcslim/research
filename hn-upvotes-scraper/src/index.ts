import { Database } from "bun:sqlite";

const BASE_URL = "https://news.ycombinator.com";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      const unquoted = rawValue.replace(/^['"]|['"]$/g, "");
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
  return new URL(url, `${BASE_URL}/`).toString();
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(value: string): string {
  return htmlDecode(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function extractMoreLink(html: string): string | null {
  const match = html.match(/<a\s+[^>]*class=["'][^"']*morelink[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*morelink[^"']*["']/i);
  return match ? absoluteUrl(htmlDecode(match[1])) : null;
}

function parseSubmissions(html: string, scrapedAt: string): SubmissionRecord[] {
  const records: SubmissionRecord[] = [];
  const rowRegex = /<tr\s+class=['"]athing['"][^>]*id=['"](\d+)['"][\s\S]*?<\/tr>\s*<tr[^>]*>[\s\S]*?<td\s+class=['"]subtext['"][\s\S]*?<\/td>[\s\S]*?<\/tr>/gi;

  for (const blockMatch of html.matchAll(rowRegex)) {
    const block = blockMatch[0];
    const itemId = Number(blockMatch[1]);

    const titleMatch = block.match(/<span\s+class=['"]titleline['"][\s\S]*?<a\s+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a\s+href=['"]([^'"]+)['"][^>]*class=['"][^'"]*titlelink[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i);

    const title = titleMatch ? stripTags(titleMatch[2]) : "(untitled)";
    const itemUrl = titleMatch ? absoluteUrl(htmlDecode(titleMatch[1])) : null;

    const pointsMatch = block.match(/<span\s+class=['"]score['"][^>]*>(\d+)\s+points?<\/span>/i);
    const authorMatch = block.match(/<a\s+href=['"]user\?id=[^'"]+['"][^>]*class=['"]hnuser['"][^>]*>([^<]+)<\/a>/i);
    const ageMatch = block.match(/<span\s+class=['"]age['"][\s\S]*?<a\s+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/i);
    const commentsMatch = block.match(/<a\s+href=['"]item\?id=\d+['"][^>]*>(\d+|discuss|\d+&nbsp;comments?|\d+\s+comments?)<\/a>/i);

    const commentsText = commentsMatch ? stripTags(commentsMatch[1]).toLowerCase() : "";
    const commentsCount = commentsText.includes("discuss")
      ? 0
      : Number((commentsText.match(/\d+/)?.[0] || "0"));

    records.push({
      itemId,
      title,
      itemUrl,
      hnItemUrl: `${BASE_URL}/item?id=${itemId}`,
      points: pointsMatch ? Number(pointsMatch[1]) : null,
      author: authorMatch ? authorMatch[1].trim() : null,
      ageText: ageMatch ? ageMatch[2].trim() : null,
      ageUrl: ageMatch ? absoluteUrl(htmlDecode(ageMatch[1])) : null,
      commentsCount,
      scrapedAt,
    });
  }

  return records;
}

function parseComments(html: string, scrapedAt: string): CommentRecord[] {
  const records: CommentRecord[] = [];
  const commentRegex = /<tr\s+class=['"]athing['"][^>]*id=['"](\d+)['"][\s\S]*?<\/tr>/gi;

  for (const match of html.matchAll(commentRegex)) {
    const block = match[0];
    const itemId = Number(match[1]);
    const authorMatch = block.match(/<a\s+href=['"]user\?id=[^'"]+['"][^>]*class=['"]hnuser['"][^>]*>([^<]+)<\/a>/i);
    const ageMatch = block.match(/<span\s+class=['"]age['"][\s\S]*?<a\s+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/i);
    const commtextMatch = block.match(/<(?:div|span)\s+class=['"][^'"]*commtext[^'"]*['"][^>]*>([\s\S]*?)<\/(?:div|span)>/i);
    const parentItemMatch = block.match(/<span\s+class=['"]onstory['"][\s\S]*?<a\s+href=['"](item\?id=\d+)['"][^>]*>/i);

    const commentHtml = commtextMatch ? commtextMatch[1].trim() : "";

    records.push({
      itemId,
      author: authorMatch ? authorMatch[1].trim() : null,
      ageText: ageMatch ? ageMatch[2].trim() : null,
      ageUrl: ageMatch ? absoluteUrl(htmlDecode(ageMatch[1])) : null,
      commentHtml,
      commentText: stripTags(commentHtml),
      parentItemUrl: parentItemMatch ? absoluteUrl(htmlDecode(parentItemMatch[1])) : null,
      scrapedAt,
    });
  }

  return records;
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
  const delayMs = Number(process.env.HN_REQUEST_DELAY_MS || "1000");
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await sleep(delayMs);
  }

  const url = new URL(pathOrUrl, `${BASE_URL}/`).toString();
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const res = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
  });
  cookieJar.addFromResponse(res.headers);
  return res;
}

async function login(cookieJar: CookieJar, username: string, password: string): Promise<void> {
  const loginPage = await request("/login", cookieJar, { method: "GET" });
  const loginHtml = await loginPage.text();

  const form = new URLSearchParams();
  const fnidMatch = loginHtml.match(/<input\s+[^>]*name=['"]fnid['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]fnid['"]/i);
  const gotoMatch = loginHtml.match(/<input\s+[^>]*name=['"]goto['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]goto['"]/i);

  if (fnidMatch?.[1]) {
    form.set("fnid", fnidMatch[1]);
  }

  form.set("goto", gotoMatch?.[1] || "news");
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

  await request(location, cookieJar, { method: "GET" });
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
    next = extractMoreLink(html);
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

  const requestDelayMs = Number(process.env.HN_REQUEST_DELAY_MS || "1000");
  if (!Number.isFinite(requestDelayMs) || requestDelayMs < 0) {
    throw new Error("HN_REQUEST_DELAY_MS must be a number >= 0.");
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

  console.log(
    `Saved ${submissions.length} submissions and ${comments.length} comments to ${dbPath} (delay=${requestDelayMs}ms)`
  );
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
