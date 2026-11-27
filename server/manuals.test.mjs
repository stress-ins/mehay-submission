import test from "node:test";
import assert from "node:assert/strict";
import { createManualRepository } from "./manuals.mjs";

const repository = createManualRepository({ version: 1, manuals: [
  { id: "zmz-40904-40905", title: "Synthetic service guide", filename: "sample.pdf", engineKeys: ["ЗМЗ-40904.10", "ЗМЗ-40905.10"], pageCount: 2, sha256: "a".repeat(64), pages: [
    { pdfPage: 1, text: "Shared calibration procedure for the sample assembly. Проверка подшипниками после цикла." },
    { pdfPage: 2, text: "ЗМЗ-40904.10 only: tighten the bracket fastener to 12 N·m." },
  ] },
] });

test("retrieves synthetic citations and excludes a page for another engine variant", async () => {
  const shared = await repository.searchManuals({ engineModel: "ЗМЗ-40905.10", query: "shared calibration procedure" });
  assert.equal(shared[0].pdfPage, 1);
  assert.equal(shared[0].manual.id, "zmz-40904-40905");
  assert.equal((await repository.searchManuals({ engineModel: "ЗМЗ-40905.10", query: "проверка подшипников" }))[0].pdfPage, 1);
  assert.deepEqual(await repository.searchManuals({ engineModel: "ЗМЗ-40905.10", query: "ЗМЗ-40904.10 bracket fastener" }), []);
  const specific = await repository.searchManuals({ engineModel: "ЗМЗ-40904.10", query: "bracket fastener tighten" });
  assert.equal(specific[0].pdfPage, 2);
});

test("index exposes allowlisted manual metadata without depending on bundled PDF content", () => {
  assert.deepEqual(repository.getManuals(), [{
    id: "zmz-40904-40905", title: "Synthetic service guide", filename: "sample.pdf",
    engineKeys: ["ЗМЗ-40904.10", "ЗМЗ-40905.10"], pageCount: 2, sha256: "a".repeat(64),
  }]);
  assert.equal(repository.manualById("zmz-40904-40905").filename, "sample.pdf");
  assert.equal(repository.manualById("../sample"), null);
});

test("manual index preserves verified procedure metadata for the guidance repository", () => {
  const procedure = { engineModel: "ЗМЗ-40904.10", anomalyType: "F01", sourceSha256: "a".repeat(64), procedure: [] };
  const indexed = createManualRepository({ version: 1, manuals: [{
    id: "sample", title: "Sample", filename: "sample.pdf", engineKeys: ["змз-40904.10"], sha256: "a".repeat(64), revision: "Edition 1",
    procedures: [procedure], pages: [{ pdfPage: 1, text: "source" }],
  }] });
  assert.deepEqual(indexed.getManuals()[0].procedures, [procedure]);
  assert.deepEqual(indexed.manualById("sample").procedures, [procedure]);
  assert.equal(indexed.getManuals()[0].revision, "Edition 1");
});

test("a shared valve section survives an unrelated engine paragraph, including a family name in the question", async () => {
  const manual = (id, pdfPage, text) => ({ id, title: "Учебный документ", filename: id + ".pdf", engineKeys: ["ЯМЗ-236М2"], pages: [{ pdfPage, text }] });
  const repo = createManualRepository({ manuals: [
    manual("yamz-236-operation", 8, "Для ЯМЗ-238КМ2 момент затяжки в демонстрации 77 Н·м.\nРЕГУЛИРОВКА КЛАПАННОГО МЕХАНИЗМА\nЗазоры учебного клапана регулируют на холодном двигателе или менее чем через 21 минуту после остановки."),
    manual("yamz-236-repair", 12, "Проверку зазора учебного клапана выполняют не ранее чем через 21 минуту после остановки."),
  ] });
  const search = query => repo.searchManuals({ engineModel: "ЯМЗ-236М2", query });
  const rows = await search("Достаточно ли ждать после остановки для регулировки клапанов ЯМЗ-236?");
  assert.deepEqual(rows.map(row => row.pdfPage), [8, 12]);
  assert.ok(rows.every(row => !row.text.includes("77 Н·м")));
  assert.deepEqual(await search("Когда регулировать клапаны ЯМЗ-238КМ2?"), []);
  assert.deepEqual(await search("Когда регулировать клапаны ЯМЗ-236КМ2?"), []);
  for (const otherTask of ["Когда менять клапан?", "Какова величина зазоров клапанов в миллиметрах?"]) {
    assert.ok((await search(otherTask)).every(row => !row.valveTiming));
  }
  const unrelated = await search("С каким моментом затяжки закрепить узел?");
  assert.ok(!unrelated.some(row => row.text.includes("77 Н·м")));
});
