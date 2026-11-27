import test from "node:test";
import assert from "node:assert/strict";
import { mechanicPlanIntent, stepHint, hasStepValue } from "../src/neuroPlanIntents.ts";

test("natural Russian plan commands map to navigation and completion", () => {
  assert.equal(mechanicPlanIntent("Ну что мне дальше делать?", "ru"), "repeat");
  assert.equal(mechanicPlanIntent("дальше", "ru"), "next");
  assert.equal(mechanicPlanIntent("что дальше?", "ru"), "next");
  assert.equal(mechanicPlanIntent("повтори шаг", "ru"), "repeat");
  assert.equal(mechanicPlanIntent("покажи рисунок", "ru"), "figure");
  assert.equal(mechanicPlanIntent("сделал", "ru"), "done");
  assert.equal(mechanicPlanIntent("готово!", "ru"), "done");
});

test("localized plan commands use the selected voice language", () => {
  assert.equal(mechanicPlanIntent("read next step", "en"), "next");
  assert.equal(mechanicPlanIntent("हो गया", "hi"), "done");
  assert.equal(mechanicPlanIntent("қадами навбатӣ", "tg"), "next");
  assert.equal(mechanicPlanIntent("qadamni takrorlang", "uz"), "repeat");
  assert.equal(mechanicPlanIntent("how many hours did repair take", "en"), null);
});

test("previous, diagram, torque, and clearance commands work in each supported language", () => {
  const examples = {
    en: ["go to previous step", "show the diagram", "what is the tightening torque?", "which feeler gauge"],
    hi: ["पिछला चरण", "आरेख दिखाएँ।", "कसने का टॉर्क कितना", "कौन सा फीलर गेज"],
    tg: ["қадами пешина", "нақшаро нишон деҳ", "моменти кашиш чӣ қадар", "бо кадом щуп"],
    uz: ["oldingi qadam", "diagrammani ko'rsat", "tortish momenti qancha", "klapan bo‘shliq qancha"],
  };
  for (const [language, [previous, diagram, torque, clearance]] of Object.entries(examples)) {
    assert.equal(mechanicPlanIntent(previous, language), "previous", `${language} previous`);
    assert.equal(mechanicPlanIntent(diagram, language), "figure", `${language} diagram`);
    assert.equal(mechanicPlanIntent(torque, language), "torque", `${language} torque`);
    assert.equal(mechanicPlanIntent(clearance, language), "clearance", `${language} clearance`);
  }
});

test("workshop voice asks about the current fastener and navigates without completing a step", () => {
  assert.equal(mechanicPlanIntent("как затянуть?", "ru"), "torque");
  assert.equal(mechanicPlanIntent("повтори!", "ru"), "repeat");
  assert.equal(mechanicPlanIntent("шаг назад", "ru"), "previous");
  assert.equal(mechanicPlanIntent("какой зазор?", "ru"), "clearance");
  assert.equal(hasStepValue("torque", "Ключ S=14"), false);
  assert.equal(hasStepValue("clearance", "Ширина 1 мм"), false);
  assert.match(stepHint("torque", "Учебный узел, условно 9 Н·м", 4), /^Учебный.*Страница 4/);
  assert.match(stepHint("torque", "Сверьте метку", 6), /не указан.*Страница 6/);
  assert.equal(stepHint("torque", "Reference text", 6, "en"), "No torque value is specified for this step. Reference text Page 6.");
  assert.equal(stepHint("clearance", "Source says no number.", 7, "hi"), "इस चरण के लिए संख्यात्मक क्लियरेंस निर्दिष्ट नहीं है। Source says no number. पृष्ठ 7.");
  assert.equal(stepHint("torque", "Исходная фраза без числа", 8, "tg", true), "Исходная фраза без числа Саҳифа 8.");
  assert.equal(stepHint("clearance", "Зазор 2 мм", 9, "uz", false), "Bu qadamda sonli oraliq ko‘rsatilmagan. Зазор 2 мм Sahifa 9.");
});
