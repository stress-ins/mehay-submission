import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mountNeuroDvs } from "./neurodvs.mjs";
import { fleet } from "./repair-experience.mjs";

const syntheticRecommendations = (_vehicle, diagnosis) => diagnosis.status === "anomaly" ? [{
  operationKind: "repair", text: "Выполнить синтетическую проверку узла.", manual: "Synthetic service guide", pdfPage: 3,
  excerpt: "Учебный фрагмент о проверке узла.", url: "/api/manuals/sample.pdf#page=3",
}] : [];

async function fixture(t, fetchImpl, setupDb = () => {}, getRecommendations = syntheticRecommendations) {
  const db = new DatabaseSync(":memory:");
  setupDb(db);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: req.get("x-fixture-user") || "mechanic" }; next(); });
  mountNeuroDvs(app, { db, fetchImpl, recommendationsFor: getRecommendations });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const get = (route) => fetch(`${base}${route}`);
  return { base, db, get, post };
}

const mlResult = (session_id, overrides = {}) => ({ vehicle_id: "SYNTH-001", session_id, status: "anomaly", anomaly_type: "F08", anomaly_title: "Дизельная топливоподача", anomaly_score: 0.76, confidence: 0.73, signal_quality: "good", description: "Жёсткая работа и дымный выхлоп", model_version: "mock-v1", ...overrides });
const previewTicket = (post, { vehicleId, sessionId, diagnosis, urgency = diagnosis.guidance.urgency, operations = diagnosis.guidance.recommendations.map((item) => item.text), historicalPart }) => post("/api/neuro/tickets/preview", { vehicleId, sessionId, urgency, operations, ...(historicalPart ? { historicalPart } : {}) });
const confirmTicket = async (post, previewResponse) => {
  const { previewToken } = await previewResponse.clone().json();
  return post("/api/neuro/tickets", { previewToken, confirmed: true });
};

test("diagnose preserves normal, failed and uncertain outcomes without unsupported findings", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => {
    const request = JSON.parse(body);
    let result;
    if (request.vehicle_id === "SYNTH-002") result = { ...mlResult("FAIL-002"), vehicle_id: "SYNTH-002", status: "check_failed", anomaly_type: null, anomaly_title: null, anomaly_score: null, confidence: null, signal_quality: "bad" };
    else if (request.session_id === "SYNTH-SESSION-0002") result = { ...mlResult("SYNTH-SESSION-0002"), status: "normal", anomaly_type: null, anomaly_title: null, anomaly_score: 0.05 };
    else if (request.session_id === "SYNTH-SESSION-0003" && request.vehicle_id === "SYNTH-001") result = mlResult("SYNTH-SESSION-0003");
    else result = mlResult(request.session_id, { confidence: 0.42, signal_quality: "warning" });
    return Response.json(result);
  });
  for (const [vehicleId, sessionId, expected] of [["SYNTH-001", "SYNTH-SESSION-0002", "normal"], ["SYNTH-002", "FAIL-002", "stop"], ["SYNTH-001", "SYNTH-SESSION-0003", "anomaly"], ["SYNTH-001", "SYNTH-SESSION-0004", "uncertain"]]) {
    const response = await post("/api/neuro/diagnose", { vehicleId, sessionId });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.guidance.status, expected);
    assert.equal(body.guidance.canCreateTicket, expected === "anomaly");
    if (expected === "stop") assert.match(body.guidance.message, /Стоп/);
    if (expected === "anomaly") {
      assert.equal(body.guidance.recommendations[0].pdfPage, 3);
      assert.match(body.guidance.recommendations[0].text, /синтетическую проверку/);
      assert.equal(body.guidance.urgency, "medium");
    }
  }
});

test("SYNTH-SESSION-0015 engine and F08 mismatch is reported as a model conflict with confidence contract", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => {
    const { vehicle_id, session_id } = JSON.parse(body);
    return Response.json(mlResult(session_id, { vehicle_id, anomaly_score: 0.67, confidence: 0.86 }));
  });
  const response = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-005", sessionId: "SYNTH-SESSION-0015" });
  const result = await response.json();
  assert.equal(result.guidance.status, "model_conflict");
  assert.equal(result.guidance.ticketBlockReason, "model_code_conflict");
  assert.equal(result.guidance.canCreateTicket, false);
  assert.equal(result.confidence.percent, 86);
  assert.equal(result.confidence.thresholdPercent, 55);
  assert.equal(result.diagnosis.anomaly_type, "F08");
  assert.equal((await post("/api/neuro/tickets/preview", { vehicleId: "SYNTH-005", sessionId: "SYNTH-SESSION-0015", urgency: "high", operations: ["some operation"] })).status, 409);
});

