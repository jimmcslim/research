import { readFileSync } from "node:fs";
const BASE_URL = "https://news.ycombinator.com";
for (const line of readFileSync("/Users/jim/src/research/hn-upvotes-scraper/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const username = process.env.HN_USERNAME;
const password = process.env.HN_PASSWORD;
const cookies = new Map();
const add = (headers) => {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
  for (const value of raw) {
    const [pair] = value.split(";");
    const [name, ...rest] = pair.split("=");
    if (name && rest.length) cookies.set(name.trim(), rest.join("=").trim());
  }
};
const header = () => Array.from(cookies.entries()).map(([k,v]) => `${k}=${v}`).join("; ");
async function req(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (header()) headers.set("cookie", header());
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  add(res.headers);
  return res;
}
const loginPage = await req(`${BASE_URL}/login`);
const loginHtml = await loginPage.text();
const form = new URLSearchParams();
form.set("goto", "news");
form.set("acct", username);
form.set("pw", password);
const loginRes = await req(`${BASE_URL}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
await req(new URL(loginRes.headers.get("location") || "news", `${BASE_URL}/`).toString());
for (const suffix of [`/upvoted?id=${encodeURIComponent(username)}`, `/upvoted?id=${encodeURIComponent(username)}&comments=t`]) {
  const res = await req(`${BASE_URL}${suffix}`);
  const text = await res.text();
  console.log("URL", suffix, "status", res.status, "athing", (text.match(/class=['\"]athing['\"]/g) || []).length, "comtr", (text.match(/class=['\"]comtr['\"]/g) || []).length, "more", /morelink/.test(text));
  console.log(text.slice(0, 500).replace(/\s+/g, " "));
}
