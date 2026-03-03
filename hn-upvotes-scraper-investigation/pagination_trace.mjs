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
function extractMoreLink(html) {
  const match = html.match(/<a\s+[^>]*class=["'][^"']*morelink[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*morelink[^"']*["']/i);
  return match ? new URL(match[1].replace(/&amp;/g, '&'), `${BASE_URL}/`).toString() : null;
}
await req('/login').then(r => r.text());
const form = new URLSearchParams({ goto: 'news', acct: username, pw: password });
const loginRes = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
await req(loginRes.headers.get('location') || 'news');
let next = `/upvoted?id=${encodeURIComponent(username)}&comments=t`;
for (let i = 0; i < 5 && next; i++) {
  const res = await req(next);
  const html = await res.text();
  const extracted = extractMoreLink(html);
  console.log(i + 1, new URL(next, `${BASE_URL}/`).toString(), '=>', extracted || '<none>', 'athing', (html.match(/class=["']athing["']/g) || []).length);
  next = extracted;
}
