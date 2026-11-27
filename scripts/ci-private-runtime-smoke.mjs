import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { syntheticNeurodvs } from "../tests/fixtures/neurodvs-data.mjs";
import { syntheticPdf } from "../tests/fixtures/synthetic-pdf.mjs";

const image = process.argv[2];
if (!image) throw new Error("image argument required");
const directory = await mkdtemp(path.join(os.tmpdir(), "mehay-runtime-smoke-"));
const knowledge = path.join(directory, "knowledge");
const pdfDirectory = path.join(knowledge, "pdf");
const container = `mehay-runtime-smoke-${process.pid}`;
const run = (args) => {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("synthetic runtime smoke failed");
};
try {
  await mkdir(pdfDirectory, { recursive: true });
  const text = "Synthetic diagnostic reference excerpt for runtime smoke.";
  const manuals = [];
  for (let index = 1; index <= 6; index += 1) {
    const filename = `manual-${index}.pdf`;
    const pageText = `${text} Manual ${index}.`;
    const pdf = syntheticPdf(pageText);
    await writeFile(path.join(pdfDirectory, filename), pdf);
    manuals.push({ id: `manual-${index}`, title: `Synthetic manual ${index}`, engineKeys: ["synthetic-engine"],
      filename, pageCount: 2, sha256: createHash("sha256").update(pdf).digest("hex"), pages: [{ pdfPage: 1, text: pageText }] });
  }
  await writeFile(path.join(knowledge, "index.json"), JSON.stringify({ version: 1, manuals }));
  await writeFile(path.join(knowledge, "guidance.json"), JSON.stringify({ guidance: [{
    engineModel: "synthetic-engine", anomalyType: "synthetic-check", manualId: "manual-1", pdfPage: 1,
    text, quote: `${text} Manual 1.`,
  }] }));
  await writeFile(path.join(directory, "vehicles.json"), JSON.stringify(syntheticNeurodvs));
  run(["run", "--detach", "--network", "none", "--name", container,
    "--mount", `type=bind,src=${knowledge},dst=/knowledge,readonly`,
    "--mount", `type=bind,src=${path.join(directory, "vehicles.json")},dst=/private-source/vehicles.json,readonly`,
    "--env", "MEHAY_KB_DIR=/knowledge", "--env", "NEURODVS_DATA_PATH=/private-source/vehicles.json", image]);
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync("docker", ["exec", container, "node", "-e",
      "fetch('http://127.0.0.1:3087/mehay/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
    { stdio: "ignore" });
    if (result.status === 0) { healthy = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!healthy) throw new Error("synthetic runtime smoke did not become healthy");
  async function verifyPage() {
    const origin = "http://127.0.0.1:3087";
    const api = origin + "/mehay/api";
    const setup = await fetch(api + "/auth/setup", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "smoke-admin", displayName: "Synthetic Smoke", password: "synthetic-smoke-password" }),
    });
    const cookie = setup.headers.get("set-cookie")?.split(";", 1)[0];
    if (setup.status !== 201 || !cookie) throw new Error("Synthetic account setup failed: HTTP " + setup.status);
    const page = await fetch(api + "/manuals/manual-1/pages/1.png", { headers: { cookie } });
    const bytes = Buffer.from(await page.arrayBuffer());
    if (page.status !== 200 || !page.headers.get("content-type")?.includes("image/png") ||
        bytes.length <= 100 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Synthetic manual page failed to render: HTTP " + page.status);
    }
  }
  const rendered = spawnSync("docker", ["exec", container, "node", "-e", `(${verifyPage})()`], { stdio: "inherit" });
  if (rendered.error || rendered.status !== 0) throw new Error("Synthetic private runtime check failed");
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  await rm(directory, { recursive: true, force: true });
}
