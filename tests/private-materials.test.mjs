import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateKnowledge } from "../scripts/validate-knowledge.mjs";
import { syntheticNeurodvs } from "./fixtures/neurodvs-data.mjs";
import { syntheticPdf } from "./fixtures/synthetic-pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFixture(temp) {
  const source = path.join(temp, "source");
  const knowledge = path.join(temp, "knowledge");
  await mkdir(path.join(source, "bundle"), { recursive: true });
  await mkdir(path.join(knowledge, "pdf"), { recursive: true });
  const manuals = [];
  for (let i = 0; i < 6; i += 1) {
    const filename = `manual-${i}.pdf`;
    const bytes = syntheticPdf(`Synthetic diagnostic reference ${i}`);
    await writeFile(path.join(source, filename), bytes);
    await writeFile(path.join(knowledge, "pdf", filename), bytes);
    manuals.push({ id: `manual-${i}`, title: `Synthetic manual ${i}`, filename, sha256: createHash("sha256").update(bytes).digest("hex"), engineKeys: ["ямз-236м2"], pageCount: 2, pages: [{ pdfPage: 1, text: `synthetic diagnostic reference ${i}` }, { pdfPage: 2, text: `synthetic diagnostic reference ${i}` }] });
  }
  await writeFile(path.join(knowledge, "index.json"), JSON.stringify({ version: 1, manuals }));
  await writeFile(path.join(knowledge, "guidance.json"), JSON.stringify({ guidance: [{ manualId: "manual-0", pdfPage: 1, engineModel: "ямз-236м2", anomalyType: "F01", text: "synthetic fixture reference", quote: "diagnostic reference" }] }));
  const archive = path.join(source, "bundle", "organizer.zip");
  const vehicleJson = JSON.stringify(syntheticNeurodvs);
  const script = `from zipfile import ZipFile\np='${archive}'\nfiles={'vendor/mock_ml/app.py':'app = True','vendor/mock_toir/app.py':'app = True','vendor/data/vehicles.json':${JSON.stringify(vehicleJson)}}\nwith ZipFile(p,'w') as z:\n for name,data in files.items(): z.writestr(name,data)\n`;
  execFileSync("python3", ["-c", script]);
  return { source, knowledge, archive, archiveBytes: await readFile(archive) };
}

