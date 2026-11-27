"""Conservative extraction of explicitly approved numbered workshop procedures."""
import re


NUMBERED = re.compile(r"^\s*(\d+)[.)]\s*(.*?)\s*$")


def _anchor_pattern(anchor):
    # Treat line wraps and repeated spacing as one space while matching literal words.
    return re.compile(r"\s+".join(re.escape(part) for part in anchor.split()))


def _anchored_pages(pages, first_page, last_page, start_after=None, stop_before=None):
    selected = [{**page, "text": page["text"]} for page in pages if first_page <= page["pdfPage"] <= last_page]
    if ([page["pdfPage"] for page in selected] != list(range(first_page, last_page + 1)) or
            (start_after is not None and not start_after.strip()) or (stop_before is not None and not stop_before.strip())):
        return []
    if start_after is not None:
        pattern = _anchor_pattern(start_after)
        matches = [(index, match) for index, page in enumerate(selected) for match in pattern.finditer(page["text"])]
        if len(matches) != 1:
            return []
        index, match = matches[0]
        selected[index]["text"] = selected[index]["text"][match.end():]
        selected = selected[index:]
    if stop_before is not None:
        pattern = _anchor_pattern(stop_before)
        matches = [(index, match) for index, page in enumerate(selected) for match in pattern.finditer(page["text"])]
        if len(matches) != 1:
            return []
        index, match = matches[0]
        selected[index]["text"] = selected[index]["text"][:match.start()]
        selected = selected[:index + 1]
    return selected


def extract_numbered_steps(pages, first_page, last_page, start_after=None, stop_before=None):
    """Return steps only for an unambiguous 1..N numbered sequence in page order."""
    found = []
    for page in _anchored_pages(pages, first_page, last_page, start_after, stop_before):
        number = page["pdfPage"]
        active = None
        for line in page["text"].splitlines():
            match = NUMBERED.match(line)
            if match:
                if not match.group(2).strip():
                    return []
                active = {"number": int(match.group(1)), "pdfPage": number, "text": match.group(2).strip()}
                found.append(active)
            elif found and active is None and line.strip():
                # A split step cannot be attributed to just one source page.
                return []
            elif active and line.strip() and not re.match(r"^\s*\d+\s*[.)]", line):
                active["text"] += " " + line.strip()
    if not found or [step["number"] for step in found] != list(range(1, len(found) + 1)):
        return []
    return [{"pdfPage": step["pdfPage"], "title": f"Шаг {step['number']}",
             "text": step["text"], "quote": step["text"]} for step in found]


def approved_procedures(manual, pages, digest):
    results = []
    for operation in manual.get("procedures", []):
        if operation.get("approvedSourceSha256") != digest:
            continue
        first, last = operation.get("pdfPageStart"), operation.get("pdfPageEnd")
        if not isinstance(first, int) or not isinstance(last, int) or first < 1 or last < first:
            continue
        steps = extract_numbered_steps(pages, first, last, operation.get("startAfter"), operation.get("stopBefore"))
        if not steps:
            continue
        results.append({"engineModel": operation["engineModel"], "anomalyType": operation["anomalyType"],
                        "manualId": manual["id"], "sourceSha256": digest, "pdfPage": steps[0]["pdfPage"],
                        "text": operation["label"], "quote": steps[0]["quote"],
                        "procedure": [{"manualId": manual["id"], **step} for step in steps]})
    return results
