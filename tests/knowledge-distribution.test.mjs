import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Git distribution excludes private knowledge and manual recordings", () => {
  const names = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const blocked = names.filter((name) => {
    if (/^(materials|knowledge|resources\/manuals)\/|\.(pdf|mp4)$|(?:^|\/)(guidance|acoustic-manuals)\.json$/i.test(name)) return true;
    if (!name.endsWith(".json")) return false;
    const data = JSON.parse(readFileSync(name, "utf8"));
    return (Array.isArray(data?.manuals) && data.manuals.some((manual) => manual.pages?.some((page) => typeof page.text === "string")))
      || (Array.isArray(data) && data.some((page) => page?.engine && page.page && typeof page.text === "string"));
  });
  assert.deepEqual(blocked, []);
});
