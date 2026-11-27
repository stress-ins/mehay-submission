type NeuroTool = "diagnose" | "ticket" | "manual";

// Only standalone commands can submit a ticket. Questions and quoted examples go to the manuals.
const commands: { tool: NeuroTool; pattern: RegExp }[] = [
  { tool: "ticket", pattern: /^(?:создай(?:те)?|создать|оформи(?:те)?|оформить|отправь(?:те)?) (?:заявку|заявку на (?:то|ремонт|дефектовку)|заявку (?:в )?тоир)$/u },
  { tool: "diagnose", pattern: /^(?:(?:получить|получи(?:те)?|покажи(?:те)?) (?:результат диагностики|диагноз)|(?:запусти(?:те)?|запустить|проведи(?:те)?|провести) (?:диагностику|проверку))$/u },
];

export function selectNeuroTool(message: string): NeuroTool {
  const command = message.toLocaleLowerCase("ru").trim().replace(/[.!]+$/u, "").replace(/\s+/gu, " ");
  return commands.find(({ pattern }) => pattern.test(command))?.tool ?? "manual";
}
