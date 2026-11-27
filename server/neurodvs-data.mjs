import { readFileSync } from "node:fs";
import path from "node:path";

const filename = process.env.NEURODVS_DATA_PATH;
if (!filename) throw new Error("neurodvs_data_not_configured");

let data;
try {
  data = JSON.parse(readFileSync(path.resolve(filename), "utf8"));
} catch {
  throw new Error("neurodvs_data_unavailable");
}

const sessionIds = new Set();
if (!Array.isArray(data?.vehicles) || !data.vehicles.length || data.vehicles.some((vehicle) => {
  if (typeof vehicle?.vehicle_id !== "string" || !vehicle.vehicle_id.trim() || !Array.isArray(vehicle.sessions) || !vehicle.sessions.length) return true;
  return vehicle.sessions.some((session) => {
    if (typeof session?.session_id !== "string" || !session.session_id.trim() || session.vehicle_id !== vehicle.vehicle_id ||
      typeof session.checked_at !== "string" || !session.checked_at.trim() || !Number.isFinite(Date.parse(session.checked_at)) ||
      sessionIds.has(session.session_id)) return true;
    sessionIds.add(session.session_id);
    return false;
  });
})) {
  throw new Error("neurodvs_data_invalid");
}

export const fleet = data.vehicles;
