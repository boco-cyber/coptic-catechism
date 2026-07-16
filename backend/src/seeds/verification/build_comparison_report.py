#!/usr/bin/env python3
"""Stage 4: compare the new hybrid-segmented Arabic dataset against the
current production catechism_qa_ar.json, tiered by confidence, so a human can
decide what's safe to seed before anything touches MongoDB.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from align_v2 import normalize, similarity  # noqa: E402

WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"
DATA_DIR = WORK_DIR.parent


def confidence_tier(confidence):
    if confidence is None:
        return "no-old-data"
    if confidence == "number-only":
        return "number-only"
    if confidence >= 0.7:
        return "high"
    if confidence >= 0.5:
        return "medium"
    return "low"


def main():
    old = {e["questionNumber"]: e for e in json.loads((DATA_DIR / "catechism_qa_ar.json").read_text(encoding="utf-8"))}
    new = {e["questionNumber"]: e for e in json.loads((WORK_DIR / "catechism_qa_ar_hybrid.json").read_text(encoding="utf-8"))}

    rows = []
    for qnum in range(1, 1453):
        o = old.get(qnum)
        n = new.get(qnum)
        if n is None:
            rows.append({
                "questionNumber": qnum, "status": "not-segmented",
                "oldQuestion": o["question"] if o else "", "oldAnswer": o["answer"] if o else "",
            })
            continue
        sim = similarity(o["question"], n["question"]) if o and o.get("question") else 0.0
        rows.append({
            "questionNumber": qnum,
            "status": "segmented",
            "confidenceTier": confidence_tier(n["confidence"]),
            "matchConfidence": n["confidence"],
            "oldVsNewQuestionSimilarity": round(sim, 3),
            "oldQuestion": o["question"] if o else "",
            "newQuestion": n["question"],
            "oldAnswer": (o["answer"][:200] if o else ""),
            "newAnswer": n["answer"][:200],
        })

    summary = {
        "totalQuestions": 1452,
        "notSegmented": sum(1 for r in rows if r["status"] == "not-segmented"),
        "segmented": sum(1 for r in rows if r["status"] == "segmented"),
        "byConfidenceTier": {},
    }
    for tier in ("high", "medium", "low", "number-only", "no-old-data"):
        summary["byConfidenceTier"][tier] = sum(
            1 for r in rows if r["status"] == "segmented" and r["confidenceTier"] == tier
        )

    (WORK_DIR / "comparison_report.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
