#!/usr/bin/env python3
"""Extract the docx's 1452 Q&A pairs in document order, tagged with which
book ("Part") they structurally fall under (by Heading 1 position, not by
the document's own printed question number, since that numbering does not
line up with the app's book boundaries).

Usage:
    python extractArabicDocxRaw.py <path-to-docx> <output.json>
"""

import json
import re
import sys

import docx

ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"


def to_int(num_str):
    return int(num_str.translate(str.maketrans(ARABIC_DIGITS, "0123456789")))


QUESTION_RE = re.compile(r"^\s*السؤال\s*([0-9٠-٩]+)\s*[:：]\s*(.*)$", re.DOTALL)

# Paragraph indices that are styled "Question" in the source docx but are
# actually mis-tagged answer continuations (verified by hand: each is either
# a mid-sentence scripture-quote fragment or a rhetorical sub-question inside
# a list, with no real content of its own before the next real question).
# Treat them as "Normal" so their text folds into the preceding answer
# instead of being read as a standalone, unanswered question.
FORCE_NORMAL_IDX = {2245, 3384, 3398, 5522, 5523, 6500}


def main():
    docx_path, out_path = sys.argv[1], sys.argv[2]
    d = docx.Document(docx_path)

    book = 0
    records = []
    current = None

    for i, p in enumerate(d.paragraphs):
        style = p.style.name if p.style else None
        if i in FORCE_NORMAL_IDX:
            style = "Normal"
        text = p.text.strip()

        if style == "Heading 1":
            book += 1
            continue
        if not text:
            continue

        if style == "Question":
            m = QUESTION_RE.match(text)
            if not m:
                raise ValueError(f"Bad question paragraph: {text[:80]!r}")
            if current:
                records.append(current)
            current = {
                "book": book,
                "docxNumber": to_int(m.group(1)),
                "question": m.group(2).strip(),
                "answerParts": [],
            }
        elif style == "Normal":
            if current is None:
                continue
            current["answerParts"].append(text)

    if current:
        records.append(current)

    for r in records:
        r["answer"] = "\n".join(r.pop("answerParts")).strip()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(records)} raw docx records -> {out_path}")


if __name__ == "__main__":
    main()
