type HistoricalWork = {
  match: "vehicle" | "engine" | "similar";
  actualHours: number;
  plannedHours: number;
};

export function repairExample<T extends HistoricalWork>(cases: T[], { includeSimilar = false } = {}): T | undefined {
  const comparable = cases.filter(item => item.match !== "similar");
  // Other engines are for explicitly labelled comparisons in the history browser.
  const candidates = comparable.length || !includeSimilar ? comparable : cases;
  return candidates.reduce<T | undefined>((best, item) =>
    !best || item.actualHours - item.plannedHours > best.actualHours - best.plannedHours ? item : best, undefined);
}
