import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticNeurodvs } from "../tests/fixtures/neurodvs-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "mehay-test-"));
const fixturePath = path.join(fixtureDir, "vehicles.json");
try {
  await writeFile(fixturePath, JSON.stringify(syntheticNeurodvs));
  const files = await Promise.all(["server", "tests"].map(async (directory) =>
    (await readdir(path.join(root, directory))).filter((name) => name.endsWith(".test.mjs"))
      .map((name) => path.join(root, directory, name))));
  const selected = process.argv.slice(2);
  const testFiles = files.flat().filter((filename) => !selected.length || selected.some((item) => filename.endsWith(item)));
  if (!testFiles.length) throw new Error("no matching test files");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...testFiles], {
    cwd: root,
    env: { ...process.env, NEURODVS_DATA_PATH: fixturePath },
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