test("warning requires explicit acknowledgement, bad signal stops, and preview supports manual urgency", async (t) => {
  let toirPayload;
  const { post } = await fixture(t, async (url, { body }) => {
    const request = JSON.parse(body);
    if (url.endsWith("/diagnose")) return Response.json(mlResult(request.session_id, { vehicle_id: request.vehicle_id, confidence: 0.8, signal_quality: request.session_id === "SYNTH-SESSION-0003" ? "warning" : "bad" }));
    toirPayload = request;
    return Response.json({ ticket_id: "TKT-WARN", status: "created" }, { status: 201 });
  });
  const warning = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  assert.equal(warning.guidance.status, "warning_confirmation_required");
  assert.equal(warning.guidance.canCreateTicket, false);
  assert.equal(warning.quality.value, "warning");
  assert.equal((await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: warning, urgency: "medium", operations: ["unsupported"] })).status, 409);
  assert.equal((await post("/api/neuro/diagnosis/acknowledge", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", confirmed: false })).status, 400);
  const acknowledged = await (await post("/api/neuro/diagnosis/acknowledge", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", resultHash: warning.resultHash, confirmed: true })).json();
  assert.equal(acknowledged.guidance.status, "anomaly");
  assert.equal(acknowledged.guidance.warningAcknowledged, true);
  const preview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: acknowledged, urgency: "high" });
  assert.equal(preview.status, 201);
  const draft = await preview.json();
  assert.equal(draft.preview.urgency, "high");
  assert.equal(draft.preview.urgencyMeaning, "До следующего рейса");
  assert.equal((await post("/api/neuro/tickets", { previewToken: draft.previewToken })).status, 400);
  assert.equal((await post("/api/neuro/tickets", { previewToken: draft.previewToken, confirmed: true })).status, 201);
  assert.equal(toirPayload.urgency, "high");

  const bad = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004" })).json();
  assert.equal(bad.guidance.status, "stop");
  assert.equal(bad.guidance.canCreateTicket, false);
  assert.equal((await post("/api/neuro/diagnosis/acknowledge", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004", resultHash: bad.resultHash, confirmed: true })).status, 409);
});

test("inspection-only evidence creates a defectoscopy ticket after preview confirmation without repair or parts", async (t) => {
  let toirPayload;
  const inspectionRecommendations = (_vehicle, diagnosis) => diagnosis.status === "anomaly" ? [{
    operationKind: "inspection", text: "Проверить зазоры клапанного механизма.", manual: "УАЗ: руководство по двигателю", pdfPage: 68,
  }] : [];
  const { post } = await fixture(t, async (url, { body }) => {
    const request = JSON.parse(body);
    if (url.endsWith("/diagnose")) return Response.json(mlResult(request.session_id, { vehicle_id: request.vehicle_id, anomaly_type: "F01", anomaly_title: "Клапанный механизм", confidence: 0.77, signal_quality: "good" }));
    toirPayload = request;
    return Response.json({ ticket_id: "TKT-DEFECT-0168", status: "created" }, { status: 201 });
  }, () => {}, inspectionRecommendations);
  const vehicleId = "SYNTH-001";
  const sessionId = "SYNTH-SESSION-0003";
  const diagnosis = await (await post("/api/neuro/diagnose", { vehicleId, sessionId })).json();
  assert.equal(diagnosis.guidance.canCreateTicket, false);
  assert.equal(diagnosis.guidance.canCreateDefectoscopyTicket, true);
  assert.equal((await previewTicket(post, { vehicleId, sessionId, diagnosis, urgency: "high" })).status, 409);

  const previewResponse = await post("/api/neuro/tickets/preview", { vehicleId, sessionId, purpose: "defectoscopy", urgency: "high", operations: [diagnosis.guidance.recommendations[0].text] });
  assert.equal(previewResponse.status, 201);
  const preview = await previewResponse.json();
  assert.equal(preview.preview.purpose, "defectoscopy");
  assert.deepEqual(preview.preview.spareParts, []);
  assert.equal((await post("/api/neuro/tickets", { previewToken: preview.previewToken, confirmed: true })).status, 201);
  assert.deepEqual(toirPayload.operations, ["Проверить зазоры клапанного механизма."]);
  assert.deepEqual(toirPayload.spare_parts, []);
  assert.match(toirPayload.conclusion, /^Заявка на дефектовку/);
  assert.deepEqual(toirPayload.references, [{ manual: "УАЗ: руководство по двигателю", pdf_page: 68 }]);
});

test("inspection ticket mode cannot submit a repair operation and low-confidence diagnoses remain blocked", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => {
    const request = JSON.parse(body);
    return Response.json(mlResult(request.session_id, { vehicle_id: request.vehicle_id, confidence: 0.48, signal_quality: "warning" }));
  });
  const lowConfidence = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-002", sessionId: "FAIL-002" })).json();
  assert.equal(lowConfidence.guidance.canCreateDefectoscopyTicket, undefined);
  assert.equal((await post("/api/neuro/tickets/preview", { vehicleId: "SYNTH-002", sessionId: "FAIL-002", purpose: "defectoscopy", urgency: "low", operations: ["Проверить что-либо"] })).status, 409);
});

test("defectoscopy mode rejects a verified repair operation even when both kinds are recommended", async (t) => {
  const bothRecommendations = (_vehicle, diagnosis) => diagnosis.status === "anomaly" ? [
    { operationKind: "inspection", text: "Проверить клапанный механизм.", manual: "УАЗ manual", pdfPage: 68 },
    { operationKind: "repair", text: "Отрегулировать клапанный механизм.", manual: "УАЗ manual", pdfPage: 69 },
  ] : [];
  const { post } = await fixture(t, async (_url, { body }) => {
    const request = JSON.parse(body);
    return Response.json(mlResult(request.session_id, { vehicle_id: request.vehicle_id, anomaly_type: "F01", anomaly_title: "Клапанный механизм", confidence: 0.77, signal_quality: "good" }));
  }, () => {}, bothRecommendations);
  await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const response = await post("/api/neuro/tickets/preview", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", purpose: "defectoscopy", urgency: "high", operations: ["Отрегулировать клапанный механизм."] });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "operation_not_inspection");
});

test("acknowledgement is bound to the displayed diagnosis and ticket previews to one diagnosis revision", async (t) => {
  let diagnosisCalls = 0;
  let ticketCalls = 0;
  const { post } = await fixture(t, async (url, { body }) => {
    const request = JSON.parse(body);
    if (url.endsWith("/diagnose")) {
      diagnosisCalls++;
      if (diagnosisCalls === 2) return Response.json(mlResult(request.session_id, {
        vehicle_id: request.vehicle_id, status: "check_failed", anomaly_type: null, anomaly_title: null,
        anomaly_score: null, confidence: null, signal_quality: "bad",
      }));
      return Response.json(mlResult(request.session_id, {
        vehicle_id: request.vehicle_id,
        confidence: 0.8,
        signal_quality: "warning",
        anomaly_score: 0.7,
      }));
    }
    ticketCalls++;
    return Response.json({ ticket_id: "TKT-REVISION", status: "created" }, { status: 201 });
  });
  const firstDiagnosis = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  assert.match(firstDiagnosis.resultHash, /^[a-f0-9]{64}$/);
  const firstAcknowledged = await (await post("/api/neuro/diagnosis/acknowledge", {
    vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", resultHash: firstDiagnosis.resultHash, confirmed: true,
  })).json();
  const firstPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: firstAcknowledged, urgency: "medium" });
  const staleDraft = await firstPreview.json();

  const secondDiagnosis = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  assert.equal(secondDiagnosis.guidance.status, "stop");
  assert.notEqual(secondDiagnosis.resultHash, firstDiagnosis.resultHash);
  assert.equal((await post("/api/neuro/diagnosis/acknowledge", {
    vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", resultHash: firstDiagnosis.resultHash, confirmed: true,
  })).status, 409);
  assert.equal((await post("/api/neuro/tickets", { previewToken: staleDraft.previewToken, confirmed: true })).status, 409);
  assert.equal(ticketCalls, 0);

  const rediagnosed = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  const currentWarning = await (await post("/api/neuro/diagnosis/acknowledge", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", resultHash: rediagnosed.resultHash, confirmed: true })).json();
  const validPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: currentWarning, urgency: "medium" });
  const validDraft = await validPreview.json();
  assert.equal((await post("/api/neuro/tickets", { previewToken: validDraft.previewToken, confirmed: true })).status, 201);
  assert.equal((await post("/api/neuro/tickets", { previewToken: validDraft.previewToken, confirmed: true })).status, 200);

  const changedPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: currentWarning, urgency: "high" });
  const changedDraft = await changedPreview.json();
  assert.equal((await post("/api/neuro/tickets", { previewToken: changedDraft.previewToken, confirmed: true })).status, 409);
  assert.equal(ticketCalls, 1);
});

