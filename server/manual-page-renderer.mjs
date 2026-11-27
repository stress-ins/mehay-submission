import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class ManualPageError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

/** Renders allowlisted manual pages to bounded, process-local PNG cache entries. */
export function createManualPageRenderer({
  manualById,
  getManuals,
  manualDirectory,
  executable = "pdftoppm",
  spawnProcess = spawn,
  timeoutMs = 10_000,
  maxConcurrent = 2,
  maxQueued = 8,
  maxCacheBytes = 32 * 1024 * 1024,
  tempDirectory = os.tmpdir(),
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let cacheBytes = 0, active = 0, queued = 0;

  async function render(manualId, pageValue) {
    const manual = manualById(manualId);
    if (!manual || path.basename(manual.filename) !== manual.filename) throw new ManualPageError(404, "manual_not_found");
    const pageCount = manual.pageCount ?? getManuals?.().find((item) => item.id === manualId)?.pageCount;
    if (typeof pageValue !== "string" || !/^\d{1,4}$/.test(pageValue)) throw new ManualPageError(400, "invalid_page");
    const page = Number(pageValue);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageCount) || page > pageCount) throw new ManualPageError(404, "page_not_found");
    const key = `${manual.id}:${page}`;
    if (cache.has(key)) {
      const hit = cache.get(key); cache.delete(key); cache.set(key, hit);
      return hit;
    }
    if (pending.has(key)) return pending.get(key);
    if (active >= maxConcurrent && queued >= maxQueued) throw new ManualPageError(503, "renderer_busy");
    queued++;
    const promise = (async () => {
      while (active >= maxConcurrent) await new Promise((resolve) => setTimeout(resolve, 10));
      queued--; active++;
      try {
        const pdfPath = path.resolve(manualDirectory, manual.filename);
        const dir = await mkdtemp(path.join(tempDirectory, "manual-page-"));
        try {
          const prefix = path.join(dir, "page");
          await runPoppler(spawnProcess, executable, ["-f", String(page), "-l", String(page), "-singlefile", "-png", "-r", "120", pdfPath, prefix], timeoutMs);
          const png = await readFile(`${prefix}.png`);
          if (png.length < 8 || png.length > 10 * 1024 * 1024 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
            throw new ManualPageError(502, "render_failed");
          }
          if (png.length <= maxCacheBytes) {
            cache.set(key, png); cacheBytes += png.length;
            while (cacheBytes > maxCacheBytes && cache.size) {
              const [oldKey, oldPng] = cache.entries().next().value;
              cache.delete(oldKey); cacheBytes -= oldPng.length;
            }
          }
          return png;
        } finally { await rm(dir, { recursive: true, force: true }); }
      } finally { active--; }
    })();
    pending.set(key, promise);
    try { return await promise; }
    finally { pending.delete(key); }
  }
  return render;
}

function runPoppler(spawnProcess, executable, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnProcess(executable, args, { stdio: ["ignore", "ignore", "pipe"] }); }
    catch { reject(new ManualPageError(503, "renderer_unavailable")); return; }
    let stderr = "", settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    child.stderr?.on("data", (chunk) => { if (stderr.length < 2048) stderr += chunk.toString().slice(0, 2048 - stderr.length); });
    child.once("error", () => finish(new ManualPageError(503, "renderer_unavailable")));
    child.once("close", (code) => finish(code === 0 ? null : new ManualPageError(502, "render_failed")));
    const timer = setTimeout(() => {
      child.kill("SIGKILL"); finish(new ManualPageError(504, "render_timeout"));
    }, timeoutMs);
    timer.unref?.();
  });
}
