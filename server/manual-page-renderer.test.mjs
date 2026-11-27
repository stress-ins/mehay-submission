import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";
import { createManualPageRenderer } from "./manual-page-renderer.mjs";
import { createApp } from "./index.mjs";

const manual = { id: "sample-guide", title: "Synthetic service guide", filename: "sample.pdf", pageCount: 2 };
const lookup = (id) => id === manual.id ? manual : null;
const png = Buffer.from("89504e470d0a1a0a", "hex");

function renderer(spawnProcess) {
  return createManualPageRenderer({
    manualById: lookup, getManuals: () => [manual], manualDirectory: "/tmp/sample-kb/pdf", spawnProcess,
  });
}

test("renders and caches a synthetic allowlisted PDF page", async () => {
  const render = renderer((_exe, args) => {
    const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    queueMicrotask(() => writeFile(`${args.at(-1)}.png`, png).then(() => child.emit("close", 0)));
    return child;
  });
  const first = await render("sample-guide", "2");
  assert.deepEqual(first, png);
  assert.equal(await render("sample-guide", "2"), first);
});

test("rejects unknown manuals and pages outside trusted metadata bounds", async () => {
  const render = renderer(() => { throw new Error("unexpected process"); });
  await assert.rejects(render("../../etc/passwd", "1"), { status: 404, code: "manual_not_found" });
  await assert.rejects(render("sample-guide", "0"), { status: 404, code: "page_not_found" });
  await assert.rejects(render("sample-guide", "3"), { status: 404, code: "page_not_found" });
  await assert.rejects(render("sample-guide", "1abc"), { status: 400, code: "invalid_page" });
});

test("uses bounded child arguments and returns timeout as an explicit failure", async () => {
  let received;
  const render = createManualPageRenderer({ manualById: lookup, getManuals: () => [manual], manualDirectory: "/tmp/sample-kb/pdf", timeoutMs: 5,
    spawnProcess: (_exe, args) => { received = args; const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {}; return child; },
  });
  await assert.rejects(render("sample-guide", "2"), { status: 504, code: "render_timeout" });
  assert.ok(received.every((arg) => !arg.includes(";")));
  assert.ok(received.includes("2"));
});

test("page image endpoint requires an authenticated API session with no KB configured", async (t) => {
  const app = createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    app.locals.db.close();
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/manuals/sample-guide/pages/1.png`);
  assert.equal(response.status, 401);
});