test("ticket uses only manual-backed operations and returns real ToIR id once under concurrency", async (t) => {
  let calls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { post } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    calls++;
    await gate;
    const payload = JSON.parse(body);
    assert.deepEqual(payload.references, [{ manual: "Synthetic service guide", pdf_page: 3 }]);
    return new Response(JSON.stringify({ ticket_id: "TKT-0042", status: "created" }), { status: 201 });
  });
  await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const diagnosed = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const guidance = await diagnosed.json();
  const operation = guidance.guidance.recommendations[0].text;
  const ticket = { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: guidance, operations: [operation] };
  assert.equal((await post("/api/neuro/tickets/preview", { vehicleId: ticket.vehicleId, sessionId: ticket.sessionId, urgency: guidance.guidance.urgency, operations: [operation], spareParts: ["форсунка"] })).status, 400);
  assert.equal((await previewTicket(post, { ...ticket, operations: ["Заменить насос"] })).status, 422);
  const ticketPreview = await previewTicket(post, ticket);
  assert.equal(ticketPreview.status, 201);
  const previewBody = await ticketPreview.json();
  const { previewToken } = previewBody;
  assert.deepEqual(previewBody.preview.confidence, guidance.guidance.confidence);
  assert.deepEqual(previewBody.preview.signalQuality, guidance.guidance.quality);
  const confirm = () => post("/api/neuro/tickets", { previewToken, confirmed: true });
  const firstPromise = confirm();
  const secondPromise = confirm();
  const second = await secondPromise;
  release();
  const first = await firstPromise;
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal(calls, 1);
  const winner = first.status === 201 ? first : second;
  assert.equal((await winner.json()).ticket_id, "TKT-0042");
  const retry = await confirm();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).ticket_id, "TKT-0042");
});

