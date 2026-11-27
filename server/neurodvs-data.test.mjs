import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { syntheticNeurodvs } from "../tests/fixtures/neurodvs-data.mjs";

const loader = fileURLToPath(new URL("./neurodvs-data.mjs", import.meta.url));
test("runtime loader rejects vehicles without usable diagnostic sessions", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mehay-data-loader-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const data = structuredClone(syntheticNeurodvs);
  const run = async () => {
    const filename = path.join(directory, "vehicles.json");
    await writeFile(filename, JSON.stringify(data));
    return spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(loader)})`], {
      env: { ...process.env, NEURODVS_DATA_PATH: filename }, encoding: "utf8",
    });
  };
  assert.equal((await run()).status, 0);
  data.vehicles[0].sessions = [];
  assert.notEqual((await run()).status, 0);
  data.vehicles[0].sessions = structuredClone(syntheticNeurodvs.vehicles[0].sessions);
  delete data.vehicles[0].sessions[0].checked_at;
  assert.notEqual((await run()).status, 0);
});
