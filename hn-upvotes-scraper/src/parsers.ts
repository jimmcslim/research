import { load } from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { CommentRecord, SubmissionRecord } from "./types";
import { absoluteUrl } from "./http";

export function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function normalizeText(value: string): string {
  return htmlDecode(value.replace(/\s+/g, " ").trim());
}

export function extractMoreLink(html: string): string | null {
  const $ = load(html);
  const href = $("a.morelink").first().attr("href");
  return absoluteUrl(href ?? null);
}

function extractSubmittedAt(ageEl: Cheerio<AnyNode>): string | null {
  const title = ageEl.attr("title");
  if (!title) return null;
  return title.trim().split(/\s+/)[0] || null;
}

function parseCommentsCount(text: string): number | null {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("discuss")) return 0;
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function parseSubmissions(html: string, scrapedAt: string): SubmissionRecord[] {
  const $ = load(html);
  const records: SubmissionRecord[] = [];

  $("tr.athing").each((_, element) => {
    const row = $(element);
    const itemId = Number(row.attr("id"));
    if (!itemId || row.find(".titleline").length === 0) return;

    const subtextRow = row.nextAll("tr").filter((_, tr) => $(tr).find("td.subtext").length > 0).first();
    if (subtextRow.length === 0) return;

    const titleLink = row.find(".titleline > a").first();
    const subtext = subtextRow.find("td.subtext").first();
    const ageLink = subtext.find(".age a[href^='item?id=']").first();
    const age = subtext.find(".age").first();
    const commentsLink = subtext.find("a[href^='item?id=']").last();

    records.push({
      itemId,
      title: normalizeText(titleLink.text()) || "(untitled)",
      sourceUrl: absoluteUrl(titleLink.attr("href") ?? null),
      itemUrl: absoluteUrl(ageLink.attr("href") ?? `item?id=${itemId}`),
      points: (() => {
        const scoreText = normalizeText(subtext.find(".score").first().text());
        const match = scoreText.match(/\d+/);
        return match ? Number(match[0]) : null;
      })(),
      submittedBy: normalizeText(subtext.find("a.hnuser").first().text()) || null,
      submittedAt: extractSubmittedAt(age),
      commentsCount: parseCommentsCount(commentsLink.text()),
      scrapedAt,
    });
  });

  return records;
}

export function parseComments(html: string, scrapedAt: string): CommentRecord[] {
  const $ = load(html);
  const records: CommentRecord[] = [];

  $("tr.athing").each((_, element) => {
    const row = $(element);
    const itemId = Number(row.attr("id"));
    if (!itemId) return;

    const commtext = row.find(".commtext").first();
    if (commtext.length === 0) return;

    const ageLink = row.find(".age a[href^='item?id=']").first();
    const age = row.find(".age").first();
    const onStory = row.find(".onstory a[href^='item?id=']").first();
    const commentHtml = commtext.html()?.trim() ?? "";

    records.push({
      itemId,
      submittedBy: normalizeText(row.find("a.hnuser").first().text()) || null,
      submittedAt: extractSubmittedAt(age),
      itemUrl: absoluteUrl(ageLink.attr("href") ?? null),
      commentHtml,
      commentText: normalizeText(commtext.text()),
      parentItemUrl: absoluteUrl(onStory.attr("href") ?? null),
      scrapedAt,
    });
  });

  return records;
}
