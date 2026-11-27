const stepStart = /^(?:(?:\d+[.)])|(?:[\p{L}][.)])|[-•])\s+/u;

export function normalizeManualText(text: string): string {
  const lines = text
    .replace(/([\p{L}])[-‐‑]\r?\n[\t ]*([\p{L}])/gu, "$1-$2")
    .replace(/\r\n?/gu, "\n")
    .split("\n");
  let result = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      result = result.trimEnd() + "\n\n";
    } else if (!result) {
      result = line;
    } else if (result.endsWith("\n\n")) {
      result += line;
    } else if (stepStart.test(line)) {
      result = result.trimEnd() + `\n${line}`;
    } else {
      result = result.trimEnd() + `${/^[,.;:!?…%)\]}]/u.test(line) ? "" : " "}${line}`;
    }
  }
  return result.trim();
}
