import assert from "node:assert/strict";
import test from "node:test";
import { selectNeuroTool } from "../src/neuroTools.ts";

test("standalone Russian commands select a tool, questions and negation cannot submit tickets", () => {
  assert.equal(selectNeuroTool("Получить результат диагностики"), "diagnose");
  assert.equal(selectNeuroTool("Оформи заявку на дефектовку."), "ticket");
  for (const question of ["Как создать заявку?", "Не создавай заявку", "Создать заявку?", "Почему это опасно?"]) {
    assert.equal(selectNeuroTool(question), "manual");
  }
});
