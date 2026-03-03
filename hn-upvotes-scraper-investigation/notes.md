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
