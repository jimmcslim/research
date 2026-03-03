import { describe, expect, test } from "bun:test";
import { splitAtExisting } from "../src/sync";

const records = [{ itemId: 1 }, { itemId: 2 }, { itemId: 3 }];

describe("splitAtExisting", () => {
  test("keeps all new records", () => {
    expect(splitAtExisting(records, () => false)).toEqual({
      newRecords: records,
      savedCount: 3,
      encounteredExisting: false,
    });
  });

  test("stops at existing record in middle", () => {
    expect(splitAtExisting(records, (itemId) => itemId === 2)).toEqual({
      newRecords: [{ itemId: 1 }],
      savedCount: 1,
      encounteredExisting: true,
    });
  });

  test("stops immediately when first exists", () => {
    expect(splitAtExisting(records, (itemId) => itemId === 1)).toEqual({
      newRecords: [],
      savedCount: 0,
      encounteredExisting: true,
    });
  });
});
