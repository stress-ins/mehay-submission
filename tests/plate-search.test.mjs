import test from "node:test";
import assert from "node:assert/strict";
import { plateMatches } from "../src/plateSearch.ts";

test("display, storage and mixed keyboard plates identify the same vehicle", () => {
  for (const query of ["Т123СТ99", "T123CT99", "Т 123 СТ 99", "Т123CТ99", "123-ст"]) {
    assert.equal(plateMatches("T123CT99", query), true, query);
  }
  for (const query of ["", " - ", "T124CT99", "Иван"]) assert.equal(plateMatches("T123CT99", query), false);
});
