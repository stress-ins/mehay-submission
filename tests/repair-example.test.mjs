import test from "node:test";
import assert from "node:assert/strict";
import { repairExample } from "../src/repairExample.ts";

test("diagnosis and voice suggestions never use a part or hours from a different engine", () => {
  const otherEngine = { match: "similar", part: "Свеча зажигания", plannedHours: 4, actualHours: 20 };
  assert.equal(repairExample([otherEngine]), undefined);
  assert.equal(repairExample([otherEngine], { includeSimilar: true }), otherEngine);
  const sameVehicle = { match: "vehicle", plannedHours: 4, actualHours: 5 };
  const delayed = { match: "engine", plannedHours: 4, actualHours: 12 };
  assert.equal(repairExample([otherEngine, sameVehicle, delayed]), delayed);
  assert.equal(repairExample([]), undefined);
});