test("ToIR previews accept only repair operations, preserve inspections, and reject old inspection previews", async (t) => {
  const inspection = { text: "Проверить давление на месте.", operationKind: "inspection", stepKey: "adjust", manual: "Synthetic service guide", pdfPage: 3 };
  const repair = { text: "Заменить подтверждённый узел.", operationKind: "repair", manual: "Synthetic service guide", pdfPage: 4 };
  const legacyRepair = { text: "Отрегулировать зазор по проверенной процедуре.", stepKey: "adjust", manual: "Synthetic service guide", pdfPage: 5 };
  const unclassified = { text: "Выполнить действие без metadata.", manual: "Synthetic service guide", pdfPage: 6 };
  let toirCalls = 0;
  const { post, db } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    toirCalls += 1;
    return Response.json({ ticket_id: "unexpected", status: "created" }, { status: 201 });
  }, () => {}, () => [inspection, repair, legacyRepair, unclassified]);
  const diagnosisResponse = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const diagnosis = await diagnosisResponse.json();
  assert.equal(diagnosis.guidance.canCreateTicket, true);
  assert.deepEqual(diagnosis.guidance.recommendations.map(({ text }) => text), [inspection.text, repair.text, legacyRepair.text, unclassified.text]);
  assert.deepEqual(diagnosis.guidance.recommendations.map(({ operationKind }) => operationKind), ["inspection", "repair", "repair", undefined]);
  const mixed = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis, operations: [repair.text, inspection.text] });
  assert.equal(mixed.status, 422);
  assert.equal((await mixed.json()).error, "operation_not_repair");
  const inspectionPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis, operations: [inspection.text] });
  assert.equal(inspectionPreview.status, 422);
  assert.equal((await inspectionPreview.json()).error, "operation_not_repair");
  const unclassifiedPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis, operations: [unclassified.text] });
  assert.equal(unclassifiedPreview.status, 422);
  assert.equal((await unclassifiedPreview.json()).error, "operation_not_repair", "unknown or absent operation metadata fails closed");
  const unclassifiedDefectoscopy = await post("/api/neuro/tickets/preview", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", purpose: "defectoscopy", urgency: "medium", operations: [unclassified.text] });
  assert.equal(unclassifiedDefectoscopy.status, 422);
  assert.equal((await unclassifiedDefectoscopy.json()).error, "operation_not_inspection", "defectoscopy requires explicit inspection metadata");
  const legacyPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis, operations: [legacyRepair.text] });
  assert.equal(legacyPreview.status, 201, "verified legacy stepKey=adjust remains ticketable");

  const saved = db.prepare("SELECT revision FROM neuro_diagnoses WHERE vehicle_id=? AND session_id=?").get("SYNTH-001", "SYNTH-SESSION-0003");
  const token = "123e4567-e89b-42d3-a456-426614174000";
  const oldPayload = { vehicle_id: "SYNTH-001", session_id: "SYNTH-SESSION-0003", anomaly_type: "F08", conclusion: "old preview", urgency: "medium", operations: [unclassified.text], spare_parts: [], references: [{ manual: unclassified.manual, pdf_page: unclassified.pdfPage }] };
  db.prepare("INSERT INTO neuro_ticket_previews(token,vehicle_id,session_id,snapshot,expires_at) VALUES(?,?,?,?,?)").run(token, "SYNTH-001", "SYNTH-SESSION-0003", JSON.stringify({ payload: oldPayload, preview: { purpose: "defectoscopy" }, diagnosisRevision: saved.revision }), new Date(Date.now() + 600_000).toISOString());
  const oldSubmission = await post("/api/neuro/tickets", { previewToken: token, confirmed: true });
  assert.equal(oldSubmission.status, 409);
  assert.equal((await oldSubmission.json()).error, "inspection_operation_required");
  assert.equal(toirCalls, 0);
});

