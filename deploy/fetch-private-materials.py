#!/usr/bin/env python3
"""Fetch organizer materials to an immutable host release without logging its source URL."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import shutil
import sys
import tempfile
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zipfile import ZipFile
from datetime import datetime

MAX_DOWNLOAD = 1_500_000_000
MAX_ARCHIVE_SIZE = 2_000_000_000
MAX_ARCHIVE_FILES = 500
EXPECTED_VEHICLES = 50
EXPECTED_SESSIONS = 195


class FetchError(Exception):
    pass


class HTTPSRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).scheme != "https":
            raise FetchError("source redirect must use HTTPS")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def is_yandex_host(host):
    host = (host or "").lower().rstrip(".")
    domains = ("yandex.ru", "yandex.com", "yandex.net", "yadi.sk", "yadi.net")
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise FetchError("invalid prepared knowledge") from exc


def validate_prepared_knowledge(root):
    index = read_json(root / "index.json")
    manuals = index.get("manuals") if isinstance(index, dict) else None
    if index.get("version") != 1 or not isinstance(manuals, list) or len(manuals) != 6:
        raise FetchError("incomplete prepared knowledge")
    hashes = set()
    manuals_by_id = {}
    for manual in manuals:
        identifier = manual.get("id") if isinstance(manual, dict) else None
        title = manual.get("title") if isinstance(manual, dict) else None
        filename = manual.get("filename") if isinstance(manual, dict) else None
        digest = manual.get("sha256") if isinstance(manual, dict) else None
        engine_keys = manual.get("engineKeys") if isinstance(manual, dict) else None
        page_count = manual.get("pageCount") if isinstance(manual, dict) else None
        pages = manual.get("pages") if isinstance(manual, dict) else None
        if (not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,80}", identifier, re.IGNORECASE)
                or identifier in manuals_by_id or not isinstance(title, str) or not title.strip()
                or not isinstance(engine_keys, list) or not engine_keys or any(not isinstance(key, str) or not key.strip() for key in engine_keys)
                or not isinstance(filename, str) or Path(filename).name != filename or not filename.lower().endswith(".pdf")
                or isinstance(page_count, bool) or not isinstance(page_count, int) or page_count < 1
                or not isinstance(digest, str) or len(digest) != 64 or not isinstance(pages, list) or not pages
                or any(not isinstance(page, dict) or isinstance(page.get("pdfPage"), bool) or not isinstance(page.get("pdfPage"), int)
                       or page["pdfPage"] < 1 or page["pdfPage"] > page_count or not isinstance(page.get("text"), str) for page in pages)
                or not any(page["text"].strip() for page in pages)):
            raise FetchError("invalid prepared knowledge index")
        if manual.get("procedures") is not None and not isinstance(manual["procedures"], list):
            raise FetchError("invalid prepared knowledge index")
        pdf = root / "pdf" / filename
        try:
            actual = hashlib.sha256(pdf.read_bytes()).hexdigest()
        except OSError as exc:
            raise FetchError("prepared PDF missing") from exc
        if actual != digest:
            raise FetchError("prepared PDF does not match index")
        hashes.add(digest)
        manuals_by_id[identifier] = manual
    if len(hashes) != 6:
        raise FetchError("duplicate prepared PDF")
    guidance = read_json(root / "guidance.json")
    if not isinstance(guidance, dict) or not isinstance(guidance.get("guidance"), list) or not guidance["guidance"]:
        raise FetchError("incomplete prepared guidance")

    def validate_guidance(item):
        if not isinstance(item, dict):
            raise FetchError("invalid prepared guidance")
        manual = manuals_by_id.get(item.get("manualId"))
        page_number = item.get("pdfPage")
        page = next((p["text"] for p in manual["pages"] if p["pdfPage"] == page_number), None) if manual else None
        engine = item.get("engineModel")
        quote = item.get("quote")
        if (not manual or not isinstance(engine, str) or not isinstance(item.get("anomalyType"), str)
                or isinstance(page_number, bool) or not isinstance(page_number, int) or page_number < 1
                or not isinstance(item.get("text"), str) or not item["text"].strip()
                or not isinstance(quote, str) or not quote.strip()
                or engine.lower() not in [key.lower() for key in manual["engineKeys"]]
                or not isinstance(page, str)
                or " ".join(quote.lower().split()) not in " ".join(page.lower().split())):
            raise FetchError("invalid prepared guidance")
        translations = item.get("translations")
        if translations is not None and (not isinstance(translations, dict) or any(
                language not in {"en", "hi", "tg", "uz"} or not isinstance(text, str) or not text.strip()
                for language, text in translations.items())):
            raise FetchError("invalid prepared guidance")

    for manual in manuals_by_id.values():
        for item in manual.get("procedures") or []:
            if not isinstance(item, dict):
                raise FetchError("invalid prepared procedure")
            if item.get("sourceSha256") != manual["sha256"]:
                continue
            validate_guidance({**item, "manualId": item.get("manualId", manual["id"])})
            if not isinstance(item.get("procedure"), list) or not item["procedure"]:
                raise FetchError("invalid prepared procedure")
            for step in item["procedure"]:
                if not isinstance(step, dict) or not isinstance(step.get("title"), str) or not step["title"].strip():
                    raise FetchError("invalid prepared procedure")
                validate_guidance({**step, "engineModel": item["engineModel"], "anomalyType": item["anomalyType"],
                                   "manualId": step.get("manualId", item.get("manualId", manual["id"]))})
    for item in guidance["guidance"]:
        validate_guidance(item)
        if "procedure" not in item:
            continue
        if not isinstance(item["procedure"], list) or not item["procedure"]:
            raise FetchError("invalid prepared procedure")
        for step in item["procedure"]:
            if not isinstance(step, dict) or not isinstance(step.get("title"), str) or not step["title"].strip():
                raise FetchError("invalid prepared procedure")
            validate_guidance({**step, "engineModel": item["engineModel"], "anomalyType": item["anomalyType"]})
    return hashes


def request_bytes(url, max_bytes=MAX_DOWNLOAD):
    if urlparse(url).scheme != "https":
        raise FetchError("remote source must use HTTPS")
    try:
        with build_opener(HTTPSRedirectHandler()).open(Request(url, headers={"User-Agent": "Mehay-private-material-loader/1.0"}), timeout=60) as response:
            if urlparse(response.geturl()).scheme != "https":
                raise FetchError("source redirect must use HTTPS")
            chunks, total = [], 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise FetchError("source exceeds size limit")
                chunks.append(chunk)
            return b"".join(chunks)
    except FetchError:
        raise
    except Exception as exc:
        raise FetchError("source request failed") from exc


def yandex_json(endpoint, params):
    query = urlencode(params)
    path = f"/v1/disk/public/resources/{endpoint}" if endpoint else "/v1/disk/public/resources"
    try:
        return json.loads(request_bytes(f"https://cloud-api.yandex.net{path}?{query}", 20_000_000))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise FetchError("invalid source response") from exc


def fetch_yandex(source, incoming):
    metadata = yandex_json("", {"public_key": source, "limit": 1000, "offset": 0})
    if metadata.get("type") != "dir":
        raise FetchError("source is not a folder")
    items = metadata.get("_embedded", {}).get("items")
    if not isinstance(items, list):
        raise FetchError("source listing unavailable")
    files = [item for item in items if item.get("type") == "file" and Path(item.get("name", "")).suffix.lower() in {".pdf", ".zip", ".docx"}]
    if sum(Path(item.get("name", "")).suffix.lower() == ".pdf" for item in files) != 6 or sum(Path(item.get("name", "")).suffix.lower() == ".zip" for item in files) != 1:
        raise FetchError("source must contain six PDFs and one mock archive")
    if sum(Path(item.get("name", "")).suffix.lower() == ".docx" for item in files) != 3:
        raise FetchError("source must contain three organizer documents")
    for ordinal, item in enumerate(files):
        if Path(item["name"]).suffix.lower() == ".docx":
            continue
        params = {"public_key": source, "path": item.get("path") or "/" + item["name"]}
        link = yandex_json("download", params).get("href")
        if not isinstance(link, str) or urlparse(link).scheme != "https":
            raise FetchError("source download link unavailable")
        content = request_bytes(link)
        suffix = Path(item["name"]).suffix.lower()
        (incoming / f"source-{ordinal}{suffix}").write_bytes(content)


def fetch_source(source, incoming):
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"} and parsed.scheme != "https":
        raise FetchError("remote source must use HTTPS")
    if parsed.scheme == "https" and is_yandex_host(parsed.hostname):
        fetch_yandex(source, incoming)
    elif parsed.scheme == "https":
        content = request_bytes(source, MAX_ARCHIVE_SIZE)
        if not content.startswith(b"PK"):
            raise FetchError("direct source is not a ZIP archive")
        (incoming / "source.zip").write_bytes(content)
    else:
        path = Path(source).expanduser()
        if path.is_dir():
            for ordinal, file in enumerate(path.rglob("*")):
                if file.is_file() and file.suffix.lower() in {".pdf", ".zip"}:
                    suffix = file.suffix.lower()
                    (incoming / f"source-{ordinal}{suffix}").write_bytes(file.read_bytes())
        elif path.is_file() and path.suffix.lower() == ".zip":
            shutil.copyfile(path, incoming / "source.zip")
        else:
            raise FetchError("source is unavailable")


def safe_extract(archive, destination):
    try:
        with ZipFile(archive) as source:
            infos = source.infolist()
            if len(infos) > MAX_ARCHIVE_FILES or sum(item.file_size for item in infos) > MAX_ARCHIVE_SIZE:
                raise FetchError("archive exceeds size limit")
            seen = set()
            for item in infos:
                relative = PurePosixPath(item.filename)
                mode = item.external_attr >> 16
                if (relative.is_absolute() or ".." in relative.parts or not relative.parts
                        or (mode & 0o170000) == 0o120000 or item.filename in seen):
                    raise FetchError("unsafe archive entry")
                seen.add(item.filename)
                target = destination.joinpath(*relative.parts)
                if item.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(item) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
    except FetchError:
        raise
    except Exception as exc:
        raise FetchError("invalid source archive") from exc


def validate_vehicle_data(path):
    data = read_json(path)
    vehicles = data.get("vehicles") if isinstance(data, dict) else None
    if not isinstance(vehicles, list) or len(vehicles) != EXPECTED_VEHICLES:
        raise FetchError("mock vehicle data is incomplete")
    seen = set()
    session_count = 0
    for vehicle in vehicles:
        if not isinstance(vehicle, dict) or not isinstance(vehicle.get("vehicle_id"), str) or not isinstance(vehicle.get("sessions"), list):
            raise FetchError("invalid mock vehicle data")
        if vehicle["vehicle_id"] in seen:
            raise FetchError("duplicate mock vehicle")
        seen.add(vehicle["vehicle_id"])
        if not vehicle["sessions"]:
            raise FetchError("mock vehicle has no diagnostic sessions")
        sessions = set()
        for session in vehicle["sessions"]:
            if not isinstance(session, dict) or not isinstance(session.get("session_id"), str):
                raise FetchError("invalid mock session")
            checked_at = session.get("checked_at")
            if not isinstance(checked_at, str) or not checked_at.strip():
                raise FetchError("mock session timestamp is missing")
            try:
                datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
            except ValueError as exc:
                raise FetchError("mock session timestamp is invalid") from exc
            if session["session_id"] in sessions:
                raise FetchError("duplicate mock session")
            sessions.add(session["session_id"])
            session_count += 1
    if session_count != EXPECTED_SESSIONS:
        raise FetchError("mock diagnostic sessions are incomplete")
    return data


def file_manifest(root):
    if root.is_symlink() or not root.is_dir():
        return None
    manifest = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            return None
        relative = path.relative_to(root).as_posix()
        if path.is_dir():
            manifest[relative + "/"] = "directory"
        elif path.is_file():
            manifest[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        else:
            return None
    return manifest


def validate_source_path(root, knowledge_root):
    protected = [Path("/opt/mehay/data").resolve(), Path("/opt/mehay/deploy").resolve(), knowledge_root]
    if root == Path("/") or any(root == item or root in item.parents or item in root.parents for item in protected):
        raise FetchError("private source directory overlaps application data")
    current = Path(root.anchor)
    for part in root.parts[1:]:
        current /= part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            break
        if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
            raise FetchError("private source path contains an unsafe component")
        if os.geteuid() == 0:
            info = current.stat()
            permissions = stat.S_IMODE(info.st_mode)
            if info.st_uid != 0 or permissions & 0o022:
                raise FetchError("private source path has an unsafe writable ancestor")
            if current == root and (info.st_gid != 1000 or permissions & 0o050 != 0o050):
                raise FetchError("existing private source directory has unsafe ownership or permissions")
    for directory in (root, root / "releases"):
        try:
            mode = directory.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
            raise FetchError("private source path contains an unsafe component")
        if os.geteuid() == 0:
            info = directory.stat()
            permissions = stat.S_IMODE(info.st_mode)
            if info.st_uid != 0 or info.st_gid != 1000 or permissions & 0o050 != 0o050 or permissions & 0o027:
                raise FetchError("existing private source directory has unsafe ownership or permissions")


def prepare_source_directories(root, knowledge_root):
    validate_source_path(root, knowledge_root)
    current = Path(root.anchor)
    for part in root.parts[1:]:
        current /= part
        if current.exists():
            continue
        current.mkdir(mode=0o700)
        if os.geteuid() == 0:
            os.chown(current, 0, 1000)
            os.chmod(current, 0o750)
    releases = root / "releases"
    if not releases.exists():
        releases.mkdir(mode=0o700)
        if os.geteuid() == 0:
            os.chown(releases, 0, 1000)
            os.chmod(releases, 0o750)


def publish_release(staged, release):
    for path in [staged, *staged.rglob("*")]:
        os.chmod(path, 0o750 if path.is_dir() else 0o640)
        if os.geteuid() == 0:
            os.chown(path, 0, 1000)
    staged.rename(release)


def main():
    source = os.environ.get("MEHAY_PRIVATE_SOURCE", "").strip()
    source_root_setting = os.environ.get("MEHAY_PRIVATE_SOURCE_DIR", "").strip() or "/opt/mehay/private-source"
    source_root_input = Path(source_root_setting)
    if not source_root_input.is_absolute() or any(part in {".", ".."} for part in source_root_setting.split("/")):
        raise FetchError("private source directory must be absolute")
    source_root = source_root_input.resolve()
    if source_root == Path("/") or source_root == Path.cwd().resolve():
        raise FetchError("private source directory is unsafe")
    if source_root != source_root_input:
        raise FetchError("private source directory must not traverse symlinks")
    knowledge_input = Path(os.environ.get("MEHAY_KB_DIR", "/opt/mehay/knowledge"))
    if not knowledge_input.is_absolute() or any(part in {".", ".."} for part in str(knowledge_input).split("/")):
        raise FetchError("knowledge directory must be an absolute canonical path")
    knowledge_root = knowledge_input.resolve()
    if knowledge_root != knowledge_input:
        raise FetchError("knowledge directory must not traverse symlinks")
    if not source:
        raise FetchError("private source is not configured")
    expected_archive = os.environ.get("MEHAY_PRIVATE_ARCHIVE_SHA256", "").lower()
    if len(expected_archive) != 64 or any(char not in "0123456789abcdef" for char in expected_archive):
        raise FetchError("private archive SHA-256 is not configured")
    expected = validate_prepared_knowledge(knowledge_root)
    validate_source_path(source_root, knowledge_root)
    if "--preflight-paths" in sys.argv[1:]:
        print("private material paths verified")
        return
    prepare_source_directories(source_root, knowledge_root)
    releases = source_root / "releases"
    with tempfile.TemporaryDirectory(prefix="mehay-private-") as temporary:
        work = Path(temporary)
        incoming, unpacked = work / "incoming", work / "unpacked"
        incoming.mkdir(mode=0o700)
        unpacked.mkdir(mode=0o700)
        fetch_source(source, incoming)
        archives = sorted(incoming.glob("*.zip"))
        if len(archives) != 1 or hashlib.sha256(archives[0].read_bytes()).hexdigest() != expected_archive:
            raise FetchError("mock archive does not match trusted SHA-256")
        pdf_hashes = {hashlib.sha256(path.read_bytes()).hexdigest() for path in incoming.glob("*.pdf")}
        for ordinal, archive in enumerate(archives):
            safe_extract(archive, unpacked / f"archive-{ordinal}")
        pdf_hashes.update(hashlib.sha256(path.read_bytes()).hexdigest() for path in unpacked.rglob("*.pdf"))
        if pdf_hashes != expected:
            raise FetchError("source PDFs do not match prepared knowledge")
        vehicle_files = [path for path in unpacked.rglob("vehicles.json") if path.parent.name == "data"]
        roots = [path.parent.parent for path in vehicle_files if (path.parent.parent / "mock_ml" / "app.py").is_file()
                 and (path.parent.parent / "mock_toir" / "app.py").is_file()]
        if len(archives) != 1 or len(vehicle_files) != 1 or len(roots) != 1:
            raise FetchError("mock archive is incomplete")
        validate_vehicle_data(vehicle_files[0])
        source_tree = roots[0]
        expected_files = file_manifest(source_tree)
        if expected_files is None:
            raise FetchError("mock archive contains unsafe files")
        archive_hashes = sorted(hashlib.sha256(path.read_bytes()).hexdigest() for path in archives)
        release_id = hashlib.sha256(("\n".join(sorted(pdf_hashes) + archive_hashes)).encode()).hexdigest()
        release = releases / release_id
        try:
            release_mode = release.lstat().st_mode
        except FileNotFoundError:
            release_mode = None
        if release_mode is not None and not stat.S_ISDIR(release_mode):
            raise FetchError("existing private release is not a real directory")
        created_release = release_mode is None
        if created_release:
            staged = releases / f".stage-{os.getpid()}"
            shutil.rmtree(staged, ignore_errors=True)
            staged.mkdir(mode=0o700)
            shutil.copytree(source_tree, staged / "neurodvs_hackathon_mock_2026-11-16")
            try:
                publish_release(staged, release)
            except FileExistsError:
                shutil.rmtree(staged)
        runtime_root_name = "neurodvs_hackathon_mock_2026-11-16"
        expected_release_files = {runtime_root_name + "/": "directory"}
        expected_release_files.update({f"{runtime_root_name}/{name}": digest for name, digest in expected_files.items()})
        if file_manifest(release) != expected_release_files:
            raise FetchError("existing private release does not match verified archive")
        if not created_release and os.geteuid() == 0:
            for path in [release, *release.rglob("*")]:
                info = path.stat()
                permissions = stat.S_IMODE(info.st_mode)
                needed = 0o050 if path.is_dir() else 0o040
                if (info.st_uid != 0 or info.st_gid != 1000 or permissions & needed != needed or permissions & 0o027):
                    raise FetchError("existing private release has unsafe ownership or permissions")
        print(release_id)


if __name__ == "__main__":
    try:
        main()
    except FetchError as exc:
        print(f"private materials check failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except Exception:
        print("private materials check failed: unexpected error", file=sys.stderr)
        raise SystemExit(1)
