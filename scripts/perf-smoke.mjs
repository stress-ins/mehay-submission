#!/usr/bin/env node
import { performance } from "node:perf_hooks";

const defaults = { baseUrl: "http://127.0.0.1:3087/mehay/", concurrency: 5, requests: 100, vehicleId: "van-1" };
const options = { ...defaults };
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === "--help") {
    process.stdout.write("Usage: MEHAY_SESSION_COOKIE='mehay_session=…' node scripts/perf-smoke.mjs [--base-url http://127.0.0.1:3087/mehay/] [--concurrency 5|20] [--requests 100] [--vehicle-id van-1]\n");
    process.exit(0);
  }
  const key = { "--base-url": "baseUrl", "--concurrency": "concurrency", "--requests": "requests", "--vehicle-id": "vehicleId" }[arg];
  if (!key || !process.argv[i + 1]) throw new Error("unsupported_option:" + arg);
  options[key] = process.argv[++i];
}

const base = new URL(options.baseUrl);
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]", "::1"].includes(base.hostname) || base.username || base.password || base.search || base.hash)
  throw new Error("base_url_must_be_local_http");
base.pathname = base.pathname.replace(/\/+$/, "") + "/";
const sessionCookie = process.env.MEHAY_SESSION_COOKIE || "";
if (sessionCookie && (sessionCookie.length > 4096 || !/^mehay_session=[A-Za-z0-9_-]{32,256}$/.test(sessionCookie)))
  throw new Error("invalid_session_cookie_format");
const concurrency = Number(options.concurrency), requestCount = Number(options.requests);
if (![5, 20].includes(concurrency)) throw new Error("concurrency_must_be_5_or_20");
if (!Number.isSafeInteger(requestCount) || requestCount < 1 || requestCount > 5000) throw new Error("requests_must_be_1_to_5000");
if (!/^[A-Za-z0-9_-]{1,100}$/.test(options.vehicleId)) throw new Error("invalid_vehicle_id");

const vehiclePath = "api/vehicles/" + encodeURIComponent(options.vehicleId);
const paths = ["api/bootstrap", vehiclePath, vehiclePath + "/report"];
const results = [];
let cursor = 0;
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  while (true) {
    const index = cursor++;
    if (index >= requestCount) return;
    const path = paths[index % paths.length];
    const t0 = performance.now();
    try {
      const response = await fetch(new URL(path, base), { method: "GET", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json", ...(sessionCookie ? { cookie: sessionCookie } : {}) } });
      const body = await response.arrayBuffer();
      results.push({ path, status: response.status, ok: response.ok, latencyMs: performance.now() - t0, bytes: body.byteLength, worker });
    } catch (error) {
      results.push({ path, status: null, ok: false, latencyMs: performance.now() - t0, bytes: 0, error: error.name || "request_error", worker });
    }
  }
}));
const elapsedMs = performance.now() - started;
const summarize = (rows) => {
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  const percentile = (fraction) => latencies.length ? Number(latencies[Math.max(0, Math.ceil(fraction * latencies.length) - 1)].toFixed(2)) : null;
  const bytes = rows.map((row) => row.bytes);
  return { requests: rows.length, successes: rows.filter((row) => row.ok).length, errors: rows.filter((row) => !row.ok).length, bytesTotal: bytes.reduce((a, b) => a + b, 0), bytesMean: bytes.length ? Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length) : 0, bytesMax: Math.max(0, ...bytes), latencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: latencies.length ? Number(latencies.at(-1).toFixed(2)) : null, mean: latencies.length ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : null } };
};
const byPath = Object.fromEntries(paths.map((path) => [path, summarize(results.filter((row) => row.path === path))]));
const output = {
  baseUrl: base.origin + base.pathname,
  concurrency,
  requested: requestCount,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((results.length / (elapsedMs / 1000)).toFixed(2)),
  summary: summarize(results),
  byPath,
  errors: results.filter((row) => !row.ok).map(({ path, status, error }) => ({ path, status, error: error || "http_error" })),
};
process.stdout.write(JSON.stringify(output) + "\n");
if (results.some((row) => !row.ok)) process.exitCode = 1;
