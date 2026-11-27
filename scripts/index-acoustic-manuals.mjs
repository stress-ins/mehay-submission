import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2) {
  console.error("Usage: node scripts/index-acoustic-manuals.mjs ENGINE FILE.pdf [ENGINE FILE.pdf ...]");
  process.exit(1);
}

const pages = [];
try {
  for (let i = 0; i < args.length; i += 2) {
    const [engine, file] = args.slice(i, i + 2);
    const title = basename(file, ".pdf");
    const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", file.startsWith("-") ? "./" + file : file, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const documentPages = text.split("\f")
      .map((content, index) => ({ engine, title, page: index + 1, text: content.trim() }))
      .filter((page) => page.text);
    if (documentPages.length === 0) throw new Error("No searchable pages in " + file);
    pages.push(...documentPages);
  }
  process.stdout.write(JSON.stringify(pages, null, 2) + "\n");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
