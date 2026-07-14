#!/usr/bin/env python3
"""Shared paths and validation helpers for the Arabic verification pipeline."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[2]
DATA_DIR = BACKEND / "data"
WORK_DIR = DATA_DIR / "verification"
DEFAULT_PDF_DIR = Path(
    os.environ.get(
        "ARABIC_PDF_DIR",
        "/home/gergo/OneDrive/Documents/catechism fr malaty arabic",
    )
)

BOOK_RANGES = {
    1: (1, 92),
    2: (93, 448),
    3: (449, 877),
    4: (878, 1112),
    5: (1113, 1184),
    6: (1185, 1356),
    7: (1357, 1452),
}

PDF_PATTERNS = {
    0: ("الأسئلة-والمحتويات",),
    1: ("جـ1",),
    2: ("جـ2",),
    3: ("جـ3",),
    4: ("جـ4",),
    5: ("جـ5",),
    6: ("جـ6",),
    7: ("جـ7",),
}

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
DIACRITICS_RE = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]")


def load_dotenv(path: Path = BACKEND / ".env") -> None:
    """Load simple KEY=VALUE entries without overriding the process environment."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def load_json(path: Path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def discover_pdfs(pdf_dir: Path) -> dict[int, Path]:
    if not pdf_dir.is_dir():
        raise SystemExit(f"Arabic PDF directory does not exist: {pdf_dir}")
    pdfs = [path for path in pdf_dir.glob("*.pdf") if "Volume" not in path.name]
    result = {}
    for book, patterns in PDF_PATTERNS.items():
        matches = [path for path in pdfs if all(pattern in path.name for pattern in patterns)]
        if len(matches) != 1:
            names = ", ".join(path.name for path in matches) or "none"
            raise SystemExit(f"Expected exactly one Arabic PDF for book{book}; found: {names}")
        result[book] = matches[0]
    return result


def page_number(path: Path) -> int:
    match = re.search(r"page-(\d+)\.", path.name)
    if not match:
        raise ValueError(f"Unexpected page filename: {path.name}")
    return int(match.group(1))


def normalize_arabic(value: str) -> str:
    value = DIACRITICS_RE.sub("", value.translate(ARABIC_DIGITS))
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.translate(str.maketrans({"ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"}))
    return re.sub(r"\s+", " ", value).strip()


def book_for_question(number: int) -> int:
    for book, (start, end) in BOOK_RANGES.items():
        if start <= number <= end:
            return book
    raise ValueError(f"Question number outside 1..1452: {number}")


def ensure_no_failed_pages() -> None:
    failure_path = WORK_DIR / "failed_pages.json"
    failures = load_json(failure_path) if failure_path.exists() else []
    if failures:
        raise SystemExit(
            f"Refusing to continue: {len(failures)} page(s) remain in {failure_path}"
        )
