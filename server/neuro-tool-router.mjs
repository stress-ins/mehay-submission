const descriptions = {
  diagnose: "Fetch the diagnostic result for the selected measurement when the mechanic asks to see or run the analysis.",
  manual: "Search the engine manual for technical questions about causes, safety, specifications, checks, and repairs. Use this for hypothetical questions.",
  vehicle_history: "Retrieve past diagnostic measurements and registered work order IDs for this one selected vehicle.",
  history: "Retrieve workshop experience with similar repairs, earlier delays, parts used, planned and actual work time.",
  ticket: "Show the ticket confirmation when the mechanic asks to file a work order for this diagnosis. Questions about tickets are not requests to create one.",
};
const tools = Object.entries(descriptions).map(([name, description]) => ({
  type: "function", function: { name, description, parameters: { type: "object", properties: {}, additionalProperties: false } },
}));

export async function chooseNeuroToolDecision({ query, hasDiagnosis, canCreateTicket }, { apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) return { tool: "fallback", errorCode: "provider_unavailable" };
  const available = tools.filter(t => t.function.name !== "ticket" || (hasDiagnosis && canCreateTicket));
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(5500),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-5.4-mini", tools: available, tool_choice: "required",
        messages: [
          { role: "system", content: `Choose one workshop tool for the request in its original language. The vehicle and measurement are selected. Diagnosis shown: ${hasDiagnosis}. Do not answer the question yourself.` },
          { role: "user", content: query },
        ],
      }),
    });
    if (!response.ok) return { tool: "fallback", errorCode: "provider_error" };
    const calls = (await response.json()).choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(calls) || calls.length !== 1) return { tool: "fallback", errorCode: "invalid_provider_response" };
    const name = calls[0]?.function?.name;
    return available.some(t => t.function.name === name)
      ? { tool: name, errorCode: null }
      : { tool: "fallback", errorCode: "invalid_provider_response" };
  } catch {
    return { tool: "fallback", errorCode: "provider_error" };
  }
}

export async function chooseNeuroTool(args, options) {
  return (await chooseNeuroToolDecision(args, options)).tool;
}

export function mountNeuroToolRouter(app) {
  app.post("/api/neuro/tool-route", async (req, res) => {
    const { query, hasDiagnosis, canCreateTicket } = req.body ?? {};
    if (typeof query !== "string" || !query.trim() || query.length > 1500 || typeof hasDiagnosis !== "boolean" || typeof canCreateTicket !== "boolean") {
      return res.status(400).json({ error: "invalid_tool_request" });
    }
    const decision = await chooseNeuroToolDecision({ query: query.trim(), hasDiagnosis, canCreateTicket });
    req.qaRouteDecision = decision.tool;
    req.qaRouteError = decision.errorCode;
    res.set("Cache-Control", "no-store").json({ tool: decision.tool });
  });
}
