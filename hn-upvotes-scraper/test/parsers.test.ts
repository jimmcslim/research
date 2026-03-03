import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractMoreLink, parseComments, parseSubmissions } from "../src/parsers";

const submissionsHtml = readFileSync(join(import.meta.dir, "..", "sample.html"), "utf8");
const commentsHtml = readFileSync(join(import.meta.dir, "sample-comments.html"), "utf8");
const scrapedAt = "2026-03-03T00:00:00.000Z";

describe("parseSubmissions", () => {
  test("parses submissions fixture records", () => {
    const records = parseSubmissions(submissionsHtml, scrapedAt);
    expect(records.length).toBe(30);
    expect(records[0]?.itemId).toBe(47038318);
    expect(records[1]?.itemId).toBe(47040781);
    expect(records[0]?.sourceUrl).toBe("https://jkap.io/token-anxiety-or-a-slot-machine-by-any-other-name/");
    expect(records[0]?.itemUrl).toBe("https://news.ycombinator.com/item?id=47038318");
    expect(records[0]?.submittedBy).toBe("presbyterian");
    expect(records[10]?.submittedBy).toBe("xx123122");
    expect(records[22]?.submittedBy).toBe("jinkuan");
    expect(records[0]?.submittedAt).toBe("2026-02-16T18:23:36");
    expect(records[0]?.commentsCount).toBe(230);
  });

  test("extracts pagination more link", () => {
    expect(extractMoreLink(submissionsHtml)).toBe("https://news.ycombinator.com/upvoted?id=jimmcslim&p=3");
  });
});

describe("parseComments", () => {
  test("parses comments fixture records", () => {
    const records = parseComments(commentsHtml, scrapedAt);
    expect(records.length).toBe(2);
    expect(records[0]?.itemId).toBe(47214629);
    expect(records[0]?.submittedBy).toBe("jedberg");
    expect(records[1]?.submittedBy).toBe("javier123454321");
    expect(records[0]?.submittedAt).toBe("2026-03-02T06:44:08");
    expect(records[0]?.itemUrl).toBe("https://news.ycombinator.com/item?id=47214629");
    expect(records[0]?.parentItemUrl).toBe("https://news.ycombinator.com/item?id=47212355");
    expect(records[0]?.commentHtml).toContain("project.md");
    expect(records[0]?.commentText).toContain("project.md");
    expect(extractMoreLink(commentsHtml)).toBe("https://news.ycombinator.com/upvoted?id=jimmcslim&comments=t&p=2");
  });
});