test("inspection-only guidance stays visible but cannot create a ToIR preview", async (t) => {
  const inspection = { text: "Проверить давление на месте.", operationKind: "inspection", manual: "Synthetic service guide", pdfPage: 3 };
  const { post } = await fixture(t, async (_url, { body }) => Response.json(mlResult(JSON.parse(body).session_id)), () => {}, () => [inspection]);
  const diagnosis = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  assert.equal(diagnosis.guidance.canCreateTicket, false);
  assert.equal(diagnosis.guidance.ticketBlockReason, "repair_operation_required");
  assert.deepEqual(diagnosis.guidance.recommendations, [inspection]);
  const response = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis, operations: [inspection.text] });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "repair_operation_required");
});

test("refuses ticket from failed diagnosis and reports upstream service failure", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => Response.json({ ...mlResult(JSON.parse(body).session_id), status: "check_failed", anomaly_type: null, anomaly_title: null, anomaly_score: null, confidence: null, signal_quality: "bad" }));
  await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0001" });
  const ticket = await post("/api/neuro/tickets/preview", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0001", urgency: "low", operations: ["x"] });
  assert.equal(ticket.status, 409);
});

test("a rejected ToIR request can retry while an ambiguous 5xx cannot duplicate", async (t) => {
  let calls = 0;
  const { post } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    calls++;
    if (calls === 1) return Response.json({ detail: "rejected" }, { status: 422 });
    if (calls === 3) return Response.json({ detail: "failed" }, { status: 503 });
    return new Response(JSON.stringify({ ticket_id: "TKT-0007", status: "created" }), { status: 201 });
  });
  const diagnosis = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const guide = await diagnosis.json();
  const body = { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: guide };
  const retryPreview = await previewTicket(post, body);
  assert.equal((await confirmTicket(post, retryPreview)).status, 502);
  assert.equal((await confirmTicket(post, retryPreview)).status, 201);
  const nextGuide = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004" })).json();
  const uncertainPreview = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004", diagnosis: nextGuide });
  assert.equal((await confirmTicket(post, uncertainPreview)).status, 502);
  assert.equal((await confirmTicket(post, uncertainPreview)).status, 409);
  assert.equal(calls, 3);
});

test("a weak normal result is not presented as confirmed normal and parts cannot be asserted", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => Response.json({ ...mlResult(JSON.parse(body).session_id), status: "normal", anomaly_type: null, anomaly_title: null, anomaly_score: null, confidence: 0.2, signal_quality: "warning" }));
  const response = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0002" });
  const result = await response.json();
  assert.equal(result.diagnosis.status, "normal");
  assert.equal(result.guidance.status, "uncertain");
  assert.match(result.guidance.message, /не подтверждено/);
});

