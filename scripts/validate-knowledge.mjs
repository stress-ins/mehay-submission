import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filename) {
  try { return JSON.parse(readFileSync(filename, "utf8")); }
  catch { throw new Error("private materials are missing or invalid"); }
}

export function validateKnowledge(root, mockDataPath) {
  const index = readJson(path.join(root, "index.json"));
  const manuals = index?.manuals;
  if (index.version !== 1 || !Array.isArray(manuals) || manuals.length !== 6) throw new Error("private materials are incomplete");
  const ids = new Set();
  const digests = new Set();
  for (const manual of manuals) {
    if (typeof manual?.id !== "string" || ids.has(manual.id) || typeof manual.filename !== "string" ||
      path.basename(manual.filename) !== manual.filename || !manual.filename.toLowerCase().endsWith(".pdf") ||
      !/^[a-f0-9]{64}$/.test(manual.sha256 || "") || !Array.isArray(manual.pages) || !manual.pages.length ||
      manual.pages.some((page) => !Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || typeof page.text !== "string" || !page.text.trim())) {
      throw new Error("private materials are invalid");
    }
    ids.add(manual.id);
    const filename = path.join(root, "pdf", manual.filename);
    let pdf;
    try {
      const stat = statSync(filename);
      if (!stat.isFile() || stat.size === 0) throw new Error();
      pdf = readFileSync(filename);
    } catch { throw new Error("private PDF is missing"); }
    const digest = createHash("sha256").update(pdf).digest("hex");
    if (digest !== manual.sha256 || digests.has(digest)) throw new Error("private PDF does not match its index");
    digests.add(digest);
  }
  const guidance = readJson(path.join(root, "guidance.json"));
  if (!Array.isArray(guidance?.guidance) || !guidance.guidance.length) throw new Error("private guidance is incomplete");
  const dataset = readJson(mockDataPath);
  if (!Array.isArray(dataset?.vehicles) || dataset.vehicles.length !== 50) throw new Error("private mock data is incomplete");
  const vehicleIds = new Set();
  let sessionCount = 0;
  for (const vehicle of dataset.vehicles) {
    if (typeof vehicle?.vehicle_id !== "string" || vehicleIds.has(vehicle.vehicle_id) || !Array.isArray(vehicle.sessions) || !vehicle.sessions.length) {
      throw new Error("private mock data is invalid");
    }
    vehicleIds.add(vehicle.vehicle_id);
    const sessionIds = new Set();
    for (const session of vehicle.sessions) {
      if (typeof session?.session_id !== "string" || session.vehicle_id !== vehicle.vehicle_id || sessionIds.has(session.session_id) || typeof session.checked_at !== "string" || !Number.isFinite(Date.parse(session.checked_at))) {
        throw new Error("private mock data is invalid");
      }
      sessionIds.add(session.session_id);
      sessionCount += 1;
    }
  }
  if (sessionCount !== 195) throw new Error("private mock data is incomplete");
  return { manuals: manuals.length, vehicles: dataset.vehicles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateKnowledge(process.argv[2] || process.env.MEHAY_KB_DIR, process.argv[3] || process.env.NEURODVS_DATA_PATH);
    console.log(`private materials verified (${result.manuals} manuals, ${result.vehicles} vehicles)`);
  } catch {
    console.error("private materials are incomplete or invalid");
    process.exitCode = 1;
  }
}
