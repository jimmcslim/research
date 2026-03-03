# hn-upvotes-scraper investigation

## Outcome

`hn-upvotes-scraper` had two live breakages and both are fixed in `/Users/jim/src/research/hn-upvotes-scraper/src/index.ts`.

1. Login redirect handling built invalid URLs when Hacker News returned `Location: news`, producing `https://news.ycombinator.comnews` and causing Bun to fail with `ConnectionRefused`.
2. Comment-page parsing was outdated. Current Hacker News upvoted comments pages use `tr.athing` rows with comment bodies in `<div class="commtext ...">`, not `tr.comtr` / `<span class="commtext...">`.

## Changes made

- Replaced manual relative URL concatenation with `new URL(..., BASE_URL)` in both `absoluteUrl()` and `request()`.
- Updated the post-login redirect follow-up to pass the raw `Location` value through the common request helper.
- Updated comment parsing selectors to:
  - match `tr.athing` rows
  - extract comment HTML from `div` or `span` elements carrying `commtext`
  - extract the parent story URL from `span.onstory`

## Validation

Live checks against Hacker News succeeded:

- Minimal Bun probes confirmed:
  - `GET /login` returned `200`
  - `POST /login` returned `302`
  - authenticated `GET /upvoted` and `GET /upvoted?comments=t` returned `200`
- Pagination trace for comments advanced correctly across pages (`p=1` -> `p=2` -> `p=3` ...).
- A one-page parse probe on the live comments page produced `30` comment records with plausible fields.

A full `bun run scrape` now gets past the previous connection failure. Depending on account history, the complete scrape can take a while because it walks all paginated comment pages.

## Files

- `notes.md`: running investigation log
- `hn-upvotes-scraper.diff`: patch against the modified repo
