export type RecordKind = "history" | "request" | "diagnostic" | "note";
export function assistantHistoryForRequest(history: { role: "user" | "assistant"; content: string }[]) {
  return history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 3000) }));
}
export type RecordTarget = { vehicleId: string; kind: RecordKind; recordId: string };
export type EvidenceRecord = RecordTarget & {
  id: string;
  vehiclePlate: string;
  title: string;
  date: string;
  summary: string;
  href: string;
};
export type AssistantEvidence = {
  records: EvidenceRecord[];
  citedRecordIds: string[];
  unresolvedCitations: string[];
  technicalCards: {
    id: string;
    title: string;
    status: "needs_verification";
    value: null;
    unit: string;
    appliesTo: string;
    missing: string[];
    reason: string;
  }[];
  checkedAt: string;
  truncated: boolean;
};

export function citedRecordForMarker(marker: string, evidence?: AssistantEvidence): EvidenceRecord | null {
  const match = /^\[(R\d+)\]$/.exec(marker);
  if (!match || !evidence || evidence.unresolvedCitations.includes(match[1]) ||
      !evidence.citedRecordIds.includes(match[1])) return null;
  return evidence.records.find((record) => record.id === match[1]) || null;
}

export function readRecordTarget(search: string): RecordTarget | null {
  const query = new URLSearchParams(search);
  const vehicleId = query.get("vehicle"), kind = query.get("record"), recordId = query.get("id");
  if (!vehicleId || !recordId || vehicleId.length > 200 || recordId.length > 200 ||
      !["history", "request", "diagnostic", "note"].includes(kind || "") ||
      [vehicleId, recordId].some((id) => /[\u0000-\u001f\u007f]/.test(id))) return null;
  return { vehicleId, kind: kind as RecordKind, recordId };
}

export function recordSearch(target: RecordTarget): string {
  return `?${new URLSearchParams({ vehicle: target.vehicleId, record: target.kind, id: target.recordId })}`;
}

export function recordReturnPath(search: string, appPath: string): string {
  const target = readRecordTarget(search);
  return `${appPath}${target ? recordSearch(target) : ""}`;
}

export function recordElementId(target: RecordTarget): string {
  return `record-${target.kind}-${encodeURIComponent(target.recordId)}`;
}

// The link must resolve against current, authorized data, never the saved AI snapshot.
export function resolveRecord(target: RecordTarget, vehicle: {
  id: string;
  history: { id: string }[];
  notes: { id: string }[];
  telemetry: { id: string }[];
  dtcs?: string[];
  dtcDetails?: unknown[];
}, requests: { id: string; vehicleId: string }[]): { tab: string; index: number } | null {
  if (target.vehicleId !== vehicle.id) return null;
  const collection = target.kind === "history" ? vehicle.history : target.kind === "note" ? vehicle.notes :
    target.kind === "request" ? requests.filter((r) => r.vehicleId === vehicle.id) : vehicle.telemetry;
  const index = target.kind === "diagnostic" && target.recordId === "current"
    ? (vehicle.dtcs?.length || vehicle.dtcDetails?.length ? 0 : -1)
    : collection.findIndex((r) => r.id === target.recordId);
  if (index < 0) return null;
  return { tab: { history: "service", request: "service", diagnostic: "diagnostics", note: "files" }[target.kind], index };
}
