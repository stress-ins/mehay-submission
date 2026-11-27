import test from "node:test";
import assert from "node:assert/strict";
import { bindVoiceTicket, matchesVoiceTicket } from "../src/voiceTicketBinding.ts";

test("voice ticket confirmation matches only the bound vehicle, session, and diagnosis", () => {
  const diagnosis = { id: "d1", status: "anomaly" };
  const binding = bindVoiceTicket("vehicle-1", "session-1", diagnosis);

  assert.equal(matchesVoiceTicket(binding, "vehicle-1", "session-1", diagnosis), true);
  assert.equal(matchesVoiceTicket(binding, "vehicle-2", "session-1", diagnosis), false);
  assert.equal(matchesVoiceTicket(binding, "vehicle-1", "session-2", diagnosis), false);
  assert.equal(matchesVoiceTicket(binding, "vehicle-1", "session-1", { ...diagnosis }), false);
  assert.equal(bindVoiceTicket("vehicle-1", "session-1", null), null);
});
