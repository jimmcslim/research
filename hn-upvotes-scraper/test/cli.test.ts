import { describe, expect, test } from "bun:test";
import { parseCliArgs, validateRuntimeOptions } from "../src/cli";

describe("parseCliArgs", () => {
  test("returns defaults", () => {
    expect(parseCliArgs([])).toEqual({
      dbPath: "hn-upvotes.sqlite",
      requestDelayMs: 1000,
      maxPages: 0,
      maxRetries: 3,
      retryBaseMs: 2000,
      refresh: false,
      showHelp: false,
    });
  });

  test("parses flags", () => {
    expect(parseCliArgs([
      "--db-path", "/tmp/test.sqlite",
      "--request-delay-ms", "25",
      "--max-pages", "4",
      "--max-retries", "2",
      "--retry-base-ms", "100",
      "--refresh",
      "--help",
    ])).toEqual({
      dbPath: "/tmp/test.sqlite",
      requestDelayMs: 25,
      maxPages: 4,
      maxRetries: 2,
      retryBaseMs: 100,
      refresh: true,
      showHelp: true,
    });
  });

  test("throws on unknown arg", () => {
    expect(() => parseCliArgs(["--bogus"])).toThrow("Unknown argument");
  });

  test("throws on missing value", () => {
    expect(() => parseCliArgs(["--max-pages"])).toThrow("Missing value for --max-pages");
  });
});

describe("validateRuntimeOptions", () => {
  test("rejects negative values", () => {
    expect(() => validateRuntimeOptions({
      dbPath: "x",
      requestDelayMs: -1,
      maxPages: 0,
      maxRetries: 0,
      retryBaseMs: 0,
      refresh: false,
      showHelp: false,
    })).toThrow("--request-delay-ms must be a number >= 0.");
  });
});
