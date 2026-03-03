import { readFileSync } from "node:fs";

for (const line of readFileSync("/Users/jim/src/research/hn-upvotes-scraper/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const username = process.env.HN_USERNAME;
const password = process.env.HN_PASSWORD;
if (!username || !password) throw new Error("missing creds");

const cookies = new Map();
const addCookie = (headers) => {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
  for (const value of raw) {
    const [pair] = value.split(";");
    const [name, ...rest] = pair.split("=");
    if (name && rest.length) cookies.set(name.trim(), rest.join("=").trim());
  }
};
const cookieHeader = () => Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

async function req(url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  addCookie(res.headers);
  const text = await res.text();
  console.log(init.method || "GET", url, res.status, res.headers.get("location") || "", text.slice(0, 80).replace(/\s+/g, " "));
  return { res, text };
}

const loginPage = await req("https://news.ycombinator.com/login");
const gotoMatch = loginPage.text.match(/<input\s+[^>]*name=["']goto["'][^>]*value=["']([^"']+)["']/i) || loginPage.text.match(/<input\s+[^>]*value=["']([^"']+)["'][^>]*name=["']goto["']/i);
const fnidMatch = loginPage.text.match(/<input\s+[^>]*name=["']fnid["'][^>]*value=["']([^"']+)["']/i) || loginPage.text.match(/<input\s+[^>]*value=["']([^"']+)["'][^>]*name=["']fnid["']/i);
const form = new URLSearchParams();
if (fnidMatch?.[1]) form.set("fnid", fnidMatch[1]);
form.set("goto", gotoMatch?.[1] || "news");
form.set("acct", username);
form.set("pw", password);
const loginRes = await req("https://news.ycombinator.com/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
const location = loginRes.res.headers.get("location") || "news";
await req(`https://news.ycombinator.com/${location.replace(/^\//, "")}`);
await req(`https://news.ycombinator.com/upvoted?id=${encodeURIComponent(username)}`);
await req(`https://news.ycombinator.com/upvoted?id=${encodeURIComponent(username)}&comments=t`);
