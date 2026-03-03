import { login } from "./auth";
import { parseCliArgs, printHelp, validateRuntimeOptions } from "./cli";
import { initDb } from "./db";
import { loadCredentialsFromDotEnv } from "./env";
import { CookieJar } from "./http";
import { syncUpvotes } from "./sync";

async function main() {
  await loadCredentialsFromDotEnv();
  const runtimeOptions = parseCliArgs(process.argv.slice(2));
  if (runtimeOptions.showHelp) {
    printHelp();
    return;
  }
  validateRuntimeOptions(runtimeOptions);

  const username = process.env.HN_USERNAME;
  const password = process.env.HN_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing HN_USERNAME or HN_PASSWORD. Set env vars or provide them in a .env file.");
  }

  const cookieJar = new CookieJar();
  const db = initDb(runtimeOptions.dbPath);
  const scrapedAt = new Date().toISOString();

  console.log(
    `Starting scrape for HN user ${username} -> ${runtimeOptions.dbPath} `
    + `(delay=${runtimeOptions.requestDelayMs}ms, maxPages=${runtimeOptions.maxPages || "all"}, `
    + `maxRetries=${runtimeOptions.maxRetries}, retryBase=${runtimeOptions.retryBaseMs}ms, `
    + `refresh=${runtimeOptions.refresh ? "true" : "false"})`,
  );
  console.log("Logging into Hacker News...");
  await login(cookieJar, username, password, runtimeOptions);
  console.log("Login succeeded.");

  const result = await syncUpvotes(db, cookieJar, username, scrapedAt, runtimeOptions);

  console.log(
    `Completed scrape: ${result.submissions.records} submissions across ${result.submissions.pages} pages; `
    + `${result.comments.records} comments across ${result.comments.pages} pages; `
    + `saved to ${runtimeOptions.dbPath}`,
  );
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
