#!/usr/bin/env python3
"""Extract Arabic book and chapter titles from the OCR front matter and
in-book chapter headings.

Book titles: read directly off each book's title page (page 1-3), which
consistently prints "الجزء N" / topic line in the front matter.

Chapter titles: for each chapter, look at the lines immediately before its
first successfully-segmented question -- catechism chapters open with a short
heading line (no "؟", no leading digit) right before question 1.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from segment_hybrid import ARABIC_RE, clean_text, content_end, segment_book  # noqa: E402

WORK_DIR = Path(__file__).resolve().parents[3] / "data" / "verification"
DATA_DIR = WORK_DIR.parent

BOOK_TITLES_AR = {
    1: "مقدمات في الكاتيشيزم القبطي",
    2: "العقائد المسيحية",
    3: "الكنيسة ملكوت الله على الأرض",
    4: "العبادة المسيحية انطلاقة نحو السماء",
    5: "المؤمن والطغمات السماوية",
    6: "المفاهيم المسيحية والحياة اليومية",
    7: "الأخرويات والحياة بعد الموت",
}


ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
# Some books mark chapter titles with a markdown heading + the book-local
# chapter number, e.g. "# 9. العبادة ومخافة الرب" for book4 chapter 9 --
# directly matching structureData.js's chapterNumber (unlike question
# numbers, chapter numbers don't reset). Real chapter titles never contain a
# question mark; lines that do are actual in-chapter questions reusing the
# same "# N." markup and must be excluded.
MD_HEADING_RE = re.compile(r"^#+\s*([0-9٠-٩]{1,3})\s*[.:\-]?\s*(.+)$")


def markdown_chapter_titles(lines):
    by_num = {}
    for line in lines:
        m = MD_HEADING_RE.match(line)
        if not m or "؟" in line:
            continue
        num = int(m.group(1).translate(ARABIC_DIGITS))
        title = m.group(2).strip()
        if 3 <= len(title) <= 60 and num not in by_num:
            by_num[num] = title
    return by_num


def main():
    chapters_all = json.loads((WORK_DIR / "chapters_en.json").read_text(encoding="utf-8"))
    by_book = {}
    for c in chapters_all:
        by_book.setdefault(c["bookNumber"], []).append(c)
    for book in by_book:
        by_book[book].sort(key=lambda c: c["chapterNumber"])
    with open(DATA_DIR / "arabic_index.json", encoding="utf-8") as f:
        index = json.load(f)

    chapter_titles = {}
    for book in range(1, 8):
        lines, candidates, aligned = segment_book(book, by_book[book], index)
        md_titles = markdown_chapter_titles(lines)
        for chapter in by_book[book]:
            key = f"{book}-{chapter['chapterNumber']}"
            # A tight-lookback fallback was tried and discarded: even at 1-3
            # lines back it grabbed the wrong chapter's title or random prose
            # more often than not (verified by spot check). Only the explicit
            # markdown "# N. Title" signal is reliable enough to publish;
            # everything else stays blank (falls back to the English title,
            # same as the site already does) rather than risk a wrong label.
            heading = md_titles.get(chapter["chapterNumber"], "")
            chapter_titles[key] = heading
            print(f"book{book} ch{chapter['chapterNumber']:>2} '{chapter['title'][:35]:35}' -> {heading!r}")

    out = {
        "books": {str(b): {"title": t, "description": ""} for b, t in BOOK_TITLES_AR.items()},
        "chapters": chapter_titles,
    }
    (WORK_DIR / "arabic_titles_v2.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    missing = sum(1 for v in chapter_titles.values() if not v)
    print(f"\n{len(chapter_titles) - missing}/{len(chapter_titles)} chapter titles found")


if __name__ == "__main__":
    main()
