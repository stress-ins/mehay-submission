import test from "node:test";
import assert from "node:assert/strict";
import { buildAssistantEvidence, classifySearchOrigin, findRecordMarkers, hasTorqueRecommendation, isTorqueQuery, resolveAssistantCitations, sanitizePriorEvidenceMarkers, scopedWebSearchQuery, searchCitationMatchesScope } from "./assistant-evidence.mjs";

test("evidence creates scoped server links and resolves only registered markers", () => {
  const { evidence } = buildAssistantEvidence({ vehicle: { id: "van 1", plate: "A 123", model: "Gazelle", history: [{ id: "repair/4", title: "Ремонт", date: "2026-01-02" }], telemetry: [], notes: [] }, message: "Посмотри ремонт" });
  assert.equal(evidence.records[0].href, "/app?vehicle=van%201&record=history&id=repair%2F4");
  assert.deepEqual(resolveAssistantCitations("Сделано [R1], но [R999] неизвестен", evidence.records), { citedRecordIds: ["R1"], unresolvedCitations: ["R999"] });
});

test("other vehicle references preserve the owning vehicle in href", () => {
  const { evidence } = buildAssistantEvidence({ vehicle: { id: "selected", history: [], telemetry: [], notes: [] }, otherRequests: [{ id: "req-8", title: "Other", vehicle: { id: "van/8", plate: "B8" } }] });
  assert.deepEqual({ vehicleId: evidence.records[0].vehicleId, href: evidence.records[0].href }, { vehicleId: "van/8", href: "/app?vehicle=van%2F8&record=request&id=req-8" });
});

test("history evidence preserves result fields and chooses newest records", () => {
  const { evidence } = buildAssistantEvidence({ vehicle: { id: "v", history: [{ id: "old", date: "2020-01-01" }, { id: "new", date: "2026-01-01", title: "Проверка", description: "Выполнено", result: "Проверено", status: "done", parts: [{ name: "Фильтр" }], workItems: [{ title: "Замена" }] }], telemetry: [{ id: "old-d", recordedAt: "2025-01-01" }, { id: "new-d", recordedAt: "2026-01-01", batteryVoltage: 14, raw: { secret: "raw diagnostic payload" } }], notes: [] } });
  const history = evidence.records.find((record) => record.kind === "history");
  assert.equal(history.recordId, "new");
  assert.match(history.summary, /Фильтр/);
  assert.match(history.summary, /Замена/);
  assert.match(history.summary, /выполнена/);
  assert.match(history.summary, /Результат: Проверено/);
  assert.equal(evidence.records.find((record) => record.kind === "diagnostic").recordId, "new-d");
  const diagnostic = evidence.records.find((record) => record.kind === "diagnostic").summary;
  assert.match(diagnostic, /Напряжение: 14 В/);
  assert.doesNotMatch(diagnostic, /secret|raw/);
});

test("search source classification accepts known official roots and rejects lookalikes", () => {
  assert.equal(classifySearchOrigin("https://service.ford.com/manual"), "manufacturer");
  assert.equal(classifySearchOrigin("https://www.mercedes-benz.com/manual"), "manufacturer");
  assert.equal(classifySearchOrigin("https://ford.com.evil.example/manual"), "reference");
  assert.equal(classifySearchOrigin("https://notgaz.ru/manual"), "reference");
  assert.equal(classifySearchOrigin("https://www.drive2.ru/topic"), "community");
});

test("web search scopes are exclusive and OEM scope follows vehicle make", () => {
  assert.equal(scopedWebSearchQuery("P0420 Газель", "drive.ru"), "site:drive.ru P0420 Газель");
  assert.equal(scopedWebSearchQuery("P0420 Газель", "drive2.ru"), "site:drive2.ru P0420 Газель");
  assert.match(scopedWebSearchQuery("P0420", "oem", "УАЗ Патриот"), /^site:uaz\.ru P0420$/);
  assert.equal(scopedWebSearchQuery("P0420", "oem", "ГАЗель"), "site:gaz.ru P0420");
  assert.equal(searchCitationMatchesScope("https://www.drive2.ru/l/123", "drive2.ru"), true);
  assert.equal(searchCitationMatchesScope("https://drive.ru/article/123", "drive.ru"), true);
  assert.equal(searchCitationMatchesScope("https://example.org/l/123", "drive2.ru"), false);
  assert.equal(searchCitationMatchesScope("https://drive2.ru/", "drive2.ru"), false);
  assert.equal(searchCitationMatchesScope("https://www.drive2.ru/popular/", "drive2.ru"), false);
});