function fetch(env, args = []) {
  return spawnSync("python3", [path.join(root, "deploy/fetch-private-materials.py"), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("private loader stages only verified organizer mock runtime and keeps the prior release on failure", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mehay-materials-test-"));
  try {
    const { source, knowledge, archive, archiveBytes } = await sourceFixture(temp);
    const canonicalTemp = await realpath(temp);
    const canonicalKnowledge = await realpath(knowledge);
    const destination = path.join(canonicalTemp, "private-source");
    const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
    const env = { MEHAY_PRIVATE_SOURCE: source, MEHAY_PRIVATE_SOURCE_DIR: destination, MEHAY_PRIVATE_ARCHIVE_SHA256: archiveSha256, MEHAY_KB_DIR: canonicalKnowledge };
    const crossDocumentGuidance = JSON.parse(await readFile(path.join(knowledge, "guidance.json"), "utf8"));
    crossDocumentGuidance.guidance[0].procedure = [{ title: "Cross manual check", manualId: "manual-1", pdfPage: 1, quote: "diagnostic reference", text: "cross manual evidence" }];
    await writeFile(path.join(knowledge, "guidance.json"), JSON.stringify(crossDocumentGuidance));
    const fixtureVehicles = path.join(temp, "fixture-vehicles.json");
    await writeFile(fixtureVehicles, JSON.stringify(syntheticNeurodvs));
    assert.doesNotThrow(() => validateKnowledge(knowledge, fixtureVehicles));
    const firstPdf = path.join(knowledge, "pdf", "manual-0.pdf");
    const originalPdf = await readFile(firstPdf);
    const changedPdf = syntheticPdf("", "");
    const indexed = JSON.parse(await readFile(path.join(knowledge, "index.json"), "utf8"));
    indexed.manuals[0].sha256 = createHash("sha256").update(changedPdf).digest("hex");
    await writeFile(firstPdf, changedPdf);
    await writeFile(path.join(knowledge, "index.json"), JSON.stringify(indexed));
    assert.throws(() => validateKnowledge(knowledge, fixtureVehicles), /cited PDF page is blank/);
    await writeFile(firstPdf, originalPdf);
    indexed.manuals[0].sha256 = createHash("sha256").update(originalPdf).digest("hex");
    await writeFile(path.join(knowledge, "index.json"), JSON.stringify(indexed));
    const blockedOverlap = fetch({ ...env, MEHAY_PRIVATE_SOURCE_DIR: path.join(canonicalKnowledge, "private-source"), MEHAY_KB_DIR: canonicalKnowledge });
    assert.equal(blockedOverlap.status, 1);
    assert.match(blockedOverlap.stderr, /overlaps application data/);
    await assert.rejects(readdir(path.join(canonicalKnowledge, "private-source")));
    const unsafeDestination = fetch({ ...env, MEHAY_PRIVATE_SOURCE_DIR: process.cwd() });
    assert.equal(unsafeDestination.status, 1);
    assert.match(unsafeDestination.stderr, /directory is unsafe/);
    const protectedDestination = fetch({ ...env, MEHAY_PRIVATE_SOURCE_DIR: "/opt/mehay/data" });
    assert.equal(protectedDestination.status, 1);
    assert.match(protectedDestination.stderr, /overlaps application data/);
    const deployDestination = fetch({ ...env, MEHAY_PRIVATE_SOURCE_DIR: "/opt/mehay/deploy/materials" });
    assert.equal(deployDestination.status, 1);
    assert.match(deployDestination.stderr, /overlaps application data/);
    const target = path.join(canonicalTemp, "symlink-target");
    const link = path.join(canonicalTemp, "source-link");
    await mkdir(target);
    await symlink(target, link);
    const linkedDestination = fetch({ ...env, MEHAY_PRIVATE_SOURCE_DIR: link });
    assert.equal(linkedDestination.status, 1);
    assert.match(linkedDestination.stderr, /traverse symlinks/);
    assert.deepEqual(await readdir(target), []);
    const knowledgeLink = path.join(canonicalTemp, "knowledge-link");
    await symlink(knowledge, knowledgeLink);
    const linkedKnowledge = fetch({ ...env, MEHAY_KB_DIR: knowledgeLink }, ["--preflight-paths"]);
    assert.equal(linkedKnowledge.status, 1);
    assert.match(linkedKnowledge.stderr, /knowledge directory must not traverse symlinks/);
    await assert.rejects(readdir(destination));
    const preflight = fetch(env, ["--preflight-paths"]);
    assert.equal(preflight.status, 0, preflight.stderr);
    assert.match(preflight.stdout, /paths verified/);
    await assert.rejects(readdir(destination));
    const result = fetch(env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^[a-f0-9]{64}$/);
    const releasePath = path.join(destination, "releases", result.stdout.trim());
    const vehiclePath = path.join(releasePath, "neurodvs_hackathon_mock_2026-11-16/data/vehicles.json");
    const stagedVehicles = await readFile(vehiclePath, "utf8");
    assert.equal(JSON.parse(stagedVehicles).vehicles[0].vehicle_id, "SYNTH-001");
    assert.deepEqual(validateKnowledge(knowledge, vehiclePath), { manuals: 6, vehicles: 50 });
    const savedRelease = `${releasePath}.saved`;
    const symlinkTarget = path.join(canonicalTemp, "symlink-release-target");
    await mkdir(symlinkTarget);
    await writeFile(path.join(symlinkTarget, "marker"), "untouched");
    await rename(releasePath, savedRelease);
    await symlink(symlinkTarget, releasePath);
    const linkedRelease = fetch(env);
    assert.equal(linkedRelease.status, 1);
    assert.match(linkedRelease.stderr, /not a real directory/);
    assert.equal(await readFile(path.join(symlinkTarget, "marker"), "utf8"), "untouched");
    await rm(releasePath);
    await rename(savedRelease, releasePath);
    const indexPath = path.join(knowledge, "index.json");
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    index.manuals[0].pageCount += 1;
    await writeFile(indexPath, JSON.stringify(index));
    assert.throws(() => validateKnowledge(knowledge, vehiclePath), /page count does not match/);
    index.manuals[0].pageCount -= 1;
    await writeFile(indexPath, JSON.stringify(index));
    await writeFile(path.join(releasePath, "unexpected-sibling.txt"), "unexpected");
    const siblingRelease = fetch(env);
    assert.equal(siblingRelease.status, 1);
    assert.match(siblingRelease.stderr, /does not match verified archive/);
    await rm(path.join(releasePath, "unexpected-sibling.txt"));
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

test("interrupted release publication leaves only a retryable staging directory", async () => {
  const modulePath = path.join(root, "deploy/fetch-private-materials.py");
  const script = `import importlib.util, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location("fetcher", ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
    staged = pathlib.Path(temp) / ".stage"
    release = pathlib.Path(temp) / "release"
    staged.mkdir()
    (staged / "file").write_text("fixture")
    original = pathlib.Path.rename
    def interrupt(self, target):
        if self == staged:
            raise OSError("simulated interruption")
        return original(self, target)
    pathlib.Path.rename = interrupt
    try:
        module.publish_release(staged, release)
        raise AssertionError("publication was not interrupted")
    except OSError:
        pass
    assert not release.exists()
    assert staged.is_dir() and (staged.stat().st_mode & 0o777) == 0o750
    assert (staged / "file").stat().st_mode & 0o777 == 0o640
    pathlib.Path.rename = original
    module.publish_release(staged, release)
    assert release.is_dir() and not staged.exists()
`;
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
