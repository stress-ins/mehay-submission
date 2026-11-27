import assert from "node:assert/strict";
import test from "node:test";
import { answerFromManuals, translateManualText } from "./manual-answer.mjs";

test("sourced answers display only the selected original PDF lines", async t => {
  const original = process.env.OPENROUTER_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original;
  });
  process.env.OPENROUTER_API_KEY = "mock";
  const page = { pdfPage: 12, text: "Sample table\nNominal value 18…24 N·m\nOther row" };
  const query = { pages: [page], engineModel: "TEST-100", query: "What is the nominal value?" };
  const respond = spans => async () => Response.json({ choices: [{message: {content: JSON.stringify({spans})}}] });
  const result = await answerFromManuals({...query, fetchImpl: respond([{page: 0, first: 0, last: 1}, {page: 12, first: 0, last: 1}])});
  assert.deepEqual(result.results, [{...page, text: "Sample table\nNominal value 18…24 N·m"}]);
  assert.deepEqual(await answerFromManuals({...query, fetchImpl: respond([])}), { results: [] });
  const lifterQuestion = { query: "В каком порядке снимать гидротолкатели?", pages: [{text: "Учебный пример: порядок снятия клапанов."}, {text: "Учебный пример: порядок снятия гидротолкателей."}] };
  const selected = await answerFromManuals({...lifterQuestion, fetchImpl: respond([{page: 0, first: 0, last: 0}, {page: 1, first: 0, last: 0}])});
  assert.deepEqual(selected.results, [lifterQuestion.pages[1]]);
  assert.deepEqual(await answerFromManuals({...query, fetchImpl: async () => new Response(null, {status:503})}), { results: [], answerUnavailable:true });
});

test("repair excerpts cannot authorize driving a vehicle with a fault", async () => {
  const result = await answerFromManuals({
    pages: [{ text: "Низкое давление масла\nПерегрев\nЗаглушить двигатель" }],
    query: "Можно ли своим ходом перегнать машину на базу?",
    fetchImpl: () => { throw new Error("unexpected provider request"); },
  });
  assert.deepEqual(result, { results: [] });
});

test("translation preserves numeric values from the manual", async t => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "mock";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });
  const response = translation => async () => Response.json({ choices: [{ message: { content: JSON.stringify({ translation }) } }] });
  const text = "Sample measurement 2,0…3,0 mm";
  const correct = "Sample measurement 2,0…3,0 mm";
  assert.equal(await translateManualText(text, "en", response(correct)), correct);
  assert.equal(await translateManualText(text, "en", response("Clearance 2,0…3,0 mm")), "Clearance 2,0…3,0 mm");
  assert.equal(await translateManualText(text, "en", response("Clearance 0.20…0.30 cm")), null);
  assert.equal(await translateManualText("Sample pressure 100 kPa", "en", response("Pressure 100 MPa")), null);
  assert.equal(await translateManualText(text, "hi", response("2…3 mm")), null);
  assert.equal(await translateManualText("Sample operation time up to 20 s", "en", response("Continuous operation for up to 20 minutes is permitted.")), null);
  assert.equal(await translateManualText("Проверить через 20 циклов", "en", response("Check after 20 hours")), null);
  assert.equal(await translateManualText("Sample distance 0,30 mm", "en", response("Distance 0.30 mm per second")), null);
  assert.equal(await translateManualText(text, "unknown", response(correct)), null);
});

test("a valve timing question with missing or agreeing sources cannot turn into a diagnosis or a confirmed conflict", async () => {
  const before = {manual: {id: "yamz-236-operation", title: "Учебный источник"}, pdfPage: 4, text: "Учебное условие.", valveTiming: {direction: "before", minutes: 21}};
  const same = {...before, manual: {id: "yamz-236-repair", title: "Другой учебный источник"}};
  for (const pages of [[], [before], [before, same]]) {
    const outcome = await answerFromManuals({pages, engineModel: "ЯМЗ-236М2", query: "Когда регулировать тепловые зазоры клапанов?", fetchImpl: () => assert.fail("unexpected model call")});
    assert.equal(outcome.manualAssessment, "insufficient_evidence");
    assert.equal(outcome.results.length, pages.length);
    assert.match(outcome.answer, /передайте вопрос старшему механику/);
  }
});
