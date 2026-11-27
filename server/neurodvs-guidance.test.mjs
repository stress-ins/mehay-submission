import test from "node:test";
import assert from "node:assert/strict";
import { createGuidanceRepository } from "./neurodvs-guidance.mjs";
import { zmzF01Workplan } from "./zmz-f01-workplan.mjs";

const manuals = [{ id: "sample-guide", title: "Synthetic service guide", engineKeys: ["test-100"] }];
const item = {
  engineModel: "TEST-100", anomalyType: "F01", manualId: "sample-guide", pdfPage: 1,
  text: "Perform the sample check.", quote: "Synthetic source line.", stepKey: "sample",
  translations: { en: "Perform the sample check.", hi: "नमूना जाँच करें।", tg: "Санҷиши намунавиро иҷро кунед.", uz: "Namunaviy tekshiruvni bajaring." },
};
const options = {
  manuals,
  getManualById: (id) => id === "sample-guide" ? { ...manuals[0], filename: "sample.pdf" } : null,
  getPageText: (id, page) => id === "sample-guide" && page === 1 ? "Header\nSynthetic source line.\nFooter" : null,
};

test("verified synthetic guidance is scoped to the exact engine and returns stored translations", () => {
  const repository = createGuidanceRepository([item], options);
  const result = repository.recommendationsFor({ engine_model: "TEST-100" }, { anomaly_type: "F01" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].translations, item.translations);
  assert.deepEqual(repository.recommendationsFor({ engine_model: "TEST-101" }, { anomaly_type: "F01" }), []);
  assert.deepEqual(repository.recommendationsFor({ engine_model: "TEST-100" }, { anomaly_type: "F02" }), []);
});

test("rejects synthetic guidance whose citation quote is not present on its indexed page", () => {
  assert.throws(() => createGuidanceRepository([{ ...item, quote: "Missing line." }], options), /Invalid verified guidance entry/);
});

test("builds the ZMZ F01 procedure only from the verified manual pages and cites the reassembly diagram", () => {
  const manual = { id: "zmz-40904-40905", sha256: "99cf64334c578d668ce67bc4c9a1d7b0bb1e9c59ddac982b6061ea18533a7147", engineKeys: ["змз-40905.10"] };
  const pages = new Map([
    [142, "TEMP 80…90 °С; CHECK 30 мин; RUN 3…4 мин; FIX 2500 об/мин"],
    [143, "RANGE 2000…3000 об/мин; LISTEN 15…30 с; REPEAT 5 раз; EXTRA 15 мин; SOURCE источник стука"],
    [136, "WIRES провода и шланги"],
    [114, "VENT вентиляции картера"],
    [186, "TORQUE 6,9...8,8 Н·м рис.147"],
    [187, "Рис.147 крышки клапанов"],
  ]);
  const steps = zmzF01Workplan(manual, (_id, page) => pages.get(page));
  assert.deepEqual(steps.map(({ pdfPage }) => pdfPage), [142, 142, 143, 143, 143, 143, 136, 114, 186]);
  assert.deepEqual(steps.map(({ stepKey }) => stepKey), ["zmz_f01_warmup", "zmz_f01_operating_cycle", "zmz_f01_variable_cycle", "zmz_f01_listen_idle", "zmz_f01_retry_cycle", "zmz_f01_localize_source", "zmz_f01_disconnect", "zmz_f01_ventilation", "zmz_f01_reassemble"]);
  assert.ok(steps.every(({ quote }) => quote.split(/\s+/u).length <= 3));
  assert.equal(steps[0].translations.en.startsWith("Warm the engine"), true);
  assert.match(steps.at(-1).illustrationUrl, /pages\/187\.png$/u);
  assert.match(steps.at(-1).illustrationCaption, /Рис\.147/u);
  assert.deepEqual(zmzF01Workplan({ ...manual, sha256: "stale" }, (_id, page) => pages.get(page)), []);
  pages.delete(187);
  assert.deepEqual(zmzF01Workplan(manual, (_id, page) => pages.get(page)), []);
});

