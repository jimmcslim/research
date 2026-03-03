import { readFileSync } from "node:fs";

const BASE_URL = "https://news.ycombinator.com";
for (const line of readFileSync("/Users/jim/src/research/hn-upvotes-scraper/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const username = process.env.HN_USERNAME;
const password = process.env.HN_PASSWORD;

class CookieJar {
  cookies = new Map();
  addFromResponse(headers) {
    const getSetCookie = headers.getSetCookie;
    const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(";");
      const [name, ...rest] = nameValue.split("=");
      if (!name || rest.length === 0) continue;
      this.cookies.set(name.trim(), rest.join("=").trim());
    }
  }
  headerValue() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  }
}
function htmlDecode(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function absoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${BASE_URL}/${url.replace(/^\//, "")}`;
}
function extractMoreLink(html) {
  const match = html.match(/<a\s+[^>]*class=["'][^"']*morelink[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*morelink[^"']*["']/i);
  return match ? absoluteUrl(htmlDecode(match[1])) : null;
}
async function request(pathOrUrl, cookieJar, init = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  console.log("REQ", init.method || "GET", url);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  cookieJar.addFromResponse(res.headers);
  console.log("RES", res.status, res.headers.get("location") || "");
  return res;
}
async function login(cookieJar, username, password) {
  const loginPage = await request("/login", cookieJar, { method: "GET" });
  const loginHtml = await loginPage.text();
  const form = new URLSearchParams();
  const fnidMatch = loginHtml.match(/<input\s+[^>]*name=['"]fnid['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]fnid['"]/i);
  const gotoMatch = loginHtml.match(/<input\s+[^>]*name=['"]goto['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]goto['"]/i);
  if (fnidMatch?.[1]) form.set("fnid", fnidMatch[1]);
  form.set("goto", gotoMatch?.[1] || "news");
  form.set("acct", username);
  form.set("pw", password);
  const loginRes = await request("/login", cookieJar, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const location = loginRes.headers.get("location") || "";
  if (loginRes.status !== 302 || location.includes("login")) throw new Error("login failed");
  await request(location.startsWith("http") ? location : `${BASE_URL}${location}`, cookieJar, { method: "GET" });
}
async function fetchAllPages(startUrl, cookieJar) {
  const pages = [];
  let next = startUrl;
  while (next) {
    const res = await request(next, cookieJar, { method: "GET" });
    const html = await res.text();
    pages.push(html);
    next = extractMoreLink(html);
    console.log("NEXT", next || "<none>");
  }
  return pages;
}
const jar = new CookieJar();
await login(jar, username, password);
await fetchAllPages(`${BASE_URL}/upvoted?id=${encodeURIComponent(username)}`, jar);
await fetchAllPages(`${BASE_URL}/upvoted?id=${encodeURIComponent(username)}&comments=t`, jar);
