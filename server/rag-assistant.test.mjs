import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "./index.mjs";

async function fixture(t, manualSearch) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mehay-rag-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const app = createApp({ legacyDemo: true, dbPath: path.join(dir, "db.sqlite"), uploadsDir: path.join(dir, "uploads"), manualSearch });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); app.locals.db.close(); });
  const raw = (url, options = {}) => fetch(base + url, {
    ...options,
    headers: { ...(["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase()) ? { origin: base } : {}), ...options.headers },
  });
  const setup = await raw("/api/auth/setup", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "rag-test", displayName: "RAG test", password: "Test password for rag 1!" }),
  });
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const request = (url, options = {}) => raw(url, { ...options, headers: { ...options.headers, cookie } });
  return { raw, request, app };
}

test("a short follow-up retrieves the preceding operation for the selected engine", async t => {
  let input;
  const { request } = await fixture(t, async args => { input = args; return []; });
  const ask = query => request("/api/manuals/search", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ engineModel: "ЯМЗ-536", query, answer: true, previousQuestion: "Как выполнить калибровку датчика?" }),
  });
  assert.equal((await ask("А каким моментом затянуть?")).status, 200);
  assert.equal(input.engineModel, "ЯМЗ-536");
  assert.match(input.query, /калибровку датчика/);
  await ask("Как проверить температурный датчик?");
  assert.equal(input.query, "Как проверить температурный датчик?");
});