test("workshop steps require independent page evidence and preserve the parent operation", () => {
  const step = { ...item, title: "Sample checkpoint" };
  const [operation] = createGuidanceRepository([{ ...item, procedure: [step] }], options)
    .recommendationsFor({ engine_model: item.engineModel }, { anomaly_type: item.anomalyType });
  assert.equal(operation.text, item.text);
  assert.equal(operation.procedure[0].title, step.title);
  assert.match(operation.procedure[0].url, /page=1$/);
  assert.throws(() => createGuidanceRepository([{ ...item, procedure: [{ ...step, pdfPage: 5 }] }], options), /Invalid verified/);
});

test("current manual-index procedure attaches to curated guidance with its own source citation", () => {
  const step = { ...item, title: "Verified step" };
  const procedure = { ...item, sourceSha256: "current-pdf-sha", procedure: [step] };
  const manualsWithProcedure = [{ ...manuals[0], sha256: "current-pdf-sha", procedures: [procedure] }];
  const repository = createGuidanceRepository([item], { ...options, manuals: manualsWithProcedure, getManualById: () => manualsWithProcedure[0] });
  const [result] = repository.recommendationsFor({ engine_model: item.engineModel }, { anomaly_type: item.anomalyType });
  assert.equal(result.text, item.text);
  assert.equal(result.procedure[0].title, "Verified step");
  assert.match(result.procedure[0].url, /page=1$/);
});

test("manual-index procedures with stale or missing PDF SHA are ignored", () => {
  const procedure = { ...item, sourceSha256: "old-pdf-sha", procedure: [{ ...item, title: "Old step" }] };
  const manualsWithProcedure = [{ ...manuals[0], sha256: "current-pdf-sha", procedures: [procedure] }];
  const repository = createGuidanceRepository([item], { ...options, manuals: manualsWithProcedure });
  const [result] = repository.recommendationsFor({ engine_model: item.engineModel }, { anomaly_type: item.anomalyType });
  assert.equal(result.procedure, undefined);
});

test("current SHA does not bypass source-page quote validation", () => {
  const procedure = { ...item, sourceSha256: "current-pdf-sha", procedure: [{ ...item, title: "Bad quote", quote: "Not on page" }] };
  const manualsWithProcedure = [{ ...manuals[0], sha256: "current-pdf-sha", procedures: [procedure] }];
  assert.throws(() => createGuidanceRepository([item], { ...options, manuals: manualsWithProcedure }), /Invalid verified/);
});

test("private schema fields scope synthetic guidance while old-format entries remain the fallback", () => {
  const sourceSha256 = "a".repeat(64);
  const privateManual = { ...manuals[0], engineKeys: ["test-200"], sha256: sourceSha256 };
  const legacy = { ...item, engineModel: "TEST-200", manualId: "sample-guide", pdfPage: 1, quote: "Synthetic fallback source." };
  const contextual = {
    ...item, engineModel: "TEST-200", manualId: "sample-guide", pdfPage: 2,
    quote: "Synthetic contextual source.", sourceSha256, complaintTerms: ["brake", "noise"],
    supersedes: [{ manualId: "sample-guide", pdfPage: 1 }],
  };
  const repository = createGuidanceRepository([legacy, contextual], {
    ...options,
    manuals: [privateManual],
    getManualById: (id) => id === "sample-guide" ? { ...privateManual, filename: "sample.pdf" } : null,
    getPageText: (_id, page) => page === 1 ? legacy.quote : page === 2 ? contextual.quote : null,
  });
  const matching = repository.recommendationsFor({ engine_model: "TEST-200" }, {
    anomaly_type: "F01", description: "BRAKE squeal, unusual noise",
  });
  assert.deepEqual(matching.map(({ pdfPage }) => pdfPage), [2]);
  assert.equal("complaintTerms" in matching[0], false);
  assert.equal("sourceSha256" in matching[0], false);
  assert.equal("supersedes" in matching[0], false);
  assert.deepEqual(repository.recommendationsFor({ engine_model: "TEST-200" }, { anomaly_type: "F01" }).map(({ pdfPage }) => pdfPage), [1]);
  assert.deepEqual(repository.recommendationsFor({ engine_model: "TEST-201" }, { anomaly_type: "F01", description: "brake noise" }), []);
  assert.throws(() => createGuidanceRepository([{ ...contextual, sourceSha256: "b".repeat(64) }], {
    ...options, manuals: [privateManual], getManualById: () => privateManual,
    getPageText: (_id, page) => page === 2 ? contextual.quote : null,
  }), /Invalid verified guidance entry/);
});
