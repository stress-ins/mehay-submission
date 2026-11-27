import test from "node:test";
import assert from "node:assert/strict";
import { fleetReviewSearchMatches } from "../src/fleetReviewSearch.ts";

const vehicle = { plate: "T123CT99", model: "Ford Transit" };
const tickets = [{ title: "Replace brake pads", id: "REQ-42" }];

test("attention queue search matches normalized plates, vehicle names, request titles and IDs", () => {
  for (const query of ["Т 123 СТ 99", "t123ct99", "fordtransit", "brake pads", "req42"]) {
    assert.equal(fleetReviewSearchMatches(vehicle, tickets, query), true, query);
  }
  assert.equal(fleetReviewSearchMatches(vehicle, tickets, "REQ-99"), false);
  assert.equal(fleetReviewSearchMatches(vehicle, tickets, "  "), true);
});
