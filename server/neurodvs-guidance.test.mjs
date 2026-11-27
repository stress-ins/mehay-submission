import test from "node:test";
import assert from "node:assert/strict";
import { createGuidanceRepository } from "./neurodvs-guidance.mjs";

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
  const repository = createGuidanceRepository([item], { ...options, manuals: manualsWithProcedure });
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
