export type ConversationLoadState = "loading" | "ready" | "error";

export function visibleConversation<T extends { id: string }>(args: {
  activeContext: string;
  loadedContext: string | null;
  loadState: ConversationLoadState;
  serverSnapshot: T[];
  pendingWrites: T[];
}): T[] {
  if (args.loadState !== "ready" || !args.loadedContext || args.loadedContext !== args.activeContext) return [];
  const serverIds = new Set(args.serverSnapshot.map(item => item.id));
  return [...args.serverSnapshot, ...args.pendingWrites.filter(item => !serverIds.has(item.id))].slice(-50);
}

export function canSaveAssignments(args: { selectedVehicleId: string; loadedVehicleId: string | null; loading: boolean; saving: boolean }): boolean {
  return Boolean(args.selectedVehicleId && args.loadedVehicleId === args.selectedVehicleId && !args.loading && !args.saving);
}
