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

if (!Array.isArray(data?.vehicles) || !data.vehicles.length || data.vehicles.some((vehicle) =>
  typeof vehicle?.vehicle_id !== "string" || !Array.isArray(vehicle.sessions) || vehicle.sessions.some((session) =>
    typeof session?.session_id !== "string" || session.vehicle_id !== vehicle.vehicle_id))) {
  throw new Error("neurodvs_data_invalid");
}

export const fleet = data.vehicles;
