import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateKnowledge } from "../scripts/validate-knowledge.mjs";
import { syntheticNeurodvs } from "./fixtures/neurodvs-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFixture(temp) {
  const source = path.join(temp, "source");
  const knowledge = path.join(temp, "knowledge");
  await mkdir(path.join(source, "bundle"), { recursive: true });
  await mkdir(path.join(knowledge, "pdf"), { recursive: true });
  const manuals = [];
  for (let i = 0; i < 6; i += 1) {
    const filename = `manual-${i}.pdf`;
    const bytes = Buffer.from(`synthetic pdf ${i}`);
    await writeFile(path.join(source, filename), bytes);
    await writeFile(path.join(knowledge, "pdf", filename), bytes);
    manuals.push({ id: `manual-${i}`, filename, sha256: createHash("sha256").update(bytes).digest("hex"), pages: [{ pdfPage: 1, text: "fixture" }] });
  }
  await writeFile(path.join(knowledge, "index.json"), JSON.stringify({ version: 1, manuals }));
  await writeFile(path.join(knowledge, "guidance.json"), JSON.stringify({ guidance: [{ id: "fixture" }] }));
  const archive = path.join(source, "bundle", "organizer.zip");
  const vehicleJson = JSON.stringify(syntheticNeurodvs);
  const script = `from zipfile import ZipFile\np='${archive}'\nfiles={'vendor/mock_ml/app.py':'app = True','vendor/mock_toir/app.py':'app = True','vendor/data/vehicles.json':${JSON.stringify(vehicleJson)}}\nwith ZipFile(p,'w') as z:\n for name,data in files.items(): z.writestr(name,data)\n`;
  execFileSync("python3", ["-c", script]);
  return { source, knowledge, archive, archiveBytes: await readFile(archive) };
}

function fetch(env) {
  return spawnSync("python3", [path.join(root, "deploy/fetch-private-materials.py")], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("private loader stages only verified organizer mock runtime and keeps the prior release on failure", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mehay-materials-test-"));
  try {
    const { source, knowledge, archive, archiveBytes } = await sourceFixture(temp);
    const destination = path.join(temp, "private-source");
    const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
    const env = { MEHAY_PRIVATE_SOURCE: source, MEHAY_PRIVATE_SOURCE_DIR: destination, MEHAY_PRIVATE_ARCHIVE_SHA256: archiveSha256, MEHAY_KB_DIR: knowledge };
    const result = fetch(env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^[a-f0-9]{64}$/);
    const releasePath = path.join(destination, "releases", result.stdout.trim());
    const vehiclePath = path.join(releasePath, "neurodvs_hackathon_mock_2026-11-16/data/vehicles.json");
    const stagedVehicles = await readFile(vehiclePath, "utf8");
    assert.equal(JSON.parse(stagedVehicles).vehicles[0].vehicle_id, "SYNTH-001");
    assert.deepEqual(validateKnowledge(knowledge, vehiclePath), { manuals: 6, vehicles: 50 });
    await writeFile(vehiclePath, stagedVehicles.replace("SYNTH-001", "CORRUPTED"));
    const corruptedRelease = fetch(env);
    assert.equal(corruptedRelease.status, 1);
    assert.match(corruptedRelease.stderr, /does not match verified archive/);
    await writeFile(vehiclePath, stagedVehicles);
    const incompleteVehicles = JSON.parse(stagedVehicles);
    incompleteVehicles.vehicles[0].sessions[0].checked_at = "";
    const incompletePath = path.join(temp, "incomplete-vehicles.json");
    await writeFile(incompletePath, JSON.stringify(incompleteVehicles));
    assert.throws(() => validateKnowledge(knowledge, incompletePath), /private mock data is invalid/);
    await writeFile(archive, Buffer.concat([archiveBytes, Buffer.from("tampered mock code")]));
    const mockTampered = fetch(env);
    assert.equal(mockTampered.status, 1);
    assert.match(mockTampered.stderr, /trusted SHA-256/);
    await writeFile(archive, archiveBytes);
    await writeFile(path.join(source, "manual-0.pdf"), "tampered fixture");
    const invalid = fetch(env);
    assert.equal(invalid.status, 1);
    assert.doesNotMatch(`${invalid.stdout}${invalid.stderr}`, /manual-0|tampered|https?:/i);
    assert.equal((await readdir(path.join(destination, "releases"))).length, 1);
    const insecure = fetch({ ...env, MEHAY_PRIVATE_SOURCE: "http://example.test/source.zip" });
    assert.equal(insecure.status, 1);
    assert.match(insecure.stderr, /HTTPS/);
    const redirect = spawnSync("python3", ["-c", `import importlib.util\ns=importlib.util.spec_from_file_location('fetcher', ${JSON.stringify(path.join(root, "deploy/fetch-private-materials.py"))})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\ntry: m.HTTPSRedirectHandler().redirect_request(None, None, 302, 'Found', {}, 'http://example.test/final')\nexcept m.FetchError: raise SystemExit(0)\nraise SystemExit(1)`], { encoding: "utf8" });
    assert.equal(redirect.status, 0, redirect.stderr);
    const domains = spawnSync("python3", ["-c", `import importlib.util\ns=importlib.util.spec_from_file_location('fetcher', ${JSON.stringify(path.join(root, "deploy/fetch-private-materials.py"))})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\nassert m.is_yandex_host('cloud-api.yandex.net') and not m.is_yandex_host('yandex.com.evil.test')`], { encoding: "utf8" });
    assert.equal(domains.status, 0, domains.stderr);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
