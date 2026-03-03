import { readFileSync } from 'node:fs';
const BASE_URL = 'https://news.ycombinator.com';
for (const line of readFileSync('/Users/jim/src/research/hn-upvotes-scraper/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const username = process.env.HN_USERNAME;
const password = process.env.HN_PASSWORD;
const cookies = new Map();
const add = (headers) => {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const value of raw) {
    const [pair] = value.split(';');
    const [name, ...rest] = pair.split('=');
    if (name && rest.length) cookies.set(name.trim(), rest.join('=').trim());
  }
};
const header = () => Array.from(cookies.entries()).map(([k,v]) => `${k}=${v}`).join('; ');
async function req(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (header()) headers.set('cookie', header());
  const res = await fetch(new URL(url, `${BASE_URL}/`).toString(), { ...init, headers, redirect: 'manual' });
  add(res.headers);
  return res;
}
function htmlDecode(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripTags(value) {
  return htmlDecode(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
function parseComments(html) {
  const records = [];
  const commentRegex = /<tr\s+class=['"]athing['"][^>]*id=['"](\d+)['"][\s\S]*?<\/tr>/gi;
  for (const match of html.matchAll(commentRegex)) {
    const block = match[0];
    const itemId = Number(match[1]);
    const authorMatch = block.match(/<a\s+href=['"]user\?id=[^'"]+['"][^>]*class=['"]hnuser['"][^>]*>([^<]+)<\/a>/i);
    const ageMatch = block.match(/<span\s+class=['"]age['"][\s\S]*?<a\s+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/i);
    const commtextMatch = block.match(/<(?:div|span)\s+class=['"][^'"]*commtext[^'"]*['"][^>]*>([\s\S]*?)<\/(?:div|span)>/i);
    const parentItemMatch = block.match(/<span\s+class=['"]onstory['"][\s\S]*?<a\s+href=['"](item\?id=\d+)['"][^>]*>/i);
    const commentHtml = commtextMatch ? commtextMatch[1].trim() : '';
    records.push({ itemId, author: authorMatch?.[1] || null, ageText: ageMatch?.[2] || null, parentItemUrl: parentItemMatch ? new URL(parentItemMatch[1], `${BASE_URL}/`).toString() : null, commentText: stripTags(commentHtml).slice(0,80) });
  }
  return records;
}
await req('/login').then(r => r.text());
const form = new URLSearchParams({ goto: 'news', acct: username, pw: password });
const loginRes = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
await req(loginRes.headers.get('location') || 'news');
const html = await req(`/upvoted?id=${encodeURIComponent(username)}&comments=t`).then(r => r.text());
const records = parseComments(html);
console.log('parsed', records.length);
console.log(JSON.stringify(records.slice(0, 3), null, 2));
