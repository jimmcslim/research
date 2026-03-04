import type { RuntimeOptions } from "./types";

export function printHelp(): void {
  console.log(`HN Upvoted Scraper

Usage:
  bun run scrape -- [options]

Credentials:
  Provide credentials via environment variables or .env only:
    HN_USERNAME
    HN_PASSWORD

Options:
  --db-path <path>            SQLite output path (default: hn-upvotes.sqlite)
  --request-delay-ms <ms>     Delay before each request (default: 1000)
  --max-pages <count>         Maximum pages per resource, 0 = unlimited (default: 0)
  --max-retries <count>       Retries for 429/5xx/network errors (default: 3)
  --retry-base-ms <ms>        Base retry backoff in milliseconds (default: 2000)
  --refresh                   Delete existing scraper data and rescrape everything
  --help                      Show this help text
`);
}

export function parseCliArgs(argv: string[]): RuntimeOptions {
  const options: RuntimeOptions = {
    dbPath: "hn-upvotes.sqlite",
    requestDelayMs: 1000,
    maxPages: 0,
    maxRetries: 3,
    retryBaseMs: 2000,
    refresh: false,
    showHelp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = argv[i + 1];

    if (arg === "--help") {
      options.showHelp = true;
      continue;
    }
    if (arg === "--refresh") {
      options.refresh = true;
      continue;
    }
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

export function validateRuntimeOptions(options: RuntimeOptions): void {
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
