import test from "node:test";
import assert from "node:assert/strict";
import { chooseNeuroTool, chooseNeuroToolDecision } from "./neuro-tool-router.mjs";

const context = { query: "Что в прошлый раз задержало ремонт?", hasDiagnosis: true, canCreateTicket: true };

test("routes a free question by requesting one named tool without transmitting fleet identifiers", async () => {
  const route = await chooseNeuroTool({ ...context, vehicleId: "private-plate" }, { apiKey: "fixture", fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.tools.map(t => t.function.name), ["diagnose", "manual", "vehicle_history", "history", "ticket"]);
    assert.ok(!options.body.includes("private-plate"));
    return Response.json({ choices: [{ message: { tool_calls: [{ type: "function", function: { name: "history", arguments: "{}" } }] } }] });
  } });
  assert.equal(route, "history");
});

test("disallows unavailable actions and falls back if the model cannot pick exactly one known tool", async () => {
  const call = name => ({ type: "function", function: { name, arguments: "{}" } });
  for (const calls of [[call("ticket")], [call("buy")], [call("history"), call("manual")], []]) {
    assert.equal(await chooseNeuroTool({ ...context, canCreateTicket: false }, { apiKey: "fixture", fetchImpl: async () =>
      Response.json({ choices: [{ message: { tool_calls: calls } }] }) }), "fallback");
  }
  assert.equal(await chooseNeuroTool(context, { apiKey: "", fetchImpl: () => assert.fail() }), "fallback");
});

test("captures only categorical routing failures for internal review", async () => {
  assert.deepEqual(await chooseNeuroToolDecision(context, { apiKey: "" }), { tool: "fallback", errorCode: "provider_unavailable" });
  assert.deepEqual(await chooseNeuroToolDecision(context, { apiKey: "fixture", fetchImpl: async () => new Response("", { status: 503 }) }), { tool: "fallback", errorCode: "provider_error" });
  assert.deepEqual(await chooseNeuroToolDecision(context, { apiKey: "fixture", fetchImpl: async () => Response.json({ choices: [] }) }), { tool: "fallback", errorCode: "invalid_provider_response" });
});
