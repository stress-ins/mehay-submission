#!/usr/bin/env python3
"""Build a private page index from manuals in the selected knowledge directory."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import pymupdf

DEFAULT_KB = Path.home() / "Library/Application Support/Mehay/knowledge"
MANUALS = [
    ("yamz-236-operation", "ЯМЗ-236М2/238М2 — руководство по эксплуатации", "ЯМЗ_236_руководство по эксплуатации.pdf", ["yamz-236m2", "ямз-236м2", "yamz-238m2", "ямз-238м2"]),
    ("yamz-236-repair", "ЯМЗ-236М2/238М2 — руководство по ремонту", "ЯМЗ_236_руководство по РЕМОНТУ.pdf", ["yamz-236m2", "ямз-236м2", "yamz-238m2", "ямз-238м2"]),
    ("yamz-536-maintenance-2013", "ЯМЗ-536 — руководство по ремонту (2013)", "yamz-536_rk_2013.pdf", ["yamz-536", "ямз-536", "yamz-5361", "ямз-5361", "yamz-5362", "ямз-5362", "yamz-5363", "ямз-5363", "yamz-5364", "ямз-5364"]),
    ("yamz-536-operation-2016", "ЯМЗ-536 — руководство по эксплуатации (2016)", "yamz-536_re_2016.pdf", ["yamz-536", "ямз-536", "yamz-5361", "ямз-5361", "yamz-5362", "ямз-5362", "yamz-5363", "ямз-5363", "yamz-5364", "ямз-5364"]),
    ("zmz-40904-40905", "ЗМЗ-40904.10/40905.10 — руководство по эксплуатации, обслуживанию и ремонту", "zmz-40904-40905_rk_2025.pdf", ["zmz-40904.10", "змз-40904.10", "zmz-40905.10", "змз-40905.10"]),
    ("zmz-5234", "ЗМЗ-5234.10 — руководство по ремонту", "zmz-5234_rk_2025.pdf", ["zmz-5234.10", "змз-5234.10"]),
]


def page_text(page, stats):
    text = page.get_text("text").strip()
    if len(re.sub(r"\W", "", text)) >= 30:
        return text
    stats["ocr"] += 1
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png") as image:
        pix.save(image.name)
        result = subprocess.run(
            ["tesseract", image.name, "stdout", "-l", "rus+eng", "--psm", "6"],
            check=False, capture_output=True, text=True,
        )
    if result.returncode != 0:
        raise RuntimeError(f"tesseract failed on PDF page {page.number + 1}: {result.stderr.strip()}")
    return result.stdout.strip() or text


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as out:
        temp = Path(out.name)
        out.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
        out.flush()
        os.fsync(out.fileno())
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def store_pdf(destination, snapshot):
    if destination.exists():
        return
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        temp.write_bytes(snapshot)
        os.replace(temp, destination)
    finally:
        temp.unlink(missing_ok=True)


def index_external_manual(manual, source, pdf_dir):
    from extract_manual_procedures import approved_procedures

    snapshot = source.read_bytes()
    digest = hashlib.sha256(snapshot).hexdigest()
    with pymupdf.open(stream=snapshot, filetype="pdf") as doc:
        pages = [{"pdfPage": n + 1, "text": page.get_text("text").strip()} for n, page in enumerate(doc)]
    procedures = approved_procedures(manual, pages, digest)
    filename = f"{manual['id']}-{digest}.pdf"
    store_pdf(pdf_dir / filename, snapshot)
    return {"id": manual["id"], "title": manual["title"], "filename": filename,
            "engineKeys": manual["engineKeys"], "sha256": digest, "revision": manual["revision"],
            "pageCount": len(pages), "pages": pages, "procedures": procedures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, help="PDF source directory; defaults to <MEHAY_KB_DIR>/pdf")
    parser.add_argument("--output-dir", type=Path, help="knowledge directory containing index.json and pdf/")
    parser.add_argument("--manifest", type=Path, help="external local PDF manifest (JSON)")
    args = parser.parse_args()
    output_dir = (args.output_dir or Path(os.environ.get("MEHAY_KB_DIR", DEFAULT_KB))).expanduser().resolve()
    input_dir = (args.input_dir or output_dir / "pdf").expanduser().resolve()
    pdf_dir = output_dir / "pdf"
    output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    output_dir.chmod(0o700)
    pdf_dir.chmod(0o700)
    records = []
    for manual_id, title, filename, engines in MANUALS:
        path = input_dir / filename
        if not path.is_file():
            raise SystemExit(f"missing PDF: {path}")
        snapshot = path.read_bytes()
        digest = hashlib.sha256(snapshot).hexdigest()
        stats = {"ocr": 0}
        with pymupdf.open(stream=snapshot, filetype="pdf") as doc:
            pages = [{"pdfPage": n + 1, "text": page_text(page, stats)} for n, page in enumerate(doc)]
        versioned = f"{manual_id}-{digest}.pdf"
        store_pdf(pdf_dir / versioned, snapshot)
        records.append({"id": manual_id, "title": title, "filename": versioned,
                        "engineKeys": engines, "sha256": digest, "pageCount": len(pages), "pages": pages})
        empty = [page["pdfPage"] for page in pages if not page["text"].strip()]
        print(f"{filename}: {len(pages)} pages, {sum(bool(p['text']) for p in pages)} searchable, OCR fallback={stats['ocr']}, empty={empty or 'none'}")
    output = output_dir / "index.json"
    if args.manifest:
        manifest_path = args.manifest.expanduser().resolve()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("version") != 1 or not isinstance(manifest.get("manuals"), list):
            raise SystemExit("manifest must contain version=1 and manuals array")
        seen = {record["id"] for record in records}
        for manual in manifest["manuals"]:
            required = ("id", "title", "file", "revision")
            if (not isinstance(manual, dict) or
                    any(not isinstance(manual.get(key), str) or not manual[key].strip() for key in required) or
                    manual["id"] in seen or
                    not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,80}", manual["id"]) or
                    not isinstance(manual.get("engineKeys"), list) or not manual["engineKeys"] or
                    any(not isinstance(key, str) or not key.strip() for key in manual["engineKeys"])):
                raise SystemExit("invalid or duplicate external manual in manifest")
            for operation in manual.get("procedures", []):
                if any(not isinstance(operation.get(key), str) or not operation[key].strip()
                       for key in ("engineModel", "anomalyType", "label")):
                    raise SystemExit(f"invalid procedure mapping in manual: {manual['id']}")
            source = Path(manual["file"]).expanduser()
            if not source.is_absolute():
                source = manifest_path.parent / source
            if not source.is_file():
                raise SystemExit(f"missing PDF: {source}")
            records.append(index_external_manual(manual, source.resolve(), pdf_dir))
            seen.add(manual["id"])
    atomic_json(output, {"version": 1, "manuals": records})
    print(f"wrote {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