test("prior assistant citation labels cannot be reused against a new registry", () => {
  assert.deepEqual(sanitizePriorEvidenceMarkers([{ role: "assistant", content: "Done [R1] [R20]" }, { role: "user", content: "Use [R1]" }]), [{ role: "assistant", content: "Done [ссылка из прошлого ответа] [ссылка из прошлого ответа]" }, { role: "user", content: "Use [R1]" }]);
});

test("prior message metadata never crosses the provider boundary", () => {
  const history = [{ role: "assistant", content: "Done [R1]", evidence: { records: [{ summary: "private registry" }] }, sources: [{ url: "https://example.test" }] }, { role: "user", content: "Continue", metadata: "untrusted" }];
  assert.deepEqual(sanitizePriorEvidenceMarkers(history), [{ role: "assistant", content: "Done [ссылка из прошлого ответа]" }, { role: "user", content: "Continue" }]);
});

test("user supplied record labels are detected for deterministic clarification", () => {
  assert.deepEqual(findRecordMarkers("Подробнее про [R1], затем [R4] и снова [R1]"), ["R1", "R4"]);
  const first = buildAssistantEvidence({ vehicle: { id: "v", history: [{ id: "old" }], telemetry: [], notes: [] } });
  const reordered = buildAssistantEvidence({ vehicle: { id: "v", history: [{ id: "old" }, { id: "new", date: "2026-01-01" }], telemetry: [], notes: [] } });
  assert.equal(first.evidence.records[0].recordId, "old");
  assert.equal(reordered.evidence.records[0].recordId, "new");
  assert.deepEqual(findRecordMarkers("Подробнее про [R1]"), ["R1"]);
});

test("evidence caps each record family and torque detector catches numeric units", () => {
  const vehicle = { id: "v", history: Array.from({ length: 105 }, (_, i) => ({ id: `h${i}` })), telemetry: [], notes: [] };
  const result = buildAssistantEvidence({ vehicle, vehicleRequests: Array.from({ length: 55 }, (_, i) => ({ id: `r${i}` })), otherRequests: Array.from({ length: 35 }, (_, i) => ({ id: `o${i}`, vehicle: { id: "other" } })) });
  assert.equal(result.evidence.records.filter((r) => r.kind === "history").length, 100);
  assert.equal(result.evidence.records.filter((r) => r.kind === "request").length, 80);
  assert.equal(result.evidence.truncated, true);
  assert.equal(isTorqueQuery("Какой момент затяжки колеса?"), true);
  assert.equal(isTorqueQuery("Как затянуть болт ГБЦ?"), true);
  assert.equal(isTorqueQuery("С каким усилием затянуть гайку?"), true);
  assert.equal(isTorqueQuery("What torque should I use?"), true);
  assert.equal(isTorqueQuery("How do I tighten this bolt?"), true);
  assert.equal(hasTorqueRecommendation("Затянуть до 120 Н·м"), true);
  assert.equal(hasTorqueRecommendation("Затянуть до -120 Н·м"), true);
  assert.equal(hasTorqueRecommendation("Tighten to 44 lb-ft"), true);
  assert.equal(hasTorqueRecommendation("Применить 8 кгс·м"), true);
  assert.equal(hasTorqueRecommendation("Доворот на 90° после затяжки"), true);
  assert.equal(hasTorqueRecommendation("Затяните болт на 90 градусов"), true);
  assert.equal(hasTorqueRecommendation("Затяните болт на −90°"), true);
  assert.equal(hasTorqueRecommendation("Turn the bolt 90 degrees"), true);
});
