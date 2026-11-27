import test from "node:test";
import assert from "node:assert/strict";
import { normalizeManualText } from "../src/manualText.ts";

test("manual text joins hard wraps while preserving paragraphs and ordered lettered steps", () => {
  const source = "Проверить состояние.\nа) износ коленчатого\nвала;\nпроизвести ремонт двигателя\nб) установить крышку.\n\nПроверить зазор.";
  assert.equal(normalizeManualText(source), "Проверить состояние.\nа) износ коленчатого вала; произвести ремонт двигателя\nб) установить крышку.\n\nПроверить зазор.");
});

test("manual reflow keeps technical hyphens, list markers, and existing cached text", () => {
  assert.equal(normalizeManualText("Снять топливно-\nнасосный модуль.\n1. Заменить форсунку.\n2. Проверить 25 Н·м."), "Снять топливно-насосный модуль.\n1. Заменить форсунку.\n2. Проверить 25 Н·м.");
});
