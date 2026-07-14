#!/usr/bin/env python3
"""Stage 5: safely promote a reviewed transcription to the production data path."""

import argparse
import shutil

from common import DATA_DIR, WORK_DIR, load_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--approve-conflicts", action="store_true",
        help="confirm that every conflict in verification_report.md was manually reviewed",
    )
    args = parser.parse_args()
    source = WORK_DIR / "catechism_qa_ar_transcribed.json"
    report_path = WORK_DIR / "verification_report.json"
    if not source.exists() or not report_path.exists():
        raise SystemExit("Run segment_transcripts.py and compare_datasets.py first")
    report = load_json(report_path)
    conflicts = report.get("requiresManualReview", [])
    if conflicts and not args.approve_conflicts:
        preview = ", ".join(f"Q{number}" for number in conflicts[:12])
        raise SystemExit(
            f"Refusing build: {len(conflicts)} conflicts need manual review ({preview}). "
            "Review verification_report.md, then rerun with --approve-conflicts."
        )
    current = DATA_DIR / "catechism_qa_ar.json"
    backup = DATA_DIR / "catechism_qa_ar.v1.json"
    if not backup.exists():
        shutil.copy2(current, backup)
        print(f"Preserved original dataset at {backup}")
    else:
        print(f"Preserving existing backup at {backup}")
    temporary = current.with_suffix(".json.tmp")
    shutil.copy2(source, temporary)
    temporary.replace(current)
    print(f"Promoted reviewed transcription to {current}")
    print("Dataset only. Run `npm --prefix backend run seed:arabic` separately after review.")


if __name__ == "__main__":
    main()
