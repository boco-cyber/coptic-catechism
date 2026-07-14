#!/usr/bin/env python3
"""Stage 1: render the Arabic source PDFs to resumable grayscale PNG pages."""

import argparse
import shutil
import subprocess
from pathlib import Path

from common import DEFAULT_PDF_DIR, WORK_DIR, discover_pdfs


def render(pdf: Path, destination: Path, dpi: int) -> tuple[int, bool]:
    destination.mkdir(parents=True, exist_ok=True)
    for path in list(destination.glob("page-*.png")):
        number = int(path.stem.split("-", 1)[1])
        normalized = destination / f"page-{number:04d}.png"
        if path != normalized:
            path.replace(normalized)
    expected = None
    if shutil.which("pdfinfo"):
        output = subprocess.check_output(["pdfinfo", str(pdf)], text=True)
        for line in output.splitlines():
            if line.startswith("Pages:"):
                expected = int(line.split(":", 1)[1])
                break
    existing = list(destination.glob("page-*.png"))
    if expected is not None and len(existing) == expected:
        return expected, True
    if not shutil.which("pdftoppm"):
        raise SystemExit("pdftoppm is required (install poppler-utils)")
    subprocess.run(
        ["pdftoppm", "-png", "-gray", "-r", str(dpi), str(pdf), str(destination / "page")],
        check=True,
    )
    # pdftoppm does not pad page numbers consistently; normalize the artifact
    # names so lexical and numeric ordering are identical.
    for path in list(destination.glob("page-*.png")):
        number = int(path.stem.split("-", 1)[1])
        normalized = destination / f"page-{number:04d}.png"
        if path != normalized:
            path.replace(normalized)
    rendered = list(destination.glob("page-*.png"))
    if expected is not None and len(rendered) != expected:
        raise SystemExit(f"Rendered {len(rendered)}/{expected} pages from {pdf.name}")
    return len(rendered), False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--book", type=int, choices=range(0, 8), action="append")
    args = parser.parse_args()
    pdfs = discover_pdfs(args.pdf_dir)
    for book in args.book or range(0, 8):
        count, skipped = render(pdfs[book], WORK_DIR / "pages" / f"book{book}", args.dpi)
        print(f"book{book}: {count} pages" + (" (already complete)" if skipped else " rendered"))


if __name__ == "__main__":
    main()