test("guidance is limited to the exact engine and fault pair", async (t) => {
  let diagnosisResult, toirCalls = 0;
  const { post } = await fixture(t, async (_url, { body }) => {
    if (_url.endsWith("/tickets")) toirCalls++;
    const { vehicle_id, session_id } = JSON.parse(body);
    return Response.json({ ...diagnosisResult, vehicle_id, session_id });
  }, () => {}, (vehicle, diagnosis) => vehicle.engine_model === "ЯМЗ-236М2" && diagnosis.anomaly_type === "F02" ? [syntheticRecommendations(vehicle, diagnosis)[0]] : []);
  diagnosisResult = { ...mlResult("", { anomaly_type: "F02", anomaly_title: "Низкое давление масла", anomaly_score: 0.86, confidence: 0.84 }) };
  const oil = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-004", sessionId: "SYNTH-SESSION-0005" })).json();
  assert.equal(oil.guidance.recommendations.length, 1);
  assert.equal(oil.guidance.recommendations[0].pdfPage, 3);
  assert.match(oil.guidance.recommendations[0].text, /синтетическую проверку/);
  assert.match(oil.guidance.recommendations[0].excerpt, /Учебный фрагмент/);

  diagnosisResult = { ...mlResult("", { anomaly_type: "F13", anomaly_title: "Подача бензина", anomaly_score: 0.61, confidence: 0.91 }) };
  const dieselResponse = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-004", sessionId: "SYNTH-SESSION-0008" });
  const diesel = await dieselResponse.json();
  assert.equal(diesel.guidance.recommendations.length, 0);
  assert.equal(diesel.guidance.canCreateTicket, false);
  assert.equal(diesel.guidance.ticketBlockReason, "model_code_conflict");
  assert.match(diesel.guidance.message, /Ошибка модели/);
  const blocked = await previewTicket(post, { vehicleId: "SYNTH-004", sessionId: "SYNTH-SESSION-0008", diagnosis: diesel, urgency: "medium", operations: ["Провести дефектовку"] });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, "model_code_conflict");
  assert.equal(toirCalls, 0);
});

test("fleet trend and chief summary expose only actual measurements with explicit reliability status", async (t) => {
  const { get } = await fixture(t, async () => { throw new Error("not used"); });
  const fleetResponse = await get("/api/neuro/fleet");
  assert.equal(fleetResponse.status, 200);
  const fleetBody = await fleetResponse.json();
  const bus = fleetBody.vehicles.find((vehicle) => vehicle.vehicle_id === "SYNTH-003");
  assert.equal(bus.sessions.length, 3);
  assert.deepEqual(bus.sessions.map((session) => session.session_id), ["SYNTH-SESSION-0011", "SYNTH-SESSION-0010", "SYNTH-SESSION-0009"]);
  assert.equal(bus.sessions[0].anomaly_score, 0.85);
  assert.equal(bus.sessions[0].signal_quality, "good");
  assert.equal(bus.sessions[0].reliable, true);
  for (const [vehicleId, sessionId] of [["SYNTH-004", "SYNTH-SESSION-0008"], ["SYNTH-005", "SYNTH-SESSION-0015"]]) {
    const fleetRecord = fleetBody.vehicles.find((v) => v.vehicle_id === vehicleId).sessions.find((s) => s.session_id === sessionId);
    const history = await (await get("/api/neuro/history?vehicleId=" + vehicleId)).json();
    const historyRecord = history.checks.find((s) => s.session_id === sessionId);
    assert.equal(fleetRecord.model_conflict, true);
    assert.equal(fleetRecord.reliable, false);
    assert.deepEqual(historyRecord, fleetRecord);
  }
  const summaryResponse = await get("/api/neuro/summary");
  assert.equal(summaryResponse.status, 200);
  const { summary, priorityVehicles } = await summaryResponse.json();
  assert.equal(summary.normal + summary.attention + summary.quarantine, fleetBody.vehicles.length);
  assert.equal(summary.quarantine, priorityVehicles.filter((vehicle) => vehicle.status === "quarantine").length);
  assert.equal(summary.attention, priorityVehicles.filter((vehicle) => vehicle.status === "attention").length);
  assert.equal(summary.quarantine + summary.attention, priorityVehicles.length);
  assert.equal(priorityVehicles[0].status, "quarantine");
  assert.ok(priorityVehicles.every((vehicle) => vehicle.reason && vehicle.session_id && vehicle.checked_at));
  assert.ok(priorityVehicles.some((vehicle) => vehicle.status === "attention" && vehicle.signal_quality !== "good"));
});

test("vehicle history returns stored diagnoses and real ToIR ticket IDs", async (t) => {
  const { get, post } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    return Response.json({ ticket_id: "TKT-HISTORY", status: "created" }, { status: 201 });
  });
  assert.equal((await get("/api/neuro/history")).status, 400);
  assert.equal((await get("/api/neuro/history?vehicleId=UNKNOWN")).status, 404);
  const diagnosis = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  const draft = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis });
  await confirmTicket(post, draft);
  const response = await get("/api/neuro/history?vehicleId=SYNTH-001");
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.ok(history.checks.length <= 5 && history.checks.length > 0);
  assert.equal(history.diagnoses[0].session_id, "SYNTH-SESSION-0003");
  assert.equal(history.diagnoses[0].anomaly_type, "F08");
  assert.deepEqual(history.tickets.map((ticket) => ticket.ticket_id), ["TKT-HISTORY"]);
});

