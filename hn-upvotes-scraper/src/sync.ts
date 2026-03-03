import type { Database } from "bun:sqlite";
import { parseComments, parseSubmissions, extractMoreLink } from "./parsers";
import type { CommentRecord, PageProcessResult, RuntimeOptions, ScrapeCounts, SubmissionRecord } from "./types";
import { CookieJar, requestWithRetry } from "./http";
import { clearScrapedData, hasComment, hasSubmission, saveComments, saveSubmissions } from "./db";

export function splitAtExisting<T extends { itemId: number }>(
  records: T[],
  hasExistingRecord: (itemId: number) => boolean,
): PageProcessResult & { newRecords: T[] } {
  const newRecords: T[] = [];

  for (const record of records) {
    if (hasExistingRecord(record.itemId)) {
      return { newRecords, savedCount: newRecords.length, encounteredExisting: true };
    }
    newRecords.push(record);
  }

  return { newRecords, savedCount: newRecords.length, encounteredExisting: false };
}

export async function scrapePaginatedResource(
  label: string,
  startUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  handlePage: (html: string) => PageProcessResult,
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
    const pageResult = handlePage(html);
    totalRecords += pageResult.savedCount;
    next = extractMoreLink(html);
    console.log(`[${label}] Scraped page ${pageNumber} (${pageResult.savedCount} new records, ${totalRecords} total)`);

    if (pageResult.encounteredExisting) {
      console.log(`[${label}] Found an existing record on page ${pageNumber}; stopping pagination.`);
      break;
    }
  }

  return { pages: pageNumber, records: totalRecords };
}

function processSubmissionsPage(
  db: Database,
  submissions: SubmissionRecord[],
  runtimeOptions: RuntimeOptions,
): PageProcessResult {
  const pageResult = runtimeOptions.refresh
    ? { newRecords: submissions, savedCount: submissions.length, encounteredExisting: false }
    : splitAtExisting(submissions, (itemId) => hasSubmission(db, itemId));

  if (pageResult.newRecords.length > 0) {
    saveSubmissions(db, pageResult.newRecords);
  }

  return { savedCount: pageResult.savedCount, encounteredExisting: pageResult.encounteredExisting };
}

function processCommentsPage(
  db: Database,
  comments: CommentRecord[],
  runtimeOptions: RuntimeOptions,
): PageProcessResult {
  const pageResult = runtimeOptions.refresh
    ? { newRecords: comments, savedCount: comments.length, encounteredExisting: false }
    : splitAtExisting(comments, (itemId) => hasComment(db, itemId));

  if (pageResult.newRecords.length > 0) {
    saveComments(db, pageResult.newRecords);
  }

  return { savedCount: pageResult.savedCount, encounteredExisting: pageResult.encounteredExisting };
}

export async function syncUpvotes(
  db: Database,
  cookieJar: CookieJar,
  username: string,
  scrapedAt: string,
  runtimeOptions: RuntimeOptions,
): Promise<{ submissions: ScrapeCounts; comments: ScrapeCounts }> {
  if (runtimeOptions.refresh) {
    console.log("Refresh mode enabled: clearing existing scraper data.");
    clearScrapedData(db);
  }

  const submissions = await scrapePaginatedResource(
    "submissions",
    `https://news.ycombinator.com/upvoted?id=${encodeURIComponent(username)}`,
    cookieJar,
    runtimeOptions,
    (html) => processSubmissionsPage(db, parseSubmissions(html, scrapedAt), runtimeOptions),
  );

  const comments = await scrapePaginatedResource(
    "comments",
    `https://news.ycombinator.com/upvoted?id=${encodeURIComponent(username)}&comments=t`,
    cookieJar,
    runtimeOptions,
    (html) => processCommentsPage(db, parseComments(html, scrapedAt), runtimeOptions),
  );

  return { submissions, comments };
}
