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

type ScrapeCounts = {
  pages: number;
  records: number;
};

type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  label: string;
};

type RuntimeOptions = {
  dbPath: string;
  requestDelayMs: number;
  maxPages: number;
  maxRetries: number;
  retryBaseMs: number;
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
      if (key !== "HN_USERNAME" && key !== "HN_PASSWORD") continue;
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

function getRetryDelayMs(res: Response | null, attempt: number, baseDelayMs: number): number {
  const retryAfter = res?.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  return baseDelayMs * Math.max(1, 2 ** Math.max(0, attempt - 1));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseCliArgs(argv: string[]): RuntimeOptions {
  const options: RuntimeOptions = {
    dbPath: "hn-upvotes.sqlite",
    requestDelayMs: 1000,
    maxPages: 0,
    maxRetries: 3,
    retryBaseMs: 2000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = argv[i + 1];

    if (arg === "--db-path") {
      if (!nextValue) throw new Error("Missing value for --db-path");
      options.dbPath = nextValue;
      i += 1;
      continue;
    }

    if (arg === "--request-delay-ms") {
      if (!nextValue) throw new Error("Missing value for --request-delay-ms");
      options.requestDelayMs = Number(nextValue);
      i += 1;
      continue;
    }

    if (arg === "--max-pages") {
      if (!nextValue) throw new Error("Missing value for --max-pages");
      options.maxPages = Number(nextValue);
      i += 1;
      continue;
    }

    if (arg === "--max-retries") {
      if (!nextValue) throw new Error("Missing value for --max-retries");
      options.maxRetries = Number(nextValue);
      i += 1;
      continue;
    }

    if (arg === "--retry-base-ms") {
      if (!nextValue) throw new Error("Missing value for --retry-base-ms");
      options.retryBaseMs = Number(nextValue);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function validateRuntimeOptions(options: RuntimeOptions): void {
  if (!Number.isFinite(options.requestDelayMs) || options.requestDelayMs < 0) {
    throw new Error("--request-delay-ms must be a number >= 0.");
  }
  if (!Number.isFinite(options.maxPages) || options.maxPages < 0) {
    throw new Error("--max-pages must be a number >= 0.");
  }
  if (!Number.isFinite(options.maxRetries) || options.maxRetries < 0) {
    throw new Error("--max-retries must be a number >= 0.");
  }
  if (!Number.isFinite(options.retryBaseMs) || options.retryBaseMs < 0) {
    throw new Error("--retry-base-ms must be a number >= 0.");
  }
}

async function request(
  pathOrUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  init: RequestInit = {},
): Promise<Response> {
  if (runtimeOptions.requestDelayMs > 0) {
    await sleep(runtimeOptions.requestDelayMs);
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

async function requestWithRetry(
  pathOrUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  init: RequestInit,
  options: RetryOptions,
): Promise<Response> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      const res = await request(pathOrUrl, cookieJar, runtimeOptions, init);
      if (!shouldRetryStatus(res.status) || attempt > options.retries) {
        return res;
      }

      const retryDelayMs = getRetryDelayMs(res, attempt, options.baseDelayMs);
      console.log(
        `[${options.label}] HTTP ${res.status} on attempt ${attempt}/${options.retries + 1}; `
        + `retrying in ${retryDelayMs}ms`
      );
      await sleep(retryDelayMs);
    } catch (error) {
      if (attempt > options.retries) {
        throw error;
      }

      const retryDelayMs = getRetryDelayMs(null, attempt, options.baseDelayMs);
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[${options.label}] Request error on attempt ${attempt}/${options.retries + 1}: ${message}; `
        + `retrying in ${retryDelayMs}ms`
      );
      await sleep(retryDelayMs);
    }
  }
}

async function login(
  cookieJar: CookieJar,
  username: string,
  password: string,
  runtimeOptions: RuntimeOptions,
): Promise<void> {
  const retryOptions = {
    retries: runtimeOptions.maxRetries,
    baseDelayMs: runtimeOptions.retryBaseMs,
  };
  const loginPage = await requestWithRetry("/login", cookieJar, runtimeOptions, { method: "GET" }, {
    ...retryOptions,
    label: "login",
  });
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

  const loginRes = await requestWithRetry("/login", cookieJar, runtimeOptions, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }, {
    ...retryOptions,
    label: "login",
  });

  const location = loginRes.headers.get("location") || "";
  if (loginRes.status !== 302 || location.includes("login")) {
    throw new Error("Login failed. Verify HN_USERNAME and HN_PASSWORD.");
  }

  await requestWithRetry(location, cookieJar, runtimeOptions, { method: "GET" }, {
    ...retryOptions,
    label: "login",
  });
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

  for (const row of submissions) {
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

  for (const row of comments) {
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
}

async function scrapePaginatedResource(
  label: string,
  startUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  handlePage: (html: string) => number,
): Promise<ScrapeCounts> {
  let pageNumber = 0;
  let totalRecords = 0;
  let next: string | null = startUrl;

  while (next) {
    if (runtimeOptions.maxPages > 0 && pageNumber >= runtimeOptions.maxPages) {
      console.log(`[${label}] Reached --max-pages=${runtimeOptions.maxPages}; stopping pagination.`);
      break;
    }

    pageNumber += 1;
    console.log(`[${label}] Fetching page ${pageNumber}: ${next}`);
    const res = await requestWithRetry(next, cookieJar, runtimeOptions, { method: "GET" }, {
      retries: runtimeOptions.maxRetries,
      baseDelayMs: runtimeOptions.retryBaseMs,
      label: `${label}:page-${pageNumber}`,
    });

    if (!res.ok) {
      throw new Error(`[${label}] Request failed for page ${pageNumber}: HTTP ${res.status}`);
    }

    const html = await res.text();
    const pageRecords = handlePage(html);
    totalRecords += pageRecords;
    next = extractMoreLink(html);
    console.log(
      `[${label}] Scraped page ${pageNumber} (${pageRecords} records, ${totalRecords} total)`
    );
  }

  return { pages: pageNumber, records: totalRecords };
}

async function main() {
  await loadDotEnv();
  const runtimeOptions = parseCliArgs(process.argv.slice(2));
  validateRuntimeOptions(runtimeOptions);

  const username = process.env.HN_USERNAME;
  const password = process.env.HN_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing HN_USERNAME or HN_PASSWORD. Set env vars or provide them in a .env file.");
  }
  const cookieJar = new CookieJar();
  const db = initDb(runtimeOptions.dbPath);
  const scrapedAt = new Date().toISOString();

  console.log(
    `Starting scrape for HN user ${username} -> ${runtimeOptions.dbPath} `
    + `(delay=${runtimeOptions.requestDelayMs}ms, maxPages=${runtimeOptions.maxPages || "all"}, `
    + `maxRetries=${runtimeOptions.maxRetries}, retryBase=${runtimeOptions.retryBaseMs}ms)`
  );
  console.log("Logging into Hacker News...");
  await login(cookieJar, username, password, runtimeOptions);
  console.log("Login succeeded.");

  const submissionsResult = await scrapePaginatedResource(
    "submissions",
    `${BASE_URL}/upvoted?id=${encodeURIComponent(username)}`,
    cookieJar,
    runtimeOptions,
    (html) => {
      const submissions = parseSubmissions(html, scrapedAt);
      saveSubmissions(db, submissions);
      return submissions.length;
    },
  );
  const commentsResult = await scrapePaginatedResource(
    "comments",
    `${BASE_URL}/upvoted?id=${encodeURIComponent(username)}&comments=t`,
    cookieJar,
    runtimeOptions,
    (html) => {
      const comments = parseComments(html, scrapedAt);
      saveComments(db, comments);
      return comments.length;
    },
  );

  console.log(
    `Completed scrape: ${submissionsResult.records} submissions across ${submissionsResult.pages} pages; `
    + `${commentsResult.records} comments across ${commentsResult.pages} pages; `
    + `saved to ${runtimeOptions.dbPath}`
  );
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
