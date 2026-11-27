import assert from "node:assert/strict";
import test from "node:test";
import { answerFromManuals, isRoadworthinessQuestion, isYamzMainBearingTorqueQuestion, translateManualText, yamzMainBearingTorqueAssessment } from "./manual-answer.mjs";

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

test("roadworthiness recognition covers movement decisions without catching mechanic questions", () => {
  for (const query of [
    "Можно ли своим ходом доехать до базы?",
    "Can I drive the car to the workshop?",
    "क्या मैं गाड़ी चलाकर ले जा सकता हूँ?",
    "Оё мошинро бо қувваи худ бурдан мумкин аст?",
    "Avtomobilni o'z yurishi bilan olib borish mumkinmi?",
  ]) assert.equal(isRoadworthinessQuestion(query), true, query);
  for (const query of [
    "Как проверить давление масла?",
    "How do I check the oil pressure?",
    "क्या इंजन चालू होने पर दबाव जांचें?",
    "Чӣ тавр фишори равғанро санҷидан мумкин аст?",
    "Dvigatel moy bosimini qanday tekshirish mumkin?",
  ]) assert.equal(isRoadworthinessQuestion(query), false, query);
});

test("repair excerpts cannot authorize driving a vehicle with a fault", async () => {
  const result = await answerFromManuals({
    pages: [{ text: "Низкое давление масла\nПерегрев\nЗаглушить двигатель" }],
    query: "Можно ли своим ходом перегнать машину на базу?",
    fetchImpl: () => { throw new Error("unexpected provider request"); },
  });
  assert.deepEqual(result, { answer: "По имеющимся данным нельзя определить, можно ли перегонять автомобиль своим ходом. Допуск к движению оценивает механик после осмотра; этот ответ не подтверждает безопасность движения.", results: [] });
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

test("YaMZ main bearing cap values retain OEM scope without treating a split-orientation table as a conflict", async () => {
  const pages = [
    { manual: { id: "yamz-236-repair", title: "Repair manual" }, pdfPage: 56, text: "При измерении размера отверстий под вкладыши коренных подшипников болты крепления крышек коренных подшипников должны быть затянуты моментом силы от 421 до 461 Н·м (от 43 до 47 кгс·м), стяжные болты должны быть затянуты моментом силы от 88 до 118 Н·м." },
    { manual: { id: "yamz-236-repair", title: "Repair manual" }, pdfPage: 248, text: "Крышки коренных подшипников коленчатого вала должны быть закреплены в следующем порядке: затянуть болты крепления крышек коренных подшипников не менее, чем в три приема, моментом силы от 421 до 461 Нм (от 42 до 46 кгс·м); затянуть стяжные болты моментом силы от 90 до 120 Нм." },
    { manual: { id: "yamz-236-repair", title: "Repair manual" }, pdfPage: 286, text: "Болты крепления крышек коренных подшипников: вертикальные 430-470 (43-47); горизонтальные 100-120 (10-12) Н·м (кгс·м)." },
  ];
  const query = "ЯМЗ-236М2 момент затяжки болтов крышек коренных подшипников";
  assert.equal(isYamzMainBearingTorqueQuestion("ЯМЗ-236М2", query), true);
  assert.equal(isYamzMainBearingTorqueQuestion("ЗМЗ-409", "момент болтов крышки коренного подшипника"), false);
  const assessment = yamzMainBearingTorqueAssessment(pages);
  assert.equal(assessment.manualAssessment, "insufficient_evidence");
  assert.deepEqual(assessment.results.map(({ pdfPage }) => pdfPage), [56, 248, 286]);
  assert.match(assessment.answer, /измерению, сборке/i);
  assert.match(assessment.answer, /не подтверждает конфликт/i);
  assert.match(assessment.answer, /уточните операцию и направление болта/i);
  for (const page of pages) assert.ok(assessment.answer.includes(page.text));
  const sourced = await answerFromManuals({ pages, engineModel: "ЯМЗ-236М2", query, fetchImpl: () => assert.fail("a sourced conflict needs no model call") });
  assert.equal(sourced.manualAssessment, "insufficient_evidence");
  assert.deepEqual(sourced.results.map(({ pdfPage }) => pdfPage), [56, 248, 286]);
  assert.equal(yamzMainBearingTorqueAssessment([{ ...pages[0], manual: { id: "other", title: "Other" } }]), null);
  assert.equal(yamzMainBearingTorqueAssessment([{ ...pages[0], text: "unrelated table 12 N·m" }]), null);
  assert.equal(yamzMainBearingTorqueAssessment([pages[2]]).manualAssessment, "insufficient_evidence");
});

test("YaMZ torque conflict requires different values for the same orientation from two pages", () => {
  const pages = [
    { manual: { id: "yamz-236-repair", title: "Repair manual" }, pdfPage: 248, text: "Болты крепления крышек коренных подшипников: вертикальные 421-461 Нм." },
    { manual: { id: "yamz-236-repair", title: "Repair manual" }, pdfPage: 286, text: "Болты крепления крышек коренных подшипников: вертикальные 430-470 Нм; горизонтальные 100-120 Нм." },
  ];
  const assessment = yamzMainBearingTorqueAssessment(pages);
  assert.equal(assessment.manualAssessment, "conflict");
  assert.deepEqual(assessment.results.map(({ pdfPage }) => pdfPage), [248, 286]);
  assert.match(assessment.answer, /одного и того же направления болтов/i);
  for (const page of pages) assert.ok(assessment.answer.includes(page.text));
  assert.equal(yamzMainBearingTorqueAssessment([pages[1]]).manualAssessment, "insufficient_evidence");

  const differentOperations = [
    { manual: pages[0].manual, pdfPage: 56, text: "При измерении размера отверстий под вкладыши коренных подшипников болты крепления крышек: вертикальные 421-461 Нм." },
    { manual: pages[0].manual, pdfPage: 248, text: "При сборке двигателя болты крепления крышек коренных подшипников: вертикальные 430-470 Нм." },
  ];
  assert.equal(yamzMainBearingTorqueAssessment(differentOperations).manualAssessment, "insufficient_evidence");
});

test("YaMZ torque ranges preserve bolt orientation with Cyrillic case and word separators", () => {
  const page = (pdfPage, value) => ({ manual: { id: "yamz-236-repair", title: "Руководство" }, pdfPage,
    text: "При сборке двигателя болты крепления крышек коренных подшипников. " + value });
  const first = page(248, "Вертикальные болты: от 421 до 461 Нм.");
  assert.equal(yamzMainBearingTorqueAssessment([first, page(286, "вертикальные болты: от 430 до 470 Нм.")]).manualAssessment, "conflict");
  assert.equal(yamzMainBearingTorqueAssessment([first, page(286, "Горизонтальные болты: от 100 до 120 Нм.")]).manualAssessment, "insufficient_evidence");
});
