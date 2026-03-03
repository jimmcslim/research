# HN Upvoted Scraper (Bun + TypeScript)

This folder contains a command-line scraper that logs into Hacker News, fetches your upvoted submissions and upvoted comments, and stores both in a local SQLite database.

## What it does

- Authenticates using `HN_USERNAME` and `HN_PASSWORD`
- Reads credentials from environment variables and also from `.env`
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

## Implementation details

- Runtime: **Bun**
- Language: **TypeScript**
- Storage: **SQLite via `bun:sqlite`**
- Parsing: lightweight HTML extraction with resilient regex selectors tuned for HN markup
- Auth/session handling: custom cookie jar over `fetch`
- Login handling: supports current HN login form where hidden `fnid` may be absent; includes it when present

## Research notes on existing libraries/tools

I investigated the request for libraries specific to scraping HN upvoted content and the linked gist (`VehpuS/d70dc3669d96da953c7a4f9f6665e83d`).

- In this execution environment, outbound HTTP requests to HN/Gist returned `403 Forbidden`, so I could not directly inspect the gist contents live.
- Based on known ecosystem patterns, there is no widely used dedicated package specifically for **authenticated** scraping of HN upvoted submissions/comments.
- Most available HN packages target Algolia’s public search API or generic HN data APIs, which do not expose private authenticated “upvoted” pages.
- Given that limitation, this implementation uses direct session-authenticated scraping of HN HTML pages.

## Files

- `src/index.ts` — scraper CLI implementation
- `package.json` — Bun script (`bun run scrape`)
- `tsconfig.json` — TypeScript config
- `notes.md` — running investigation notes

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
  --retry-base-ms 2000 \
  --refresh
```

To see CLI help:

```bash
bun run scrape -- --help
```

4. Inspect resulting SQLite file (`hn-upvotes.sqlite` by default).

### Runtime controls

- `--db-path`: SQLite output path
- `--request-delay-ms`: base delay before each request
- `--max-pages`: maximum pages to scrape per resource (`0` means no cap)
- `--max-retries`: retries for transient request failures / rate limits
- `--retry-base-ms`: base backoff delay in milliseconds; doubles on each retry unless `Retry-After` is present
- `--refresh`: delete existing local scraper data and process all pages again
- `--help`: print usage information

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
