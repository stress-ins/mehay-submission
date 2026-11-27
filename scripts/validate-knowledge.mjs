import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filename) {
  try { return JSON.parse(readFileSync(filename, "utf8")); }
  catch { throw new Error("private materials are missing or invalid"); }
}

function hasVisiblePdfPage(filename, page) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mehay-pdf-check-"));
  const prefix = path.join(directory, "page");
  try {
    const rendered = spawnSync("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-png", "-r", "40", filename, prefix], { stdio: "ignore", timeout: 10_000 });
    if (rendered.status !== 0) return false;
    const check = spawnSync(process.execPath, ["-e", "import sharp from 'sharp'; const s=await sharp(process.argv[1]).stats(); process.exit(s.entropy>0.01&&s.channels.some(c=>c.min<245&&c.max>250)?0:1)", `${prefix}.png`], { stdio: "ignore", timeout: 10_000 });
    return check.status === 0;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function validateKnowledge(root, mockDataPath) {
  const index = readJson(path.join(root, "index.json"));
  const manuals = index?.manuals;
  if (index.version !== 1 || !Array.isArray(manuals) || manuals.length !== 6) throw new Error("private materials are incomplete");
  const ids = new Set();
  const digests = new Set();
  for (const manual of manuals) {
    if (typeof manual?.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,80}$/i.test(manual.id) || ids.has(manual.id) ||
      typeof manual.title !== "string" || !manual.title.trim() || !Array.isArray(manual.engineKeys) || !manual.engineKeys.length ||
      manual.engineKeys.some((key) => typeof key !== "string" || !key.trim()) || typeof manual.filename !== "string" ||
      path.basename(manual.filename) !== manual.filename || !manual.filename.toLowerCase().endsWith(".pdf") ||
      !Number.isSafeInteger(manual.pageCount) || manual.pageCount < 1 ||
      !/^[a-f0-9]{64}$/.test(manual.sha256 || "") || !Array.isArray(manual.pages) || !manual.pages.length ||
      manual.pages.some((page) => !Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || page.pdfPage > manual.pageCount || typeof page.text !== "string") ||
      !manual.pages.some((page) => page.text.trim())) {
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
    const info = spawnSync("pdfinfo", [filename], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"], timeout: 10_000, maxBuffer: 64 * 1024 });
    const pdfPageCount = info.stdout?.match(/^Pages:\s+(\d+)\s*$/m)?.[1];
    if (info.status !== 0 || Number(pdfPageCount) !== manual.pageCount) throw new Error("private PDF page count does not match its index");
    const extracted = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", filename, "-"], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 });
    if (extracted.status !== 0) throw new Error("private PDF text cannot be verified");
    manual.extractedPages = extracted.stdout.split("\f");
    digests.add(digest);
  }
  const guidance = readJson(path.join(root, "guidance.json"));
  if (!Array.isArray(guidance?.guidance) || !guidance.guidance.length) throw new Error("private guidance is incomplete");
  const manualsById = new Map(manuals.map((manual) => [manual.id, manual]));
  const renderedPages = new Set();
  const validateGuidance = (item) => {
    const manual = manualsById.get(item?.manualId);
    const page = manual?.pages.find(({ pdfPage }) => pdfPage === item?.pdfPage)?.text;
    const physicalPage = manual?.extractedPages[item?.pdfPage - 1];
    const quote = typeof item?.quote === "string" ? item.quote.toLocaleLowerCase("ru").replace(/\s+/gu, " ") : "";
    const physicalHasQuote = typeof physicalPage === "string" && physicalPage.toLocaleLowerCase("ru").replace(/\s+/gu, " ").includes(quote);
    if (typeof item?.engineModel !== "string" || typeof item.anomalyType !== "string" || !manual ||
      !Number.isSafeInteger(item.pdfPage) || item.pdfPage < 1 || typeof item.text !== "string" || !item.text.trim() ||
      typeof item.quote !== "string" || !item.quote.trim() ||
      !manual.engineKeys.includes(item.engineModel.toLocaleLowerCase("ru")) || typeof page !== "string" ||
      !page.toLocaleLowerCase("ru").replace(/\s+/gu, " ").includes(item.quote.toLocaleLowerCase("ru").replace(/\s+/gu, " ")) ||
      (item.translations != null && (typeof item.translations !== "object" || Array.isArray(item.translations) ||
        Object.entries(item.translations).some(([language, text]) => !["en", "hi", "tg", "uz"].includes(language) || typeof text !== "string" || !text.trim())))) {
      throw new Error("private guidance is invalid");
    }
    if (!physicalHasQuote) {
      const key = `${item.manualId}:${item.pdfPage}`;
      if (!renderedPages.has(key)) {
        if (!hasVisiblePdfPage(path.join(root, "pdf", manual.filename), item.pdfPage)) throw new Error("private cited PDF page is blank or cannot render");
        renderedPages.add(key);
      }
    }
  };
  for (const manual of manuals) {
    if (!Array.isArray(manual.procedures)) continue;
    for (const item of manual.procedures) {
      if (item?.sourceSha256 !== manual.sha256) continue;
      validateGuidance({ ...item, manualId: item.manualId ?? manual.id });
      if (!Array.isArray(item.procedure) || !item.procedure.length) throw new Error("private procedure is invalid");
      for (const step of item.procedure) {
        if (typeof step?.title !== "string" || !step.title.trim()) throw new Error("private procedure is invalid");
        validateGuidance({ ...step, engineModel: item.engineModel, anomalyType: item.anomalyType, manualId: step.manualId ?? item.manualId ?? manual.id });
      }
    }
  }
  for (const item of guidance.guidance) {
    validateGuidance(item);
    if (item.procedure === undefined) continue;
    if (!Array.isArray(item.procedure) || !item.procedure.length) throw new Error("private procedure is invalid");
    for (const step of item.procedure) {
      if (typeof step?.title !== "string" || !step.title.trim()) throw new Error("private procedure is invalid");
      validateGuidance({ ...step, engineModel: item.engineModel, anomalyType: item.anomalyType });
    }
  }
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