test("unknown anomaly score is not converted to low risk or ticket eligibility", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => Response.json(mlResult(JSON.parse(body).session_id, { anomaly_score: null })));
  const response = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" });
  const result = await response.json();
  assert.equal(result.guidance.risk, "unknown");
  assert.equal(result.guidance.urgency, null);
  assert.equal(result.guidance.canCreateTicket, false);
  assert.match(result.guidance.message, /оценка риска не получена/);
});

test("ECONNREFUSED before connection allows retry; ambiguous transport failure does not", async (t) => {
  let calls = 0;
  const { post } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    calls++;
    if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }) });
    if (calls === 3) throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) });
    return Response.json({ ticket_id: "TKT-0088", status: "created" }, { status: 201 });
  });
  const diagnosed = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  const body = { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: diagnosed };
  const draft = await previewTicket(post, body);
  const refused = await confirmTicket(post, draft);
  assert.equal(refused.status, 502);
  assert.equal((await refused.json()).retryable, true);
  assert.equal((await confirmTicket(post, draft)).status, 201);
  const nextDiagnosis = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004" })).json();
  const uncertainDraft = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0004", diagnosis: nextDiagnosis });
  assert.equal((await confirmTicket(post, uncertainDraft)).status, 502);
  assert.equal((await confirmTicket(post, uncertainDraft)).status, 409);
  assert.equal(calls, 3);
});

