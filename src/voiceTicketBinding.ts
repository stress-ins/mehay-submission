export type VoiceTicketBinding<T> = {
  vehicleId: string;
  sessionId: string;
  diagnosis: T;
};

export function bindVoiceTicket<T>(vehicleId: string, sessionId: string, diagnosis: T | null | undefined): VoiceTicketBinding<T> | null {
  return vehicleId && sessionId && diagnosis ? { vehicleId, sessionId, diagnosis } : null;
}

export function matchesVoiceTicket<T>(binding: VoiceTicketBinding<T> | null, vehicleId: string, sessionId: string, diagnosis: T | null | undefined): boolean {
  return Boolean(binding && diagnosis && binding.vehicleId === vehicleId && binding.sessionId === sessionId && binding.diagnosis === diagnosis);
}
