import test from "node:test";
import assert from "node:assert/strict";
import { createAcousticDiagnostics } from "./acoustic-diagnostics.mjs";

test("demo fleet has the specified engine counts and 3–5 checks per vehicle", () => {
  const diagnostics = createAcousticDiagnostics();
  const vehicles = diagnostics.listVehicles();
  assert.equal(vehicles.length, 50);
  assert.deepEqual(Object.fromEntries([...new Set(vehicles.map((v) => v.engine))].map((engine) => [engine, vehicles.filter((v) => v.engine === engine).length])), {
    "ЯМЗ-236М2": 13, "ЯМЗ-536": 12, "ЗМЗ-5234.10": 13, "ЗМЗ-40905.10": 8, "ЗМЗ-40904.10": 4
  });
  for (const vehicle of vehicles) {
    const full = diagnostics.getVehicle(vehicle.id);
    assert.ok(full.checks.length >= 3 && full.checks.length <= 5);
    assert.ok(full.checks.every((check) => /^F(?:0[1-9]|1[0-4])$/.test(check.code)));
  }
  assert.equal(diagnostics.getVehicle("missing"), null);
});

test("answers cite physical pages only for selected engine and fall back without evidence", () => {
  const pages = [
    { engine: "ЗМЗ-40905.10", title: "Учебный фрагмент A", page: 17, text: "Учебный текст: посторонний шум при работе двигателя." },
    { engine: "ЯМЗ-536", title: "Учебный фрагмент B", page: 42, text: "Измерьте давление топлива при 1200 об/мин. Давление масла 1,5 бар." },
    { engine: "ЯМЗ-536", title: "Учебный фрагмент C", page: 43, text: "Давление топлива — 2,3 бар." },
    { engine: "ЯМЗ-536", title: "Учебный фрагмент D", page: 44, text: "Проверьте давление топлива при давлении масла 1,5 бар. Измерьте температуру масла." },
    { engine: "ЯМЗ-536", title: "Учебный фрагмент E", page: 45, text: "Давление топлива: 2 бар — неверное показание датчика." },
    { engine: "ЯМЗ-536", title: "Учебный фрагмент F", page: 46, text: "Давление топлива: 2 бар. Это пример неверного показания датчика." }
  ];
  const diagnostics = createAcousticDiagnostics({ pages });
  const uaz = diagnostics.listVehicles().find((v) => v.engine === "ЗМЗ-40905.10");
  const check = diagnostics.getVehicle(uaz.id).checks[0];
  const answer = diagnostics.answer(uaz.id, check.id, "Опишите шум двигателя");
  assert.equal(answer.status, "supported");
  assert.deepEqual(answer.sources, [{ title: "Учебный фрагмент A", page: 17, text: pages[0].text }]);
  assert.equal(diagnostics.answer(uaz.id, check.id, "Что делать по признакам?").status, "supported");
  assert.equal(diagnostics.answer(uaz.id, check.id, "Какое давление топлива?").status, "insufficient");
  const maz = diagnostics.listVehicles().find((v) => v.engine === "ЯМЗ-536");
  const pressure = diagnostics.answer(maz.id, diagnostics.getVehicle(maz.id).checks[0].id, "Какое давление топлива?");
  assert.equal(pressure.status, "supported");
  assert.deepEqual(pressure.sources.map((source) => source.page), [43]);
  for (const question of ["Какое давление топлива при 90 °C?", "Какая температура масла?"]) {
    assert.equal(diagnostics.answer(maz.id, diagnostics.getVehicle(maz.id).checks[0].id, question).status, "insufficient", question);
  }
  assert.equal(diagnostics.answer(uaz.id, check.id, "Что делать при отказе турбокомпрессора?").status, "insufficient");
  for (const question of [
    "Какой момент затяжки нужен при постороннем шуме?",
    "Какой артикул детали нужен при постороннем шуме?",
    "При постороннем шуме какой норматив давления масла?"
  ]) {
    const partial = diagnostics.answer(uaz.id, check.id, question);
    assert.equal(partial.status, "insufficient", question);
    assert.deepEqual(partial.sources, []);
    assert.match(partial.recommendation, /дефектовк/u);
  }
  const unsupported = diagnostics.answer(uaz.id, check.id, "Какая нужна деталь и момент затяжки?");
  assert.equal(unsupported.status, "insufficient");
  assert.match(unsupported.recommendation, /дефектовк/u);
  assert.deepEqual(unsupported.sources, []);
  const otherUaz = diagnostics.listVehicles().find((v) => v.engine === "ЗМЗ-40904.10");
  assert.equal(diagnostics.answer(otherUaz.id, diagnostics.getVehicle(otherUaz.id).checks[0].id, "шум двигателя").sources[0].page, 17);
  assert.equal(diagnostics.answer(otherUaz.id, check.id, "шум двигателя"), null);
  assert.equal(diagnostics.answer("missing", check.id, "шум"), null);
  assert.throws(() => createAcousticDiagnostics({ pages: [{ ...pages[0], engine: "unknown" }] }), /page/u);
});

test("demo excerpts support a symptom lookup and cannot supply missing specifications or causes", () => {
  const diagnostics = createAcousticDiagnostics();
  const [vehicle] = diagnostics.listVehicles();
  const [check] = diagnostics.getVehicle(vehicle.id).checks;
  assert.equal(diagnostics.answer(vehicle.id, check.id, "Посторонний шум").status, "supported");
  assert.equal(diagnostics.answer(vehicle.id, check.id, "Опишите шум двигателя?").status, "supported");
  for (const question of ["Какие нормы ремонта?", "Какая причина при постороннем шуме?"]) {
    const answer = diagnostics.answer(vehicle.id, check.id, question);
    assert.equal(answer.status, "insufficient", question);
    assert.deepEqual(answer.sources, []);
    assert.match(answer.recommendation, /дефектовк/u);
  }
});

test("submits replay only matching scoped key and payload; instances reset", () => {
  const create = () => createAcousticDiagnostics();
  const first = create();
  const [a, b] = first.listVehicles();
  const check = first.getVehicle(a.id).checks[0];
  const payload = { observation: "шум", works: "осмотр", parts: "" };
  assert.deepEqual(first.submit(a.id, check.id, payload, "k"), { number: "TKT-0001" });
  assert.deepEqual(first.submit(a.id, check.id, payload, "k"), { number: "TKT-0001" });
  assert.deepEqual(first.submit(a.id, check.id, { ...payload, parts: "деталь" }, "k"), { conflict: true });
  assert.deepEqual(first.submit(b.id, first.getVehicle(b.id).checks[0].id, payload, "k"), { number: "TKT-0002" });
  const restarted = create();
  assert.deepEqual(restarted.submit(a.id, check.id, payload, "k"), { number: "TKT-0001" });
  assert.equal(first.submit(a.id, "bad-check", payload, "other"), null);
});

test("demo submissions stop at the bounded in-memory capacity", () => {
  const diagnostics = createAcousticDiagnostics();
  const vehicle = diagnostics.listVehicles()[0];
  const check = diagnostics.getVehicle(vehicle.id).checks[0];
  for (let i = 0; i < 5000; i++) assert.ok(diagnostics.submit(vehicle.id, check.id, {}, `k${i}`).number);
  assert.deepEqual(diagnostics.submit(vehicle.id, check.id, {}, "overflow"), { capacity: true });
});
