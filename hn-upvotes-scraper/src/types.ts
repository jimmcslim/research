export type SubmissionRecord = {
  itemId: number;
  title: string;
  sourceUrl: string | null;
  itemUrl: string | null;
  points: number | null;
  submittedBy: string | null;
  submittedAt: string | null;
  commentsCount: number | null;
  scrapedAt: string;
};

export type CommentRecord = {
  itemId: number;
  submittedBy: string | null;
  submittedAt: string | null;
  itemUrl: string | null;
  commentHtml: string;
  commentText: string;
  parentItemUrl: string | null;
  scrapedAt: string;
};

export type ScrapeCounts = {
  pages: number;
  records: number;
};

export type PageProcessResult = {
  savedCount: number;
  encounteredExisting: boolean;
};

export type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  label: string;
};

export type RuntimeOptions = {
  dbPath: string;
  requestDelayMs: number;
  maxPages: number;
  maxRetries: number;
  retryBaseMs: number;
  refresh: boolean;
  showHelp: boolean;
};
