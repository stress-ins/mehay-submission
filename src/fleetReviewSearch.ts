import { plateMatches } from "./plateSearch.ts";

export function fleetReviewSearchMatches(vehicle: { plate: string; model: string }, tickets: { title: string; id: string }[], query: string) {
  const needle = query.trim();
  if (!needle) return true;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s\-_.#]/gu, "");
  return plateMatches(vehicle.plate, needle) || normalize(vehicle.model).includes(normalize(needle)) ||
    tickets.some((ticket) => normalize(`${ticket.title} ${ticket.id}`).includes(normalize(needle)));
}
