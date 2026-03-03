# Notes

- Created investigation folder `hn-upvotes-scraper` per AGENTS.md.
- Goal: Bun + TypeScript CLI to log into Hacker News and scrape upvoted submissions/comments into SQLite.
- Attempted to fetch Hacker News/Gist pages for live structure verification, but outbound HTTP is blocked with `403 Forbidden` in this environment.
- Proceeding with static implementation based on known HN HTML structure and resilient selectors.
- Implemented Bun TypeScript CLI in `src/index.ts` with custom cookie jar, login flow, pagination, parsers, and SQLite upserts.
- Added README report with usage, schema, and library research summary.
- Found and fixed `.env` loading bug when file is absent (`ENOENT`); now handled gracefully.
- Tried running `bunx tsc --noEmit` for type-checking; blocked by missing `bun-types` package and npm registry access denied (`403`).
- Added configurable request throttling via `HN_REQUEST_DELAY_MS` (default 1000ms) to reduce load on Hacker News.
- Replaced `DOMParser` usage with regex-based parsing so the CLI works in Bun runtime without extra dependencies.
- Confirmed script now proceeds past runtime startup; with placeholder creds it reaches login page parsing and fails as expected in this environment.
