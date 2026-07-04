#!/usr/bin/env python3
"""Map STIHL parts-catalog references to the current TAGRO/STIHL master list.

The script is deliberately conservative:
- Exact normalized part-number matches are marked current.
- Numbers absent from the master are marked missing_from_master.
- Nothing is automatically treated as superseded or replaced.

It writes a compact JSON report and a row-level CSV for review.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from pypdf import PdfReader


PART_ROW = re.compile(
    r"^\s*"
    r"(?P<reference>[0-9]+[A-Za-z]?(?:\s*[-,]\s*[0-9A-Za-z]+)?)"
    r"\s+"
    r"(?P<number>\d{4}\s+\d{3}\s+\d{4})"
    r"\s+"
    r"(?P<description>.+?)"
    r"\s*$"
)


def normalized_part_number(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def model_from_filename(path: Path) -> str:
    return re.sub(r"\s+parts\s+catalog$", "", path.stem, flags=re.IGNORECASE).strip().upper()


def requested_model(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().upper())


def clean_text(value: str) -> str:
    return (
        value.replace("\ue000", " ")
        .replace("\u00a0", " ")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00d8", " diameter ")
        .replace("\u00f8", " diameter ")
    )


def page_section(text: str, fallback: str) -> str:
    for raw_line in text.splitlines():
        line = clean_text(raw_line).strip()
        if not line:
            continue
        if line.startswith("Spare Parts List "):
            continue
        if line.startswith("# Part Number"):
            continue
        return line[:240]
    return fallback


def load_master(path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    items = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("Master catalog must be a JSON array.")

    by_number: dict[str, dict[str, Any]] = {}
    duplicates: Counter[str] = Counter()
    for item in items:
        number = normalized_part_number(item.get("no") or item.get("id"))
        if not number:
            continue
        duplicates[number] += 1
        by_number[number] = item

    metadata = {
        "source": str(path),
        "items": len(items),
        "uniquePartNumbers": len(by_number),
        "duplicatePartNumbers": sum(1 for count in duplicates.values() if count > 1),
    }
    return by_number, metadata


def parse_pdf(path: Path, master: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    reader = PdfReader(str(path))
    model = model_from_filename(path)
    rows: list[dict[str, Any]] = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = clean_text(page.extract_text() or "")
        section = page_section(text, f"{model} page {page_number}")
        for raw_line in text.splitlines():
            line = clean_text(raw_line)
            match = PART_ROW.match(line)
            if not match:
                continue

            number = normalized_part_number(match.group("number"))
            current = master.get(number)
            retail = (current or {}).get("retail")
            if retail in (None, ""):
                retail = (current or {}).get("price")
            rows.append(
                {
                    "model": model,
                    "catalog": path.name,
                    "page": page_number,
                    "section": section,
                    "reference": re.sub(r"\s+", "", match.group("reference")),
                    "pdfPartNumber": number,
                    "pdfDescription": match.group("description").strip(),
                    "status": "exact_current" if current else "missing_from_master",
                    "currentPartNumber": number if current else "",
                    "tagroName": (current or {}).get("tagroName") or "",
                    "stihlName": (current or {}).get("stihlName") or (current or {}).get("name") or "",
                    "retail": retail,
                    "mrp": (current or {}).get("mrp"),
                    "hsn": (current or {}).get("hsn") or "",
                    "gst": (current or {}).get("gst"),
                }
            )

    return rows, len(reader.pages)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = [
        "model",
        "catalog",
        "page",
        "section",
        "reference",
        "pdfPartNumber",
        "pdfDescription",
        "status",
        "currentPartNumber",
        "tagroName",
        "stihlName",
        "retail",
        "mrp",
        "hsn",
        "gst",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-root", required=True, type=Path)
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--models", nargs="+", required=True)
    args = parser.parse_args()

    wanted = {requested_model(model) for model in args.models}
    available = {model_from_filename(path): path for path in args.catalog_root.rglob("*.pdf")}
    available_models = set(available)
    selected = [(model, available[model]) for model in sorted(wanted & available_models)]
    missing_catalogs = sorted(wanted - available_models)

    master, master_metadata = load_master(args.master)
    all_rows: list[dict[str, Any]] = []
    model_reports: list[dict[str, Any]] = []

    for model, path in selected:
        rows, pages = parse_pdf(path, master)
        all_rows.extend(rows)
        unique_numbers = {row["pdfPartNumber"] for row in rows}
        exact_numbers = {
            row["pdfPartNumber"] for row in rows if row["status"] == "exact_current"
        }
        missing_numbers = sorted(unique_numbers - exact_numbers)
        model_reports.append(
            {
                "model": model,
                "catalog": str(path),
                "pages": pages,
                "referenceRows": len(rows),
                "uniquePartNumbers": len(unique_numbers),
                "exactCurrent": len(exact_numbers),
                "missingFromMaster": len(missing_numbers),
                "coveragePercent": round(
                    100 * len(exact_numbers) / max(1, len(unique_numbers)), 2
                ),
                "missingPartNumbers": missing_numbers,
            }
        )

    unique_all = {row["pdfPartNumber"] for row in all_rows}
    exact_all = {
        row["pdfPartNumber"] for row in all_rows if row["status"] == "exact_current"
    }
    report = {
        "policy": {
            "exactMatchesAreCurrent": True,
            "missingNumbersAreNotAutomaticallyObsolete": True,
            "automaticReplacement": False,
            "note": (
                "A number absent from the June 2026 master requires review or an "
                "official supersession source before replacement."
            ),
        },
        "master": master_metadata,
        "requestedModels": sorted(wanted),
        "mappedModels": [model for model, _ in selected],
        "missingCatalogs": missing_catalogs,
        "summary": {
            "catalogsMapped": len(selected),
            "pagesScanned": sum(item["pages"] for item in model_reports),
            "referenceRows": len(all_rows),
            "uniquePartNumbers": len(unique_all),
            "exactCurrent": len(exact_all),
            "missingFromMaster": len(unique_all - exact_all),
            "coveragePercent": round(100 * len(exact_all) / max(1, len(unique_all)), 2),
        },
        "models": model_reports,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "priority-model-parts-mapping.json"
    csv_path = args.output_dir / "priority-model-parts-mapping.csv"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(csv_path, all_rows)

    print(json.dumps(report["summary"], indent=2))
    print(f"Mapped models: {', '.join(report['mappedModels'])}")
    print(f"Missing catalogs: {', '.join(missing_catalogs) or 'none'}")
    print(f"JSON report: {json_path}")
    print(f"CSV detail: {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
