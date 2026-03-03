# Notes

- Started: 2026-03-03 10:40:54 AEST
- Goal: Get hn-upvotes-scraper working

## 2026-03-03 10:41:02 AEST
- Created investigation folder and started source inspection.

## 2026-03-03 10:41:08 AEST
- Reviewed package metadata and current scraper implementation.
- Planned to reproduce the failure by running the Bun entrypoint.

## 2026-03-03 10:41:24 AEST
- Reproduced failure: `bun run scrape` exits with `Unable to connect. Is the computer able to access the url?` before any login/parsing logic completes.
- This points to network access from the execution environment, not an immediate code syntax/runtime error.

## 2026-03-03 10:41:47 AEST
- Retried with escalated permissions; same network error from Bun fetch.
- Next step: verify whether outbound access to Hacker News works with curl, to separate machine connectivity from Bun-specific behavior.

## 2026-03-03 10:42:28 AEST
- Verified Bun can GET `https://news.ycombinator.com/login` successfully.
- Investigating the login POST and any follow-on request that triggers the connect error.

## 2026-03-03 10:44:50 AEST
- Identified root cause with an instrumented probe: the login redirect returned `news`, and the scraper formed `https://news.ycombinator.comnews`.
- Patched URL handling to resolve all relative URLs through `new URL(..., BASE_URL)`.

## 2026-03-03 10:47:18 AEST
- Validation run after the URL fix completed successfully against HN, but stored `0` submissions and `0` comments.
- Next check: determine whether the account has no upvotes or the regex selectors no longer match current HN markup.

## 2026-03-03 10:50:02 AEST
- Live markup inspection showed comment entries are now `tr.athing` rows, not `tr.comtr`.
- Updated comment extraction to parse `<div class="commtext ...">` and use `span.onstory` for the parent item link.

## 2026-03-03 10:52:29 AEST
- Verified the updated comment parser against the first live page: 30 records parsed.
- Saved a focused repo diff and wrote the final investigation report.

## 2026-03-03 10:52:52 AEST
- Rewrote README.md after a placeholder write left it incomplete.

## 2026-03-03 12:42:08 AEST
- User requested direct follow-up changes in the original repo: ignore the SQLite DB, scrape/write per page, remove transaction batching, and add progress logging.

## 2026-03-03 17:56:39 AEST
- Added `.gitignore` for `hn-upvotes.sqlite`.
- Reworked the scraper to fetch, parse, and persist one page at a time, with cumulative page/record logging.
- Removed the array-level SQLite transaction wrappers from submission/comment upserts.

## 2026-03-03 20:29:36 AEST
- User requested retry/backoff and a max-pages option in the original scraper.

## 2026-03-03 20:30:19 AEST
- Added `HN_MAX_PAGES`, `HN_MAX_RETRIES`, and `HN_RETRY_BASE_MS`.
- Implemented retry/backoff for request errors, 429s, and 5xx responses, with `Retry-After` support.

## 2026-03-03 20:32:57 AEST
- User requested that only credentials remain in environment variables; all other runtime controls should move to CLI arguments.

## 2026-03-03 20:34:04 AEST
- Moved non-credential runtime settings from environment variables to CLI flags (`--db-path`, `--request-delay-ms`, `--max-pages`, `--max-retries`, `--retry-base-ms`).
- Restricted `.env` loading to `HN_USERNAME` and `HN_PASSWORD` only.

## 2026-03-03 20:36:37 AEST
- User requested a `--help` CLI argument.

## 2026-03-03 20:36:56 AEST
- Added `--help` with usage text and made it return before credential validation or network work.

## 2026-03-03 20:44:08 AEST
- User supplied a saved `sample.html` from the submissions page to debug why submission parsing returns zero rows.

## 2026-03-03 20:44:29 AEST
- Root cause for zero submission rows: the parser required `class="athing"` exactly, but live submission rows are `class="athing submission"`.
- Relaxed both submission and comment row regexes to match `athing` as a class token instead of an exact class value.
