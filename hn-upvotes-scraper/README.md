# HN Upvoted Scraper (Bun + TypeScript)

This folder contains a command-line scraper that logs into Hacker News, fetches your upvoted submissions and upvoted comments, and stores both in a local SQLite database.

## What it does

- Authenticates using `HN_USERNAME` and `HN_PASSWORD`
- Reads credentials from environment variables and also from `.env`
- Scrapes:
  - `https://news.ycombinator.com/upvoted?id=<username>`
  - `https://news.ycombinator.com/upvoted?id=<username>&comments=t`
- Follows pagination (`more` links)
- Upserts results into SQLite tables:
  - `submissions`
  - `comments`

## Implementation details

- Runtime: **Bun**
- Language: **TypeScript**
- Storage: **SQLite via `bun:sqlite`**
- Parsing: Built-in `DOMParser` for HTML parsing
- Auth/session handling: custom cookie jar over `fetch`

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
# optional
HN_DB_PATH=hn-upvotes.sqlite
```

3. Run:

```bash
bun run scrape
```

4. Inspect resulting SQLite file (`hn-upvotes.sqlite` by default).

## Database schema

### `submissions`

- `item_id` (PK)
- `title`
- `item_url`
- `hn_item_url`
- `points`
- `author`
- `age_text`
- `age_url`
- `comments_count`
- `scraped_at`

### `comments`

- `item_id` (PK)
- `author`
- `age_text`
- `age_url`
- `comment_html`
- `comment_text`
- `parent_item_url`
- `scraped_at`

## Caveats

- Hacker News markup can change; selectors may need updates.
- If HN introduces anti-automation controls, login/scraping flow might require adjustments.
