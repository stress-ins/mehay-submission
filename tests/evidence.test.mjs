import test from "node:test";
import assert from "node:assert/strict";
import { assistantHistoryForRequest, citedRecordForMarker, readRecordTarget, recordReturnPath, resolveRecord } from "../src/evidence.ts";

test("conversation transport stays bounded when prior answers contain large evidence registries", () => {
  const evidence = { records: Array.from({ length: 100 }, (_, id) => ({ id, summary: "я".repeat(500) })) };
  const history = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `Сообщение ${index}`, evidence, sources: [{ url: "https://example.test" }], metadata: "display only" }));
  assert.ok(Buffer.byteLength(JSON.stringify(history.slice(-12))) > 256 * 1024);
  const payload = assistantHistoryForRequest(history);
  assert.equal(payload.length, 12);
  assert.deepEqual(payload[0], { role: "user", content: "Сообщение 2" });
  assert.ok(payload.every((message) => Object.keys(message).sort().join() === "content,role"));
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 1024);
  assert.equal(history[0].evidence, evidence);
});

test("conversation transport clips each message at the server content limit", () => {
  const exactLimit = "x".repeat(3000);
  const overLimit = "y".repeat(3001);
  const history = [
    { role: "user", content: exactLimit },
    { role: "assistant", content: overLimit },
    { role: "user", content: "next question" },
  ];

  const payload = assistantHistoryForRequest(history);

  assert.deepEqual(payload, [
    { role: "user", content: exactLimit },
    { role: "assistant", content: overLimit.slice(0, 3000) },
    { role: "user", content: "next question" },
  ]);
  assert.equal(history[1].content, overLimit);
});

test("record links accept only bounded, recognized identifiers and sanitize auth return URLs", () => {
  const valid = "?vehicle=v1&record=request&id=r1&redirect=https%3A%2F%2Fevil.test";
  assert.deepEqual(readRecordTarget(valid), { vehicleId: "v1", kind: "request", recordId: "r1" });
  assert.equal(recordReturnPath(valid, "/mehay/app"), "/mehay/app?vehicle=v1&record=request&id=r1");
  assert.equal(readRecordTarget("?vehicle=v1&record=unknown&id=r1"), null);
  assert.equal(recordReturnPath("?vehicle=v1&record=unknown&id=r1", "/app"), "/app");
  assert.equal(readRecordTarget(`?vehicle=${"x".repeat(201)}&record=note&id=n1`), null);
});

test("record resolution uses current records and binds requests to their vehicle", () => {
  const vehicle = { id: "v1", history: [{ id: "h1" }], notes: [{ id: "n1" }], telemetry: [{ id: "d1" }], dtcs: ["P0101"] };
  const requests = [{ id: "r1", vehicleId: "v1" }, { id: "r1", vehicleId: "v2" }];
  assert.deepEqual(resolveRecord({ vehicleId: "v1", kind: "request", recordId: "r1" }, vehicle, requests), { tab: "service", index: 0 });
  assert.deepEqual(resolveRecord({ vehicleId: "v1", kind: "history", recordId: "h1" }, vehicle, requests), { tab: "service", index: 0 });
  assert.deepEqual(resolveRecord({ vehicleId: "v1", kind: "diagnostic", recordId: "current" }, vehicle, requests), { tab: "diagnostics", index: 0 });
  assert.equal(resolveRecord({ vehicleId: "v1", kind: "diagnostic", recordId: "current" }, { ...vehicle, dtcs: [] }, requests), null);
  assert.equal(resolveRecord({ vehicleId: "v2", kind: "request", recordId: "r1" }, vehicle, requests), null);
  assert.equal(resolveRecord({ vehicleId: "v1", kind: "history", recordId: "deleted" }, vehicle, requests), null);
});

test("ambiguous unresolved citation markers never link to a coincidentally matching record id", () => {
  const evidence = {
    records: [{ id: "R1", vehicleId: "v1", kind: "history", recordId: "h1", vehiclePlate: "A", title: "Work", date: "", summary: "" }],
    citedRecordIds: ["R1"],
    unresolvedCitations: ["R1"],
    technicalCards: [], checkedAt: "", truncated: false,
  };
  assert.equal(citedRecordForMarker("[R1]", evidence), null);
  assert.equal(citedRecordForMarker("[R2]", evidence), null);
  assert.equal(citedRecordForMarker("[R1]", { ...evidence, unresolvedCitations: [] })?.recordId, "h1");
});
