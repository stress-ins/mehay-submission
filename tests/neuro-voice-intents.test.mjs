import test from "node:test";
import assert from "node:assert/strict";
import {
  historyAnswerKind,
  isDiagnosisCommand,
  isRepairHistoryQuestion,
  isTicketCommand,
  mechanicVoiceExamples,
  voiceConfirmation,
} from "../src/neuroVoiceIntents.ts";

test("every displayed language example routes to its matching mechanic action", () => {
  for (const [language, [diagnosis, hours, part, ticket]] of Object.entries(mechanicVoiceExamples)) {
    assert.equal(isDiagnosisCommand(diagnosis, language), true, `${language} diagnosis example`);
    assert.equal(isRepairHistoryQuestion(hours, language), true, `${language} hours example`);
    assert.equal(historyAnswerKind(hours, language), "hours", `${language} hours answer`);
    assert.equal(isRepairHistoryQuestion(part, language), true, `${language} part example`);
    assert.equal(historyAnswerKind(part, language), "part", `${language} part answer`);
    assert.equal(isTicketCommand(ticket, language), true, `${language} ticket example`);
  }
});

test("English confirmation accepts the visible phrase after case normalization", () => {
  assert.equal(voiceConfirmation("Yes, I confirm", "en"), true);
  assert.equal(voiceConfirmation("YES I CONFIRM.", "en"), true);
});
