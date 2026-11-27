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
  const rendered = spawnSync("docker", ["exec", container, "node", "-e",
    "fetch('http://127.0.0.1:3087/mehay/api/manuals/manual-1/pages/1.png').then(async r=>{const b=Buffer.from(await r.arrayBuffer());process.exit(r.status===200&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?0:1)}).catch(()=>process.exit(1))"],
  { stdio: "ignore" });
  if (rendered.status !== 0) throw new Error("synthetic cited PDF page did not render");
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  await rm(directory, { recursive: true, force: true });
}
