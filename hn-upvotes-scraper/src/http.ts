import type { RetryOptions, RuntimeOptions } from "./types";

export const BASE_URL = "https://news.ycombinator.com";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(headers: Headers) {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function"
      ? getSetCookie.call(headers)
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];

    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(";");
      const [name, ...rest] = nameValue.split("=");
      if (!name || rest.length === 0) continue;
      this.cookies.set(name.trim(), rest.join("=").trim());
    }
  }

  headerValue(): string {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

export function absoluteUrl(url: string | null): string | null {
  if (!url) return null;
  return new URL(url, `${BASE_URL}/`).toString();
}

export function getRetryDelayMs(res: Response | null, attempt: number, baseDelayMs: number): number {
  const retryAfter = res?.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  return baseDelayMs * Math.max(1, 2 ** Math.max(0, attempt - 1));
}

export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function request(
  pathOrUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  init: RequestInit = {},
): Promise<Response> {
  if (runtimeOptions.requestDelayMs > 0) {
    await sleep(runtimeOptions.requestDelayMs);
  }

  const url = new URL(pathOrUrl, `${BASE_URL}/`).toString();
  const headers = new Headers(init.headers);
  const cookieHeader = cookieJar.headerValue();
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const res = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
  });
  cookieJar.addFromResponse(res.headers);
  return res;
}

export async function requestWithRetry(
  pathOrUrl: string,
  cookieJar: CookieJar,
  runtimeOptions: RuntimeOptions,
  init: RequestInit,
  options: RetryOptions,
): Promise<Response> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      const res = await request(pathOrUrl, cookieJar, runtimeOptions, init);
      if (!shouldRetryStatus(res.status) || attempt > options.retries) {
        return res;
      }

      const retryDelayMs = getRetryDelayMs(res, attempt, options.baseDelayMs);
      console.log(
        `[${options.label}] HTTP ${res.status} on attempt ${attempt}/${options.retries + 1}; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    } catch (error) {
      if (attempt > options.retries) {
        throw error;
      }

      const retryDelayMs = getRetryDelayMs(null, attempt, options.baseDelayMs);
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[${options.label}] Request error on attempt ${attempt}/${options.retries + 1}: ${message}; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    }
  }
}
