# HN Upvoted Scraper (Bun + TypeScript)

This folder contains a command-line scraper that logs into Hacker News, fetches your upvoted submissions and upvoted comments, and stores both in a local SQLite database.

## What it does

- Authenticates using `HN_USERNAME` and `HN_PASSWORD`
- Reads credentials from environment variables, with Bun's native `.env` support
- Parses Hacker News HTML with `cheerio`
- Supports configurable request throttling via `--request-delay-ms` (defaults to `1000`)
- Supports capped runs via `--max-pages` (defaults to unlimited)
- Supports retry/backoff via `--max-retries` and `--retry-base-ms`
- Supports full reprocessing via `--refresh`
- Scrapes:
  - `https://news.ycombinator.com/upvoted?id=<username>`
  - `https://news.ycombinator.com/upvoted?id=<username>&comments=t`
- Follows pagination (`more` links)
- Stops a resource early when it encounters an item already present in the local database
- Upserts results into SQLite tables:
  - `submissions`
  - `comments`

## Structure

- `src/index.ts` — thin entrypoint
- `src/cli.ts` — CLI options/help parsing
- `src/http.ts` — cookie jar, request, retry helpers
- `src/auth.ts` — HN login flow
- `src/parsers.ts` — pure HTML parsing with Cheerio
- `src/db.ts` — SQLite schema, migration, persistence helpers
- `src/sync.ts` — pagination and incremental sync orchestration
- `src/types.ts` — shared types
- `test/*.test.ts` — Bun tests for parser, CLI, and sync behavior

## Usage

1. Ensure Bun is installed.
2. Set credentials either via env vars:

```bash
export HN_USERNAME="your_username"
export HN_PASSWORD="your_password"
```

Or create a `.env` file in this folder:

```dotenv
HN_USERNAME=your_username
HN_PASSWORD=your_password
```

3. Run:

```bash
bun run scrape -- \
  --db-path hn-upvotes.sqlite \
  --request-delay-ms 1000 \
  --max-pages 0 \
  --max-retries 3 \
  --retry-base-ms 2000
```

To fully rebuild local scraper data:

```bash
bun run scrape -- --refresh
```

To see CLI help:

```bash
bun run scrape -- --help
```

## Runtime controls

- `--db-path`: SQLite output path
- `--request-delay-ms`: base delay before each request
- `--max-pages`: maximum pages to scrape per resource (`0` means no cap)
- `--max-retries`: retries for transient request failures / rate limits
- `--retry-base-ms`: base backoff delay in milliseconds; doubles on each retry unless `Retry-After` is present
- `--refresh`: delete existing local scraper data and process all pages again
- `--help`: print usage information

## Tests

```bash
bun run typecheck
bun test
```

The parser tests are fixture-based and validate the pure HTML-to-record functions separately from SQLite writes.

## Database schema

### `submissions`

- `item_id` (PK)
- `title`
- `source_url`
- `item_url`
- `points`
- `submitted_by`
- `submitted_at`
- `comments_count`
- `scraped_at`

### `comments`

- `item_id` (PK)
- `submitted_by`
- `submitted_at`
- `item_url`
- `comment_html`
- `comment_text`
- `parent_item_url`
- `scraped_at`

## Caveats

- Hacker News markup can change; selectors may need updates.
- If HN introduces anti-automation controls, login/scraping flow might require adjustments.
- You can increase `--request-delay-ms` to be more conservative with request rate.
- If you encounter rate limiting, increase `--request-delay-ms`, reduce `--max-pages` for test runs, or leave retry/backoff enabled.
