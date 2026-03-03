import type { RuntimeOptions } from "./types";
import { CookieJar, requestWithRetry } from "./http";

export async function login(
  cookieJar: CookieJar,
  username: string,
  password: string,
  runtimeOptions: RuntimeOptions,
): Promise<void> {
  const retryOptions = {
    retries: runtimeOptions.maxRetries,
    baseDelayMs: runtimeOptions.retryBaseMs,
  };

  const loginPage = await requestWithRetry("/login", cookieJar, runtimeOptions, { method: "GET" }, {
    ...retryOptions,
    label: "login",
  });
  const loginHtml = await loginPage.text();

  const form = new URLSearchParams();
  const fnidMatch = loginHtml.match(/<input\s+[^>]*name=['"]fnid['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]fnid['"]/i);
  const gotoMatch = loginHtml.match(/<input\s+[^>]*name=['"]goto['"][^>]*value=['"]([^'"]+)['"]/i)
    || loginHtml.match(/<input\s+[^>]*value=['"]([^'"]+)['"][^>]*name=['"]goto['"]/i);

  if (fnidMatch?.[1]) {
    form.set("fnid", fnidMatch[1]);
  }

  form.set("goto", gotoMatch?.[1] || "news");
  form.set("acct", username);
  form.set("pw", password);

  const loginRes = await requestWithRetry("/login", cookieJar, runtimeOptions, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }, {
    ...retryOptions,
    label: "login",
  });

  const location = loginRes.headers.get("location") || "";
  if (loginRes.status !== 302 || location.includes("login")) {
    throw new Error("Login failed. Verify HN_USERNAME and HN_PASSWORD.");
  }

  await requestWithRetry(location, cookieJar, runtimeOptions, { method: "GET" }, {
    ...retryOptions,
    label: "login",
  });
}