test("manual retrieval is keyless, engine-scoped, cited by PDF page, and protected", async (t) => {
  let requested;
  const { raw, request } = await fixture(t, async (input) => {
    requested = input;
    return [{ manual: { id: "sample-guide", title: "Synthetic service guide" }, pdfPage: 4, text: "Учебный фрагмент: проверьте контрольный параметр согласно процедуре.", score: 2.4 }];
  });
  const unauthorized = await raw("/api/manuals/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engineModel: "ЯМЗ-536", query: "oil" }) });
  assert.equal(unauthorized.status, 401);
  const result = await request("/api/manuals/search", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ engineModel: "ЯМЗ-536", query: "давление масла" }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(requested, { engineModel: "ЯМЗ-536", query: "давление масла", limit: 5 });
  assert.equal((await result.json()).results[0].url, "/api/manuals/sample-guide.pdf#page=4");
  const pdf = await request("/api/manuals/sample-guide.pdf");
  assert.equal(pdf.status, 404, "a synthetic citation cannot access an unconfigured knowledge base");
});

test("admin review queue records unresolved manual requests once without storing answers or source text", async (t) => {
  const { raw, request, app } = await fixture(t, async () => []);
  const body = { engineModel: "ЯМЗ-536", query: "Нужна процедура для конкретного узла", answer: true, vehicleId: "van-4", sessionId: "session-77" };
  for (let index = 0; index < 2; index += 1) {
    const response = await request("/api/manuals/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).results, []);
  }
  assert.equal((await raw("/api/admin/qa-review")).status, 401);
  const queue = await (await request("/api/admin/qa-review")).json();
  assert.equal(queue.cases.length, 1, "repeat requests should update one internal case");
  assert.equal(queue.cases[0].category, "no_evidence");
  assert.equal(queue.cases[0].events.length, 2, "both workflow attempts remain observable");
  const event = queue.cases[0].events[1];
  assert.equal(event.vehicle_id, "van-4");
  assert.equal(event.session_id, "session-77");
  assert.equal(event.request_text, body.query);
  assert.equal(event.action, "retrieve_manual_pages");
  assert.deepEqual(event.source_refs, []);
  assert.equal("answer" in event, false);
  assert.equal("provider_secret" in event, false);
  const issue = queue.cases[0];
  app.locals.db.prepare("UPDATE qa_observations SET created_at='2020-01-01T10:00:00.000Z'").run();
  const extra = app.locals.db.prepare("INSERT INTO qa_observations SELECT ?,?,user_id,vehicle_id,vehicle_model,engine,session_id,surface,?,route_decision,action,tool,source_refs,outcome,error_code,duration_ms,NULL FROM qa_observations WHERE id=?");
  for (let i = 0; i < 42; i++) extra.run('related-' + i, '2020-01-01T09:59:50.000Z', 'Другой вопрос', issue.last_observation_id);
  const reviewed = await request(`/api/admin/qa-review/${queue.cases[0].id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).status, "reviewed");
  const after = (await (await request("/api/admin/qa-review")).json()).cases[0];
  assert.equal(after.events.length, 40);
  assert.equal(after.events.find(item => item.id === after.last_observation_id)?.request_text, body.query);
});

test("assistant uses local pages and keeps fleet context out of web lookup", async (t) => {
  const oldKey = process.env.OPENROUTER_API_KEY, oldFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; });
  const { request } = await fixture(t, async () => [{
    manual: { id: "sample-guide", title: "Synthetic service guide" }, pdfPage: 4,
    text: "Учебный фрагмент: проверьте контрольный параметр согласно процедуре.", score: 2.4,
  }]);
  const bootstrap = await (await request("/api/bootstrap")).json();
  const vehicle = bootstrap.vehicles.find((entry) => entry.engine !== "ЯМЗ-536");
  const calls = [];
  let omitWebCitations = false;
  let useInlineCitation = false;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://openrouter.ai/api/v1/chat/completions")) return oldFetch(url, options);
    const payload = JSON.parse(options.body); calls.push(payload);
    if (payload.plugins) {
      const content = useInlineCitation
        ? "A public procedure describes this check. [official material](https://service.example/article)"
        : "A public procedure recommends inspecting the sensor [1].";
      return new Response(JSON.stringify({ choices: [{ message: {
        content: omitWebCitations ? "Найден публичный технический материал." : content,
        ...(omitWebCitations ? {} : { annotations: [{ type: "url_citation", url_citation: {
          url: "https://service.example/article", title: "Service procedure",
          ...(useInlineCitation ? {} : { start_index: content.indexOf("[1]"), end_index: content.indexOf("[1]") + 3 }),
        } }] }),
      } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Сверьте процедуру на указанной странице." } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const response = await request("/api/assistant", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ vehicleId: vehicle.id, engineModel: "ЯМЗ-536", message: `Private note: ${vehicle.plate}`, webSearch: true, webQuery: "temperature sensor procedure" }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].plugins);
  const webRequest = JSON.stringify(calls[0]);
  assert.equal(webRequest.includes(vehicle.plate), false);
  assert.equal(webRequest.includes("otherFleetRequests"), false);
  assert.match(calls[0].messages[1].content, /temperature sensor procedure/);
  assert.doesNotMatch(calls[0].messages[1].content, /Private note/);
  const synthesis = JSON.stringify(calls[1]);
  assert.match(synthesis, /retrievedManualPages/);
  assert.ok(synthesis.includes("https://service.example/article"));
  assert.match(synthesis, /Provider-attributed claim \(not a direct quotation\)/);
  assert.match(synthesis, /Synthetic service guide/);
  assert.match(synthesis, /manualEngineMatchesVehicle.*false/);
  assert.doesNotMatch(synthesis, /Найден публичный технический материал/);
  const body = await response.json();
  assert.deepEqual(body.sources.map((source) => source.type), ["manual", "reference"]);
  assert.equal(body.sources[0].pdfPage, 4);
  assert.equal(body.sources[0].url, "/api/manuals/sample-guide.pdf#page=4");

  omitWebCitations = true;
  calls.length = 0;
  const noEvidence = await request("/api/assistant", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ vehicleId: vehicle.id, engineModel: "ЯМЗ-536", message: "Temperature sensor?", webSearch: true, webQuery: "temperature sensor" }),
  });
  assert.equal(noEvidence.status, 200);
  assert.deepEqual((await noEvidence.json()).sources.map((source) => source.type), ["manual"]);
  assert.doesNotMatch(JSON.stringify(calls[1]), /Найден публичный технический материал/);

  omitWebCitations = false;
  useInlineCitation = true;
  calls.length = 0;
  const inline = await request("/api/assistant", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ vehicleId: vehicle.id, engineModel: "ЯМЗ-536", message: "What should I inspect?", webSearch: true, webQuery: "sensor" }),
  });
  assert.equal(inline.status, 200);
  assert.match(JSON.stringify(calls[1]), /A public procedure describes this check/);
  assert.match(JSON.stringify(calls[1]), /official material/i);
});

test("both manual search modes expose a conflict and exact citations without asking a model to choose a side", async t => {
  const pages = [
    { manual: { id: "yamz-236-operation", title: "Учебный регламент А" }, pdfPage: 5, text: "Контроль выполняется до учебного порога.", valveTiming: { direction: "before", minutes: 21 } },
    { manual: { id: "yamz-236-repair", title: "Учебный регламент Б" }, pdfPage: 9, text: "Контроль выполняется после учебного порога.", valveTiming: { direction: "minimum", minutes: 21 } },
  ];
  const { request } = await fixture(t, async () => pages);
  for (const answer of [false, true]) {
    const response = await request("/api/manuals/search", {method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({engineModel: "ЯМЗ-236М2", query: "Когда можно регулировать клапаны на ЯМЗ-236?", answer})});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manualAssessment, "conflict");
    assert.match(body.answer, /только на холодном двигателе/);
    assert.match(body.answer, /\(21 мин\) недостаточно/);
    assert.match(body.answer, /старшему механику/);
    assert.deepEqual(body.results.map(x => x.url), pages.map(p => `/api/manuals/${p.manual.id}.pdf#page=${p.pdfPage}`));
    for (const page of pages) assert.ok(body.answer.includes(page.text));
  }
});

test("manual uncertainty with cited pages remains visible to administrators", async t => {
  const { request } = await fixture(t, async () => [{
    manual: { id: "yamz-236-repair", title: "Руководство" }, pdfPage: 286,
    text: "Болты крепления крышек коренных подшипников: вертикальные 430–470 Нм; горизонтальные 100–120 Нм.", score: 2,
  }]);
  const response = await request("/api/manuals/search", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ engineModel: "ЯМЗ-236М2", query: "Какой момент затяжки болтов крышек коренных подшипников?", answer: true }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).manualAssessment, "insufficient_evidence");
  const { cases } = await (await request("/api/admin/qa-review")).json();
  assert.equal(cases.length, 1);
  assert.equal(cases[0].category, "no_evidence");
  assert.ok(cases[0].events[0].source_refs.length);
});