test("a selected historical part must match this vehicle or engine and is not sent as a spare part", async (t) => {
  let submitted;
  const { post } = await fixture(t, async (url, { body }) => {
    if (url.endsWith("/diagnose")) return Response.json(mlResult(JSON.parse(body).session_id));
    submitted = JSON.parse(body);
    return Response.json({ ticket_id: "TKT-HIST", status: "created" }, { status: 201 });
  }, (db) => {
    db.exec("CREATE TABLE vehicles(data TEXT NOT NULL)");
    db.prepare("INSERT INTO vehicles(data) VALUES(?)").run(JSON.stringify({
      id: "SYNTH-001", plate: "SYN-001", model: "Тестовый тягач", engine: "ЯМЗ-236М2",
      history: [{ id: "hist-1", faultCode: "F08", completedAt: "2026-09-01", plannedHours: 4, actualHours: 5, waitingHours: 1, part: "Топливный фильтр" }],
    }));
  });
  const diagnosed = await (await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003" })).json();
  assert.equal((await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: diagnosed, historicalPart: "Форсунка" })).status, 422);
  const draft = await previewTicket(post, { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0003", diagnosis: diagnosed, historicalPart: "Топливный фильтр" });
  assert.equal((await confirmTicket(post, draft)).status, 201);
  assert.match(submitted.conclusion, /Из истории этого ТС: «Топливный фильтр»; проверить применимость перед заказом/);
  assert.deepEqual(submitted.spare_parts, []);
});

test("upstream normal and check_failed statuses reject active fault fields", async (t) => {
  const { post } = await fixture(t, async (_url, { body }) => {
    const { vehicle_id, session_id } = JSON.parse(body);
    if (session_id === "SYNTH-SESSION-0002") return Response.json(mlResult(session_id, { vehicle_id, status: "normal", anomaly_type: "F01", anomaly_title: null, anomaly_score: null }));
    return Response.json(mlResult(session_id, { vehicle_id, status: "check_failed", anomaly_type: null, anomaly_title: null, anomaly_score: null, confidence: 0.8, signal_quality: "bad" }));
  });
  assert.equal((await post("/api/neuro/diagnose", { vehicleId: "SYNTH-001", sessionId: "SYNTH-SESSION-0002" })).status, 502);
  assert.equal((await post("/api/neuro/diagnose", { vehicleId: "SYNTH-002", sessionId: "FAIL-002" })).status, 502);
});

test("an engine fault with synthetic manual guidance produces a cited ToIR ticket", async (t) => {
  let ticketPayload;
  const steps = ["Собрать синтетические показания.", "Сверить с учебным источником.", "Записать результат проверки.", "Завершить проверку узла."].map((text) => ({
    operationKind: "repair", text, manual: "Synthetic service guide", pdfPage: 3, excerpt: "Учебный фрагмент о проверке узла.", url: "/api/manuals/sample.pdf#page=3",
  }));
  const { post } = await fixture(t, async (url, { body }) => {
    const request = JSON.parse(body);
    if (url.endsWith("/diagnose")) return Response.json(mlResult(request.session_id, {
      vehicle_id: request.vehicle_id, anomaly_type: "F01", anomaly_title: "Клапанный механизм",
      anomaly_score: 0.56, confidence: 0.82, signal_quality: "good",
    }));
    ticketPayload = request;
    return Response.json({ ticket_id: "TKT-BUS-0104", status: "created" }, { status: 201 });
  }, () => {}, (vehicle, diagnosis) => vehicle.engine_model === "ЗМЗ-5234.10" && diagnosis.anomaly_type === "F01" ? steps : []);
  const diagnosedResponse = await post("/api/neuro/diagnose", { vehicleId: "SYNTH-003", sessionId: "SYNTH-SESSION-0011" });
  assert.equal(diagnosedResponse.status, 200);
  const diagnosed = await diagnosedResponse.json();
  assert.deepEqual(diagnosed.guidance.recommendations.map(step => step.pdfPage), [3, 3, 3, 3]);
  const recommendation = diagnosed.guidance.recommendations[1];
  assert.equal(recommendation.pdfPage, 3);
  assert.match(recommendation.excerpt, /Учебный фрагмент/);
  const response = await confirmTicket(post, await previewTicket(post, { vehicleId: "SYNTH-003", sessionId: "SYNTH-SESSION-0011", diagnosis: diagnosed, operations: [recommendation.text] }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ticket_id, "TKT-BUS-0104");
  assert.deepEqual(ticketPayload.references, [{ manual: "Synthetic service guide", pdf_page: 3 }]);
  assert.deepEqual(ticketPayload.spare_parts, []);
  assert.match(ticketPayload.operations[0], /учебным источником/);
});

test("every supplied diagnostic session satisfies the upstream contract", async (t) => {
  const sessions = fleet.flatMap(vehicle => vehicle.sessions);
  const byId = new Map(sessions.map(session => [session.session_id, session]));
  const { post } = await fixture(t, async (_url, { body }) =>
    Response.json(byId.get(JSON.parse(body).session_id)));
  for (const session of sessions) {
    const response = await post("/api/neuro/diagnose", {
      vehicleId: session.vehicle_id, sessionId: session.session_id,
    });
    assert.equal(response.status, 200, session.session_id);
    const { guidance } = await response.json();
    if (session.confidence === null || session.confidence < 0.55 || session.signal_quality !== "good") {
      assert.equal(guidance.canCreateTicket, false, session.session_id);
    }
  }
});

test("a mechanic can reopen a measurement conversation without leaking history or duplicating retries", async t => {
  const { base, get, post } = await fixture(t);
  const route = "/api/neuro/vehicles/SYNTH-001/sessions/SYNTH-SESSION-0003/conversation";
  const exchange = { id: "d69fd336-20fb-47c9-8501-a46dd624031b", question: "Какая страница?", answer: "Проверьте источник.", evidence: [
    { manual: "Учебное руководство", text: "Учебный пример", pdfPage: 2, url: "/api/manuals/demo.pdf#page=2" },
  ] };
  assert.equal((await post(route, exchange)).status, 201);
  assert.equal((await post(route, exchange)).status, 200);
  assert.deepEqual((await (await get(route)).json()).exchanges, [{ ...exchange, manualVerified: false, evidence: [], sessionId: "SYNTH-SESSION-0003", author: { userId: "mechanic", login: "", displayName: "" } }]);
  assert.equal((await post(route, { ...exchange, answer: "Другой ответ" })).status, 409);
  assert.equal((await post(route, { ...exchange, evidence: [{ ...exchange.evidence[0], url: "https://example.com" }] })).status, 400);
  assert.deepEqual((await (await fetch(base + route, { headers: { "x-fixture-user": "another" } })).json()).exchanges, []);
  assert.deepEqual((await (await get(route.replace("SYNTH-SESSION-0003", "SYNTH-SESSION-0002"))).json()).exchanges, [{ ...exchange, manualVerified: false, evidence: [], sessionId: "SYNTH-SESSION-0003", author: { userId: "mechanic", login: "", displayName: "" } }]);
  assert.equal((await get(route.replace("SYNTH-001", "SYNTH-002"))).status, 404);
  assert.deepEqual((await (await get("/api/neuro/vehicles/SYNTH-005/sessions/SYNTH-SESSION-0015/conversation")).json()).exchanges, []);
});
