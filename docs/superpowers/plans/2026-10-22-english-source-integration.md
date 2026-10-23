# English Source Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy English catalogue with the verified 1,452-question source, correct all hierarchy ranges, preserve source provenance, and add read-only companion-content access without touching Arabic data.

**Architecture:** A Python generator reads the source JSON, validates its hashes and tree, normalizes answer whitespace only, and writes four committed data artifacts. Node models and a validated seed load those artifacts into English-only collections. A small pure service groups content blocks/issues for a read-only API. Legacy English scripts are removed from active commands.

**Tech Stack:** Python 3 standard library, Node.js, Mongoose, Express, Node test runner, Python unittest, JSON.

**Spec:** `docs/superpowers/specs/2026-10-22-english-source-integration-design.md`

## Global Constraints

- English source is authoritative: 7 books, 84 chapters, 1,452 questions.
- Do not preserve the stale `structureData.js` question ranges.
- Question text is copied exactly.
- Answer changes are whitespace-only and must preserve every non-whitespace character.
- Do not run legacy header, footnote, or embedded-question extraction on the new source.
- Arabic collections and `catechism_qa_ar.json` must not change.
- No production MongoDB writes, commit, push, or deploy.
- Migration commands are dry-run by default.
- Existing public/admin API contracts stay the same except for corrected English chapters and the new read-only content endpoint.
- Use the existing code style and CommonJS/ES module conventions already present in each file.
- Tests must run without an external English source when they only validate committed artifacts.

---

### Task 1: Add Whitespace-Only English Body Normalization

**Files:**
- Modify: `backend/src/seeds/formatting.py`
- Modify: `backend/test/test_formatting.py`

**Interfaces:**
- Produces: `formatting.normalize_english_body(answer: str) -> str`
- Produces: `formatting.validate_preserved(original: str, output_parts: list[str]) -> bool` already exists and is reused.

- [ ] **Step 1: Write the failing test**

Add to `backend/test/test_formatting.py` in `EnglishFormattingTests`:

```python
    def test_normalizes_wrapped_english_body_without_footnote_extraction(self):
        source = (
            "a. The feeling that my life is a journey with the Lord\n\n"
            "of glory.\n\n"
            "b. The second point. 42"
        )
        body = formatting.normalize_english_body(source)
        self.assertEqual(
            body,
            "a. The feeling that my life is a journey with the Lord of glory."
            "\n\nb. The second point. 42",
        )
        self.assertTrue(formatting.validate_preserved(source, [body]))

    def test_normalization_rejects_character_changes(self):
        with self.assertRaises(ValueError):
            formatting.normalize_english_body("The body.")
```

The second test requires a deliberate mutation in the implementation test path; implement it by monkeypatching `formatting.validate_preserved`:

```python
    def test_normalization_rejects_character_changes(self):
        original = formatting.validate_preserved
        formatting.validate_preserved = lambda source, parts: False
        try:
            with self.assertRaises(ValueError):
                formatting.normalize_english_body("The body.")
        finally:
            formatting.validate_preserved = original
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 backend/test/test_formatting.py -v`

Expected: FAIL with `AttributeError: module 'formatting' has no attribute 'normalize_english_body'`.

- [ ] **Step 3: Implement `normalize_english_body`**

Add this function to `backend/src/seeds/formatting.py` immediately before `format_english_dataset`:

```python
def normalize_english_body(answer: str) -> str:
    """Join PDF-wrapped lines while preserving paragraphs and visible text.

    This deliberately does not remove headers, extract footnotes, or drop
    embedded questions. Those operations are only valid for the legacy
    extraction path.
    """
    raw = answer.replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.split("\n")
    lengths = [len(line.strip()) for line in lines if line.strip()]
    max_length = (
        statistics.quantiles(lengths, n=20)[-2]
        if len(lengths) >= 20
        else (max(lengths) if lengths else 90)
    )
    max_length = max(70, min(100, max_length))

    paragraphs: list[str] = []
    current: list[str] = []
    blank = False
    for line in lines:
        if not line.strip():
            blank = True
            continue
        text = line.strip()
        if not current:
            current = [text]
            blank = False
            continue
        if should_break(
            current[-1],
            text,
            max_length,
            blank=blank,
            current_text=" ".join(current),
        ):
            paragraphs.append(join_lines(current))
            current = [text]
        else:
            current.append(text)
        blank = False
    if current:
        paragraphs.append(join_lines(current))

    body = "\n\n".join(paragraph for paragraph in paragraphs if paragraph.strip()).strip()
    if not validate_preserved(answer, [body]):
        raise ValueError("English normalization changed non-whitespace characters")
    return body
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 backend/test/test_formatting.py -v`

Expected: PASS.

- [ ] **Step 5: Verify the existing suite still passes**

Run: `npm --prefix backend test`

Expected: PASS.

---

### Task 2: Generate and Validate the English Artifacts

**Files:**
- Create: `backend/src/seeds/syncEnglishSource.py`
- Create: `backend/test/test_english_source.py`
- Create: `backend/data/english_structure.json`
- Replace: `backend/data/catechism_qa.json`
- Create: `backend/data/english_content_blocks.json`
- Create: `backend/data/english_extraction_issues.json`

**Interfaces:**
- Consumes: `formatting.normalize_english_body`.
- Produces: `syncEnglishSource.load_source(path: Path) -> dict`
- Produces: `syncEnglishSource.build_catalogue(payload: dict) -> tuple[dict, list[dict], list[dict], list[dict]]`
- Produces: `syncEnglishSource.validate_catalogue(structure, questions, blocks, issues, payload) -> list[str]`
- Produces: `syncEnglishSource.run(source_dir: Path, check: bool) -> int`
- Produces artifact schema documented in the spec.

- [ ] **Step 1: Write the source test first**

Create `backend/test/test_english_source.py`:

```python
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "seeds"))

import syncEnglishSource

SOURCE_DIR = Path(
    "/mnt/66462D50462D21F3/apps/doc editor/catechism_extraction"
)
SOURCE_FILE = SOURCE_DIR / "catechism_extraction.json"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@unittest.skipUnless(SOURCE_FILE.exists(), "English source not present")
class EnglishSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = syncEnglishSource.load_source(SOURCE_FILE)
        (
            cls.structure,
            cls.questions,
            cls.blocks,
            cls.issues,
        ) = syncEnglishSource.build_catalogue(cls.payload)

    def test_source_counts_and_numbering(self):
        self.assertEqual(len(self.structure["books"]), 7)
        self.assertEqual(
            sum(len(book["chapters"]) for book in self.structure["books"]), 84
        )
        self.assertEqual(len(self.questions), 1452)
        self.assertEqual(
            [row["questionNumber"] for row in self.questions],
            list(range(1, 1453)),
        )
        self.assertEqual(len(self.blocks), 1401)
        self.assertEqual(len(self.issues), 61)

    def test_stale_structure_ranges_are_replaced(self):
        book1 = self.structure["books"][0]
        faith = book1["chapters"][3]
        baptism = self.structure["books"][2]["chapters"][16]
        self.assertEqual(faith["title"], "Faith That Works Through Love")
        self.assertEqual(faith["questionRange"], {"start": 7, "end": 38})
        self.assertEqual(baptism["title"], "The Sacrament of Baptism")
        self.assertEqual(baptism["questionRange"], {"start": 675, "end": 712})
        self.assertEqual(
            [item["title"] for item in baptism["subsections"]],
            ["On the Rites of Baptism"],
        )
        self.assertEqual(
            [item["title"] for item in baptism["subsections"][0]["children"]],
            ["The Rites of Holy Baptism"],
        )

    def test_question_paths_and_footnotes(self):
        q1 = self.questions[0]
        self.assertEqual(q1["question"], "What does the word catechism mean?")
        self.assertEqual(
            [item["title"] for item in q1["sourceSectionPath"]],
            ["Catechism"],
        )
        q682 = next(row for row in self.questions if row["questionNumber"] == 682)
        self.assertEqual(
            [item["title"] for item in q682["sourceSectionPath"]],
            ["The Sacrament of Baptism", "On the Rites of Baptism"],
        )
        self.assertEqual(
            sum(len(row["footnotes"]) for row in self.questions),
            1011,
        )
        self.assertEqual(
            len([row for row in self.questions if row["footnotes"]]),
            750,
        )

    def test_answers_preserve_all_visible_characters(self):
        for source, generated in zip(self.payload["qa"], self.questions):
            self.assertTrue(
                syncEnglishSource.visible_characters(
                    source["answer_text_exact"]
                )
                == syncEnglishSource.visible_characters(generated["answer"])
            )

    def test_validation_reports_no_errors(self):
        errors = syncEnglishSource.validate_catalogue(
            self.structure,
            self.questions,
            self.blocks,
            self.issues,
            self.payload,
        )
        self.assertEqual(errors, [])

    def test_mutated_question_number_is_rejected(self):
        questions = [dict(row) for row in self.questions]
        questions[1]["questionNumber"] = 99
        errors = syncEnglishSource.validate_catalogue(
            self.structure,
            questions,
            self.blocks,
            self.issues,
            self.payload,
        )
        self.assertIn("question numbers are not contiguous from 1", errors)


class EnglishArtifactTests(unittest.TestCase):
    def test_committed_artifacts_have_expected_shape(self):
        structure = json.loads((DATA_DIR / "english_structure.json").read_text())
        questions = json.loads((DATA_DIR / "catechism_qa.json").read_text())
        blocks = json.loads((DATA_DIR / "english_content_blocks.json").read_text())
        issues = json.loads(
            (DATA_DIR / "english_extraction_issues.json").read_text()
        )
        self.assertEqual(len(structure["books"]), 7)
        self.assertEqual(
            sum(len(book["chapters"]) for book in structure["books"]), 84
        )
        self.assertEqual(len(questions), 1452)
        self.assertEqual(len(blocks), 1401)
        self.assertEqual(len(issues), 61)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 backend/test/test_english_source.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'syncEnglishSource'`.

- [ ] **Step 3: Implement the generator**

Create `backend/src/seeds/syncEnglishSource.py`:

```python
#!/usr/bin/env python3
"""Generate the English catechism catalogue from the verified source JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from formatting import normalize_english_body

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parents[1] / "data"
STRUCTURE_FILE = DATA_DIR / "english_structure.json"
QUESTION_FILE = DATA_DIR / "catechism_qa.json"
BLOCK_FILE = DATA_DIR / "english_content_blocks.json"
ISSUE_FILE = DATA_DIR / "english_extraction_issues.json"

SOURCE_DIR_DEFAULT = Path(
    os.environ.get(
        "ENGLISH_SOURCE_DIR",
        "/mnt/66462D50462D21F3/apps/doc editor/catechism_extraction",
    )
)

EXPECTED_BOOKS = 7
EXPECTED_CHAPTERS = 84
EXPECTED_INTERMEDIATE = 6
EXPECTED_QUESTIONS = 1452
EXPECTED_BLOCKS = 1401
EXPECTED_ISSUES = 61
EXPECTED_FOOTNOTES = 1267
EXPECTED_LINKED_FOOTNOTES = 1011

EXPECTED_HASHES = {
    "catechism_extraction.json": "44bd24229d1d9c87f395e4d401bf464cb228264528a6fc50932f71796adbb30c",
    "catechism.db": "5b3ae7576dae4aa84eb8e98d7af4e4a7bed0f406563cf4ac625cd3081b3dec4a",
    "page_manifest.csv": "91dc82482f702ce6e1023e093f57bc2ed6b813940178070da88e04b586bea5aa",
}

BOOK_DESCRIPTIONS = {
    1: "Foundations of the Coptic Catechism, the Holy Bible, Holy Tradition, and faith that works through love.",
    2: "The Creed, the Holy Trinity, Creation, Divine Providence, Grace, the Fall, Christology, and the Holy Spirit.",
    3: "Ecclesiology, the Holy Sacraments, the priesthood, matrimony, and the monastic movement.",
    4: "Prayer, the Agpeya, fasting, praise, hymns, the Coptic calendar, and worship as dying with Christ.",
    5: "Angels, the spiritual world, the order of heavenly hosts, and spiritual warfare.",
    6: "Virtues, vices, Church and State, social relationships, wealth, liberty, and science and faith.",
    7: "Death, the resurrection, millennialism, the Second Coming, the Final Judgment, and the heavenly Jerusalem.",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def visible_characters(value: str) -> Counter:
    return Counter(re.sub(r"\s+", "", value))


def volume_number(source_volume_id: str) -> int:
    return int(source_volume_id.rsplit("_", 1)[1])


def clean_book_title(heading: str) -> str:
    match = re.match(
        r"^Book\s+\d+\s+\(Questions?\s+[^)]+\)\s*:\s*(.+)$",
        heading,
        re.I,
    )
    return match.group(1).strip() if match else heading.strip()


def clean_section_title(section: dict) -> str:
    heading = section["heading_exact"].strip()
    if section["section_type"] == "book":
        return clean_book_title(heading)
    if section["section_type"] == "chapter":
        return re.sub(r"^\d+\.\s*(?:\([a-z]\)\s*)?", "", heading).strip()
    return heading


def section_maps(payload: dict):
    sections = {section["id"]: section for section in payload["sections"]}
    children = defaultdict(list)
    for section in payload["sections"]:
        children[section["parent_section_id"]].append(section)
    for values in children.values():
        values.sort(key=lambda item: item["sequence_in_book"])
    return sections, children


def questions_by_section(payload: dict):
    grouped = defaultdict(list)
    for question in payload["qa"]:
        grouped[question["section_id"]].append(question)
    for values in grouped.values():
        values.sort(key=lambda item: int(item["question_number_exact"]))
    return grouped


def descendant_sections(section_id: str, children, seen=None) -> list[dict]:
    seen = seen or set()
    result = []
    for child in children.get(section_id, []):
        if child["id"] in seen:
            continue
        seen.add(child["id"])
        result.append(child)
        result.extend(descendant_sections(child["id"], children, seen))
    return result


def descendant_questions(section_id: str, children, direct) -> list[dict]:
    result = list(direct.get(section_id, []))
    for child in children.get(section_id, []):
        result.extend(descendant_questions(child["id"], children, direct))
    return result


def range_for(questions: list[dict]):
    numbers = [int(question["question_number_exact"]) for question in questions]
    if not numbers:
        return {"start": None, "end": None}, 0
    return {"start": min(numbers), "end": max(numbers)}, len(numbers)


def build_subsection(section: dict, children, direct) -> dict:
    questions = descendant_questions(section["id"], children, direct)
    question_range, total = range_for(questions)
    return {
        "sourceSectionId": section["id"],
        "parentSourceSectionId": section["parent_section_id"],
        "sourceHeadingExact": section["heading_exact"],
        "title": clean_section_title(section),
        "sequenceInBook": section["sequence_in_book"],
        "questionRange": question_range,
        "totalQuestions": total,
        "printedPageStart": section["printed_page_start"],
        "printedPageEnd": section["printed_page_end"],
        "pdfPageStart": section["pdf_page_start"],
        "pdfPageEnd": section["pdf_page_end"],
        "children": [
            build_subsection(child, children, direct)
            for child in children.get(section["id"], [])
            if child["section_type"] == "section"
        ],
    }


def section_path(section: dict, sections: dict, book_root_id: str) -> list[dict]:
    path = []
    current = section
    while current and current["id"] != book_root_id:
        path.append(
            {
                "sourceSectionId": current["id"],
                "title": clean_section_title(current),
            }
        )
        parent_id = current["parent_section_id"]
        current = sections.get(parent_id) if parent_id else None
    path.reverse()
    return path


def build_catalogue(payload: dict):
    sections, children = section_maps(payload)
    direct = questions_by_section(payload)
    questions_by_id = {
        question["id"]: question for question in payload["qa"]
    }

    book_roots = [
        section
        for section in payload["sections"]
        if section["section_type"] == "book"
    ]
    book_roots.sort(key=lambda item: (item["book_id"], item["sequence_in_book"]))

    source_books = {book["id"]: book for book in payload["books"]}
    section_book = {}
    section_chapter = {}
    books = []
    volume_books = defaultdict(list)

    for book_number, root in enumerate(book_roots, start=1):
        for section in [root, *descendant_sections(root["id"], children)]:
            section_book[section["id"]] = book_number

        chapters = []
        chapter_nodes = [
            child
            for child in children.get(root["id"], [])
            if child["section_type"] == "chapter"
        ]
        for chapter_number, chapter in enumerate(chapter_nodes, start=1):
            for section in [
                chapter,
                *descendant_sections(chapter["id"], children),
            ]:
                section_chapter[section["id"]] = chapter_number

            chapter_questions = descendant_questions(
                chapter["id"], children, direct
            )
            question_range, total = range_for(chapter_questions)
            subsections = [
                build_subsection(child, children, direct)
                for child in children.get(chapter["id"], [])
                if child["section_type"] == "section"
            ]
            chapters.append(
                {
                    "chapterNumber": chapter_number,
                    "sourceSectionId": chapter["id"],
                    "sourceHeadingExact": chapter["heading_exact"],
                    "title": clean_section_title(chapter),
                    "sortOrder": chapter_number,
                    "questionRange": question_range,
                    "totalQuestions": total,
                    "printedPageStart": chapter["printed_page_start"],
                    "printedPageEnd": chapter["printed_page_end"],
                    "pdfPageStart": chapter["pdf_page_start"],
                    "pdfPageEnd": chapter["pdf_page_end"],
                    "subsections": subsections,
                }
            )

        book_questions = descendant_questions(root["id"], children, direct)
        book_range, book_total = range_for(book_questions)
        source_volume_id = root["book_id"]
        volume = volume_number(source_volume_id)
        volume_books[source_volume_id].append(book_number)
        books.append(
            {
                "bookNumber": book_number,
                "sourceVolumeId": source_volume_id,
                "volume": volume,
                "sourceSectionId": root["id"],
                "sourceHeadingExact": root["heading_exact"],
                "title": clean_book_title(root["heading_exact"]),
                "questionRange": book_range,
                "totalQuestions": book_total,
                "description": BOOK_DESCRIPTIONS[book_number],
                "sourcePageRange": {
                    "start": 1,
                    "end": source_books[source_volume_id]["pdf_page_count"],
                },
            }
        )

    volumes = []
    for source_book in payload["books"]:
        source_volume_id = source_book["id"]
        volumes.append(
            {
                "sourceVolumeId": source_volume_id,
                "volume": volume_number(source_volume_id),
                "titleExact": source_book["title_exact"],
                "authorExact": source_book["author_exact"],
                "publicationDetailsExact": source_book[
                    "publication_details_exact"
                ],
                "pdfPageCount": source_book["pdf_page_count"],
                "bookNumbers": volume_books[source_volume_id],
            }
        )

    structure = {
        "source": {
            "name": "catechism_extraction.json",
            "generatedAtUtc": payload["metadata"].get("generated_at_utc"),
            "extractionMethod": payload["metadata"].get("extraction_method"),
            "hashes": EXPECTED_HASHES,
        },
        "volumes": volumes,
        "books": books,
    }

    footnote_map = defaultdict(list)
    for block in payload["content_blocks"]:
        if block["block_type"] == "footnote" and block["related_qa_id"]:
            footnote_map[block["related_qa_id"]].append(block)
    for values in footnote_map.values():
        values.sort(key=lambda item: item["sequence_in_book"])

    questions = []
    for source_question in sorted(
        payload["qa"], key=lambda item: int(item["question_number_exact"])
    ):
        section = sections[source_question["section_id"]]
        question_number = int(source_question["question_number_exact"])
        questions.append(
            {
                "questionNumber": question_number,
                "sourceQuestionId": source_question["id"],
                "bookNumber": section_book[section["id"]],
                "chapterNumber": section_chapter[section["id"]],
                "sourceSectionId": section["id"],
                "sourceSectionPath": section_path(
                    section,
                    sections,
                    next(
                        book["sourceSectionId"]
                        for book in books
                        if book["bookNumber"] == section_book[section["id"]]
                    ),
                ),
                "questionNumberExact": source_question["question_number_exact"],
                "question": source_question["question_text_exact"],
                "answer": normalize_english_body(
                    source_question["answer_text_exact"]
                ),
                "footnotes": [
                    block["text_exact"]
                    for block in footnote_map.get(source_question["id"], [])
                ],
                "verificationStatus": source_question["verification_status"],
                "reviewNotes": source_question["review_notes"],
                "printedPageStart": source_question["printed_page_start"],
                "printedPageEnd": source_question["printed_page_end"],
                "pdfPageStart": source_question["pdf_page_start"],
                "pdfPageEnd": source_question["pdf_page_end"],
                "sourceSpans": source_question["source_spans"],
            }
        )

    blocks = []
    for block in sorted(
        payload["content_blocks"],
        key=lambda item: (item["book_id"], item["sequence_in_book"]),
    ):
        related_question = (
            questions_by_id.get(block["related_qa_id"])
            if block["related_qa_id"]
            else None
        )
        block_book = (
            section_book.get(block["section_id"])
            if block["section_id"]
            else None
        )
        if block_book is None and related_question:
            block_book = section_book[related_question["section_id"]]
        blocks.append(
            {
                "sourceBlockId": block["id"],
                "sourceVolumeId": block["book_id"],
                "volumeNumber": volume_number(block["book_id"]),
                "bookNumber": block_book,
                "sourceSectionId": block["section_id"],
                "relatedSourceQuestionId": block["related_qa_id"],
                "relatedQuestionNumber": (
                    int(related_question["question_number_exact"])
                    if related_question
                    else None
                ),
                "blockType": block["block_type"],
                "text": block["text_exact"],
                "sequenceInBook": block["sequence_in_book"],
                "pdfPageStart": block["pdf_page_start"],
                "pdfPageEnd": block["pdf_page_end"],
            }
        )

    issues = []
    for issue in sorted(
        payload["extraction_issues"],
        key=lambda item: (item["book_id"], item["id"]),
    ):
        related = issue["related_record_id"] or ""
        issue_book = None
        if related.startswith("section_"):
            issue_book = section_book.get(related)
        elif related.startswith("qa_"):
            question = questions_by_id.get(related)
            if question:
                issue_book = section_book[question["section_id"]]
        issues.append(
            {
                "sourceIssueId": issue["id"],
                "sourceVolumeId": issue["book_id"],
                "volumeNumber": volume_number(issue["book_id"]),
                "bookNumber": issue_book,
                "relatedRecordId": issue["related_record_id"],
                "pdfPage": issue["pdf_page"],
                "issueType": issue["issue_type"],
                "description": issue["description"],
                "normalizationApplied": issue["normalization_applied"],
            }
        )

    return structure, questions, blocks, issues


def validate_catalogue(structure, questions, blocks, issues, payload) -> list[str]:
    errors = []
    books = structure.get("books", [])
    chapters = [chapter for book in books for chapter in book["chapters"]]
    sections = [section for section in payload["sections"] if section["section_type"] == "section"]

    if len(books) != EXPECTED_BOOKS:
        errors.append(f"expected {EXPECTED_BOOKS} books, found {len(books)}")
    if len(chapters) != EXPECTED_CHAPTERS:
        errors.append(f"expected {EXPECTED_CHAPTERS} chapters, found {len(chapters)}")
    if len(sections) != EXPECTED_INTERMEDIATE:
        errors.append(f"expected {EXPECTED_INTERMEDIATE} intermediate sections, found {len(sections)}")
    if len(questions) != EXPECTED_QUESTIONS:
        errors.append(f"expected {EXPECTED_QUESTIONS} questions, found {len(questions)}")
    if len(blocks) != EXPECTED_BLOCKS:
        errors.append(f"expected {EXPECTED_BLOCKS} content blocks, found {len(blocks)}")
    if len(issues) != EXPECTED_ISSUES:
        errors.append(f"expected {EXPECTED_ISSUES} issues, found {len(issues)}")

    numbers = [row["questionNumber"] for row in questions]
    if numbers != list(range(1, EXPECTED_QUESTIONS + 1)):
        errors.append("question numbers are not contiguous from 1")

    source_ids = [row["sourceQuestionId"] for row in questions]
    if len(source_ids) != len(set(source_ids)):
        errors.append("duplicate sourceQuestionId values")

    source_blocks = [row["sourceBlockId"] for row in blocks]
    if len(source_blocks) != len(set(source_blocks)):
        errors.append("duplicate sourceBlockId values")

    source_issues = [row["sourceIssueId"] for row in issues]
    if len(source_issues) != len(set(source_issues)):
        errors.append("duplicate sourceIssueId values")

    expected_questions = {
        question["id"]: question for question in payload["qa"]
    }
    expected_ordered = sorted(
        payload["qa"], key=lambda item: int(item["question_number_exact"])
    )
    if set(source_ids) != set(expected_questions):
        errors.append("source question IDs do not match the source")

    source_book_count = sum(
        1 for section in payload["sections"] if section["section_type"] == "book"
    )
    source_chapter_count = sum(
        1 for section in payload["sections"] if section["section_type"] == "chapter"
    )
    if source_book_count != EXPECTED_BOOKS:
        errors.append(
            f"source has {source_book_count} books, expected {EXPECTED_BOOKS}"
        )
    if source_chapter_count != EXPECTED_CHAPTERS:
        errors.append(
            f"source has {source_chapter_count} chapters, expected {EXPECTED_CHAPTERS}"
        )

    for generated, source in zip(questions, expected_ordered):
        if generated["sourceQuestionId"] != source["id"]:
            errors.append(f"question order changed at {source['id']}")
            continue
        if generated["question"] != source["question_text_exact"]:
            errors.append(f"question text changed for {source['id']}")
        if visible_characters(generated["answer"]) != visible_characters(
            source["answer_text_exact"]
        ):
            errors.append(f"answer characters changed for {source['id']}")
        if not generated["question"].strip() or not generated["answer"].strip():
            errors.append(f"empty text for {source['id']}")

    by_book = defaultdict(list)
    for row in questions:
        by_book[row["bookNumber"]].append(row)
    for book in books:
        rows = by_book[book["bookNumber"]]
        expected = book["questionRange"]
        if not rows or min(row["questionNumber"] for row in rows) != expected["start"] or max(row["questionNumber"] for row in rows) != expected["end"]:
            errors.append(f"book range mismatch for book {book['bookNumber']}")
        for chapter in book["chapters"]:
            chapter_rows = [
                row
                for row in rows
                if row["chapterNumber"] == chapter["chapterNumber"]
            ]
            expected_range = chapter["questionRange"]
            if (
                not chapter_rows
                or min(row["questionNumber"] for row in chapter_rows) != expected_range["start"]
                or max(row["questionNumber"] for row in chapter_rows) != expected_range["end"]
                or len(chapter_rows) != chapter["totalQuestions"]
            ):
                errors.append(
                    f"chapter range mismatch for {book['bookNumber']}/{chapter['chapterNumber']}"
                )

    block_types = Counter(block["blockType"] for block in blocks)
    expected_block_types = {
        "front_matter": 10,
        "section_introduction": 25,
        "footnote": EXPECTED_FOOTNOTES,
        "back_matter": 99,
    }
    if block_types != Counter(expected_block_types):
        errors.append(f"unexpected content block types: {dict(block_types)}")

    footnotes = [block for block in blocks if block["blockType"] == "footnote"]
    if len(footnotes) != EXPECTED_FOOTNOTES:
        errors.append(f"expected {EXPECTED_FOOTNOTES} footnotes, found {len(footnotes)}")
    linked = [block for block in footnotes if block["relatedSourceQuestionId"]]
    if len(linked) != EXPECTED_LINKED_FOOTNOTES:
        errors.append(f"expected {EXPECTED_LINKED_FOOTNOTES} linked footnotes, found {len(linked)}")

    for block in linked:
        if block["relatedSourceQuestionId"] not in expected_questions:
            errors.append(f"footnote {block['sourceBlockId']} has an unknown question")

    return errors


def run(source_dir: Path, check: bool) -> int:
    source_file = source_dir / "catechism_extraction.json"
    payload = load_source(source_file)

    for name, expected in EXPECTED_HASHES.items():
        path = source_dir / name
        if not path.exists():
            if name == "catechism_extraction.json":
                print(f"ERROR: missing {path}", file=sys.stderr)
                return 1
            continue
        if sha256(path) != expected:
            print(f"ERROR: hash mismatch for {path}", file=sys.stderr)
            return 1

    structure, questions, blocks, issues = build_catalogue(payload)
    errors = validate_catalogue(structure, questions, blocks, issues, payload)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1

    artifacts = [
        (STRUCTURE_FILE, structure),
        (QUESTION_FILE, questions),
        (BLOCK_FILE, blocks),
        (ISSUE_FILE, issues),
    ]

    if check:
        stale = False
        for path, expected in artifacts:
            if not path.exists():
                print(f"ERROR: missing {path}; run syncEnglishSource.py", file=sys.stderr)
                stale = True
                continue
            if load_source(path) != expected:
                print(f"ERROR: {path} is stale; run syncEnglishSource.py", file=sys.stderr)
                stale = True
        return 1 if stale else 0

    for path, expected in artifacts:
        write_json(path, expected)
    print(
        f"English source synced: {len(structure['books'])} books, "
        f"{sum(len(book['chapters']) for book in structure['books'])} chapters, "
        f"{len(questions)} questions, {len(blocks)} content blocks, "
        f"{len(issues)} issues"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR_DEFAULT)
    args = parser.parse_args()
    return run(args.source_dir, args.check)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Generate the artifacts**

Run: `python3 backend/src/seeds/syncEnglishSource.py`

Expected: writes four JSON files and prints counts `7 books, 84 chapters, 1452 questions, 1401 content blocks, 61 issues`.

- [ ] **Step 5: Verify generation is deterministic**

Run: `python3 backend/src/seeds/syncEnglishSource.py --check`

Expected: exit 0 with no output.

- [ ] **Step 6: Run the Python tests**

Run: `python3 backend/test/test_english_source.py -v`

Expected: PASS, or source tests skipped when the external source is absent.

- [ ] **Step 7: Run the full suite**

Run: `npm --prefix backend test`

Expected: PASS.

---

### Task 3: Add English Models and Validated Seed Module

**Files:**
- Modify: `backend/src/models/Book.js`
- Modify: `backend/src/models/Chapter.js`
- Modify: `backend/src/models/Question.js`
- Create: `backend/src/models/EnglishContentBlock.js`
- Create: `backend/src/models/EnglishExtractionIssue.js`
- Modify: `backend/src/models/index.js`
- Create: `backend/src/seeds/seedEnglish.js`
- Create: `backend/test/services/englishSeed.test.js`

**Interfaces:**
- Consumes: `english_structure.json`, `catechism_qa.json`, `english_content_blocks.json`, `english_extraction_issues.json`.
- Produces: `seedEnglish.validateEnglishSeed(structure, questions, blocks, issues) -> string[]`
- Produces: `seedEnglish.seedEnglishContent({ dryRun = false }) -> Promise<{ books, chapters, questions, contentBlocks, issues }>`
- Produces model exports `EnglishContentBlock` and `EnglishExtractionIssue`.

- [ ] **Step 1: Write the failing seed test**

Create `backend/test/services/englishSeed.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEnglishSeed,
  seedEnglishContent
} = require('../../src/seeds/seedEnglish');

const structure = require('../../data/english_structure.json');
const questions = require('../../data/catechism_qa.json');
const blocks = require('../../data/english_content_blocks.json');
const issues = require('../../data/english_extraction_issues.json');

test('validateEnglishSeed accepts the generated datasets', () => {
  assert.deepEqual(
    validateEnglishSeed(structure, questions, blocks, issues),
    []
  );
});

test('validateEnglishSeed rejects a non-contiguous question number', () => {
  const broken = questions.map((row) => ({ ...row }));
  broken[1].questionNumber = 99;
  const errors = validateEnglishSeed(structure, broken, blocks, issues);
  assert.match(errors.join('\n'), /contiguous/);
});

test('validateEnglishSeed rejects unknown block question links', () => {
  const broken = blocks.map((row) => ({ ...row }));
  broken[0] = {
    ...broken[0],
    relatedSourceQuestionId: 'qa_missing',
    relatedQuestionNumber: 9999
  };
  const errors = validateEnglishSeed(structure, questions, broken, issues);
  assert.match(errors.join('\n'), /unknown related question/i);
});

test('dry run reports target counts without touching MongoDB', async () => {
  const result = await seedEnglishContent({ dryRun: true });
  assert.deepEqual(result, {
    books: 7,
    chapters: 84,
    questions: 1452,
    contentBlocks: 1401,
    issues: 61
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test backend/test/services/englishSeed.test.js`

Expected: FAIL with `Cannot find module '../../src/seeds/seedEnglish'`.

- [ ] **Step 3: Update the models**

Modify `backend/src/models/Book.js` by adding these fields inside `bookSchema` after `volume`:

```js
  sourceVolumeId: {
    type: String,
    trim: true
  },
  sourceHeadingExact: {
    type: String
  },
  publicationDetailsExact: {
    type: String
  },
  pdfPageCount: {
    type: Number
  },
  sourcePageRange: {
    start: { type: Number },
    end: { type: Number }
  },
```

Modify `backend/src/models/Chapter.js` before `chapterSchema`:

```js
const subsectionSchema = new mongoose.Schema({
  sourceSectionId: { type: String, required: true },
  parentSourceSectionId: { type: String },
  sourceHeadingExact: { type: String, required: true },
  title: { type: String, required: true },
  sequenceInBook: { type: Number, required: true },
  questionRange: {
    start: { type: Number },
    end: { type: Number }
  },
  totalQuestions: { type: Number, default: 0 },
  printedPageStart: { type: Number },
  printedPageEnd: { type: Number },
  pdfPageStart: { type: Number },
  pdfPageEnd: { type: Number },
  children: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false });
```

Add these fields inside `chapterSchema` after `subtitle`:

```js
  sourceSectionId: {
    type: String,
    trim: true
  },
  sourceHeadingExact: {
    type: String
  },
  printedPageStart: {
    type: Number
  },
  printedPageEnd: {
    type: Number
  },
  pdfPageStart: {
    type: Number
  },
  pdfPageEnd: {
    type: Number
  },
  subsections: {
    type: [subsectionSchema],
    default: []
  },
```

Add an index after the existing `chapterSchema.index` calls:

```js
chapterSchema.index({ sourceSectionId: 1 }, { unique: true, sparse: true });
```

Modify `backend/src/models/Question.js` by adding these schemas before `questionSchema`:

```js
const questionSectionSchema = new mongoose.Schema({
  sourceSectionId: { type: String, required: true },
  title: { type: String, required: true }
}, { _id: false });

const sourceSpanSchema = new mongoose.Schema({
  pdfPage: { type: Number, required: true },
  printedPage: { type: String }
}, { _id: false });
```

Then add these fields after `chapterTitle`:

```js
  sourceQuestionId: {
    type: String,
    trim: true
  },
  sourceSectionId: {
    type: String,
    trim: true
  },
  sourceSectionPath: {
    type: [questionSectionSchema],
    default: []
  },
  questionNumberExact: {
    type: String
  },
  verificationStatus: {
    type: String,
    enum: ['verified', 'needs_review'],
    default: 'verified'
  },
  reviewNotes: {
    type: String
  },
  printedPageStart: {
    type: String
  },
  printedPageEnd: {
    type: String
  },
  pdfPageStart: {
    type: Number
  },
  pdfPageEnd: {
    type: Number
  },
  sourceSpans: {
    type: [sourceSpanSchema],
    default: []
  },
```

Add indexes near the existing question indexes:

```js
questionSchema.index({ sourceQuestionId: 1 }, { unique: true, sparse: true });
questionSchema.index({ sourceSectionId: 1 });
```

Create `backend/src/models/EnglishContentBlock.js`:

```js
const mongoose = require('mongoose');

const englishContentBlockSchema = new mongoose.Schema({
  sourceBlockId: { type: String, required: true, unique: true },
  sourceVolumeId: { type: String, required: true },
  volumeNumber: { type: Number, required: true, enum: [1, 2] },
  bookNumber: { type: Number, min: 1, max: 7, default: null },
  sourceSectionId: { type: String, default: null },
  relatedSourceQuestionId: { type: String, default: null },
  relatedQuestionNumber: { type: Number, default: null },
  blockType: {
    type: String,
    required: true,
    enum: ['front_matter', 'section_introduction', 'footnote', 'back_matter']
  },
  text: { type: String, required: true },
  sequenceInBook: { type: Number, required: true },
  pdfPageStart: { type: Number, required: true },
  pdfPageEnd: { type: Number, required: true }
}, { timestamps: true });

englishContentBlockSchema.index({
  bookNumber: 1,
  blockType: 1,
  sequenceInBook: 1
});
englishContentBlockSchema.index({
  sourceVolumeId: 1,
  blockType: 1,
  sequenceInBook: 1
});
englishContentBlockSchema.index({ relatedQuestionNumber: 1 });

module.exports = mongoose.model('EnglishContentBlock', englishContentBlockSchema);
```

Create `backend/src/models/EnglishExtractionIssue.js`:

```js
const mongoose = require('mongoose');

const englishExtractionIssueSchema = new mongoose.Schema({
  sourceIssueId: { type: String, required: true, unique: true },
  sourceVolumeId: { type: String, required: true },
  volumeNumber: { type: Number, required: true, enum: [1, 2] },
  bookNumber: { type: Number, min: 1, max: 7, default: null },
  relatedRecordId: { type: String, default: null },
  pdfPage: { type: Number, default: null },
  issueType: { type: String, required: true },
  description: { type: String, required: true },
  normalizationApplied: { type: String, default: null }
}, { timestamps: true });

englishExtractionIssueSchema.index({ bookNumber: 1, issueType: 1 });
englishExtractionIssueSchema.index({ sourceVolumeId: 1, issueType: 1 });

module.exports = mongoose.model('EnglishExtractionIssue', englishExtractionIssueSchema);
```

Modify `backend/src/models/index.js`:

```js
const EnglishContentBlock = require('./EnglishContentBlock');
const EnglishExtractionIssue = require('./EnglishExtractionIssue');

module.exports = {
  Book,
  Chapter,
  Question,
  BookAr,
  ChapterAr,
  QuestionAr,
  EnglishContentBlock,
  EnglishExtractionIssue,
  User
};
```

- [ ] **Step 4: Implement the validated seed module**

Create `backend/src/seeds/seedEnglish.js`:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../../config/db');
const {
  Book,
  Chapter,
  Question,
  EnglishContentBlock,
  EnglishExtractionIssue
} = require('../models');

const DATA_DIR = path.join(__dirname, '../../data');
const STRUCTURE_FILE = path.join(DATA_DIR, 'english_structure.json');
const QUESTION_FILE = path.join(DATA_DIR, 'catechism_qa.json');
const BLOCK_FILE = path.join(DATA_DIR, 'english_content_blocks.json');
const ISSUE_FILE = path.join(DATA_DIR, 'english_extraction_issues.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateEnglishSeed(structure, questions, blocks, issues) {
  const errors = [];
  const books = structure.books || [];
  const chapters = books.flatMap((book) => book.chapters || []);

  if (books.length !== 7) errors.push(`expected 7 books, found ${books.length}`);
  if (chapters.length !== 84) errors.push(`expected 84 chapters, found ${chapters.length}`);
  if (questions.length !== 1452) errors.push(`expected 1452 questions, found ${questions.length}`);
  if (blocks.length !== 1401) errors.push(`expected 1401 content blocks, found ${blocks.length}`);
  if (issues.length !== 61) errors.push(`expected 61 issues, found ${issues.length}`);

  const numbers = questions.map((row) => row.questionNumber);
  if (numbers.some((number, index) => number !== index + 1)) {
    errors.push('question numbers are not contiguous from 1');
  }

  const sourceQuestionIds = new Set(questions.map((row) => row.sourceQuestionId));
  if (sourceQuestionIds.size !== questions.length) {
    errors.push('duplicate sourceQuestionId values');
  }

  const chapterKeys = new Set();
  for (const book of books) {
    for (const chapter of book.chapters || []) {
      chapterKeys.add(`${book.bookNumber}-${chapter.chapterNumber}`);
      if (!chapter.title || !chapter.title.trim()) {
        errors.push(`chapter ${book.bookNumber}/${chapter.chapterNumber} has no title`);
      }
      if (!chapter.questionRange || chapter.questionRange.start === null) {
        errors.push(`chapter ${book.bookNumber}/${chapter.chapterNumber} has no questions`);
      }
    }
  }

  for (const row of questions) {
    if (!row.question || !row.question.trim()) {
      errors.push(`question ${row.questionNumber} has no text`);
    }
    if (!row.answer || !row.answer.trim()) {
      errors.push(`question ${row.questionNumber} has no answer`);
    }
    if (!chapterKeys.has(`${row.bookNumber}-${row.chapterNumber}`)) {
      errors.push(`question ${row.questionNumber} has no chapter`);
    }
  }

  for (const block of blocks) {
    if (block.bookNumber !== null && (block.bookNumber < 1 || block.bookNumber > 7)) {
      errors.push(`content block ${block.sourceBlockId} has an invalid bookNumber`);
    }
    if (block.relatedSourceQuestionId && !sourceQuestionIds.has(block.relatedSourceQuestionId)) {
      errors.push(`content block ${block.sourceBlockId} has an unknown related question`);
    }
    if (block.relatedQuestionNumber !== null && !numbers.includes(block.relatedQuestionNumber)) {
      errors.push(`content block ${block.sourceBlockId} has an unknown related question`);
    }
  }

  return errors;
}

function loadArtifacts() {
  return {
    structure: loadJson(STRUCTURE_FILE),
    questions: loadJson(QUESTION_FILE),
    blocks: loadJson(BLOCK_FILE),
    issues: loadJson(ISSUE_FILE)
  };
}

async function seedEnglishContent({ dryRun = false } = {}) {
  const { structure, questions, blocks, issues } = loadArtifacts();
  const errors = validateEnglishSeed(structure, questions, blocks, issues);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const target = {
    books: structure.books.length,
    chapters: structure.books.reduce((total, book) => total + book.chapters.length, 0),
    questions: questions.length,
    contentBlocks: blocks.length,
    issues: issues.length
  };

  if (dryRun) return target;

  await EnglishExtractionIssue.deleteMany({});
  await EnglishContentBlock.deleteMany({});
  await Question.deleteMany({});
  await Chapter.deleteMany({});
  await Book.deleteMany({});

  const bookDocs = new Map();
  for (const bookData of structure.books) {
    const book = await Book.create({
      bookNumber: bookData.bookNumber,
      title: bookData.title,
      volume: bookData.volume,
      sourceVolumeId: bookData.sourceVolumeId,
      sourceHeadingExact: bookData.sourceHeadingExact,
      publicationDetailsExact: structure.volumes.find(
        (volume) => volume.sourceVolumeId === bookData.sourceVolumeId
      )?.publicationDetailsExact,
      pdfPageCount: structure.volumes.find(
        (volume) => volume.sourceVolumeId === bookData.sourceVolumeId
      )?.pdfPageCount,
      sourcePageRange: bookData.sourcePageRange,
      description: bookData.description,
      questionRange: bookData.questionRange,
      totalQuestions: bookData.totalQuestions
    });
    bookDocs.set(bookData.bookNumber, book);
  }

  const chapterDocs = new Map();
  for (const bookData of structure.books) {
    const book = bookDocs.get(bookData.bookNumber);
    for (const chapterData of bookData.chapters) {
      const chapter = await Chapter.create({
        book: book._id,
        bookNumber: bookData.bookNumber,
        chapterNumber: chapterData.chapterNumber,
        sourceSectionId: chapterData.sourceSectionId,
        sourceHeadingExact: chapterData.sourceHeadingExact,
        title: chapterData.title,
        questionRange: chapterData.questionRange,
        totalQuestions: chapterData.totalQuestions,
        sortOrder: chapterData.sortOrder,
        printedPageStart: chapterData.printedPageStart,
        printedPageEnd: chapterData.printedPageEnd,
        pdfPageStart: chapterData.pdfPageStart,
        pdfPageEnd: chapterData.pdfPageEnd,
        subsections: chapterData.subsections || []
      });
      chapterDocs.set(
        `${bookData.bookNumber}-${chapterData.chapterNumber}`,
        chapter
      );
    }
  }

  const questionDocs = questions.map((row) => {
    const book = bookDocs.get(row.bookNumber);
    const chapter = chapterDocs.get(`${row.bookNumber}-${row.chapterNumber}`);
    if (!book || !chapter) {
      throw new Error(`question ${row.questionNumber} has no book or chapter`);
    }
    return {
      questionNumber: row.questionNumber,
      sourceQuestionId: row.sourceQuestionId,
      sourceSectionId: row.sourceSectionId,
      sourceSectionPath: row.sourceSectionPath,
      questionNumberExact: row.questionNumberExact,
      question: row.question,
      answer: row.answer,
      book: book._id,
      chapter: chapter._id,
      bookNumber: row.bookNumber,
      chapterTitle: chapter.title,
      footnotes: row.footnotes || [],
      verificationStatus: row.verificationStatus,
      reviewNotes: row.reviewNotes,
      printedPageStart: row.printedPageStart,
      printedPageEnd: row.printedPageEnd,
      pdfPageStart: row.pdfPageStart,
      pdfPageEnd: row.pdfPageEnd,
      sourceSpans: (row.sourceSpans || []).map((span) => ({
        pdfPage: span.pdf_page,
        printedPage: span.printed_page
      })),
      scriptureReferences: [],
      patristicQuotes: [],
      tags: []
    };
  });

  await Question.insertMany(questionDocs);
  await EnglishContentBlock.insertMany(blocks);
  await EnglishExtractionIssue.insertMany(issues);

  return target;
}

async function main() {
  await connectDB();
  console.log('Connected to MongoDB. Seeding English content...\n');
  const result = await seedEnglishContent();
  console.log(
    `Created ${result.books} books, ${result.chapters} chapters, ` +
    `${result.questions} questions, ${result.contentBlocks} content blocks, ` +
    `${result.issues} issues.`
  );
  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('English seed failed:', error.message);
    process.exit(1);
  });
}

module.exports = { seedEnglishContent, validateEnglishSeed };
```

- [ ] **Step 5: Run the seed test to verify it passes**

Run: `node --test backend/test/services/englishSeed.test.js`

Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm --prefix backend test`

Expected: PASS.

---

### Task 4: Add Dry-Run Migration and Update Seed Entry Points

**Files:**
- Create: `backend/src/seeds/migrateEnglishSource.js`
- Modify: `backend/src/seeds/seedDatabase.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `seedEnglish.seedEnglishContent`.
- Produces: `npm run seed` rebuilds English from committed artifacts.
- Produces: `npm run seed:english:migrate` reports current vs target counts; `--apply` performs the replacement.
- Produces: `npm run sync:english` and `npm run sync:english:check`.

- [ ] **Step 1: Add the migration script**

Create `backend/src/seeds/migrateEnglishSource.js`:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const {
  Book,
  Chapter,
  Question,
  EnglishContentBlock,
  EnglishExtractionIssue
} = require('../models');
const { seedEnglishContent } = require('./seedEnglish');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const [books, chapters, questions, contentBlocks, issues] =
    await Promise.all([
      Book.countDocuments(),
      Chapter.countDocuments(),
      Question.countDocuments(),
      EnglishContentBlock.countDocuments(),
      EnglishExtractionIssue.countDocuments()
    ]);

  console.log('English migration');
  console.log(
    `  current:  ${books} books, ${chapters} chapters, ${questions} questions, ` +
    `${contentBlocks} content blocks, ${issues} issues`
  );

  const target = await seedEnglishContent({ dryRun: true });
  console.log(
    `  target:   ${target.books} books, ${target.chapters} chapters, ` +
    `${target.questions} questions, ${target.contentBlocks} content blocks, ` +
    `${target.issues} issues`
  );

  if (!apply) {
    console.log(
      '\nDry run only. Re-run with --apply to replace the English catalogue.'
    );
    await mongoose.connection.close();
    return;
  }

  await seedEnglishContent();
  console.log('\nEnglish catalogue replaced.');
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error('English migration failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
```

- [ ] **Step 2: Replace the old seed entry point**

Replace `backend/src/seeds/seedDatabase.js` with:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { seedEnglishContent } = require('./seedEnglish');

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB. Starting English seed...\n');

  const result = await seedEnglishContent();
  console.log('Seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Books:         ${result.books}`);
  console.log(`  Chapters:      ${result.chapters}`);
  console.log(`  Questions:     ${result.questions}`);
  console.log(`  Content blocks:${result.contentBlocks}`);
  console.log(`  Issues:        ${result.issues}`);
  console.log('─────────────────────────────────────');

  await mongoose.connection.close();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
```

- [ ] **Step 3: Update package scripts**

Modify `backend/package.json` scripts to:

```json
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "seed": "node src/seeds/seedDatabase.js",
    "seed:english:migrate": "node src/seeds/migrateEnglishSource.js",
    "seed:arabic": "node src/seeds/seedArabic.js",
    "sync:english": "python3 src/seeds/syncEnglishSource.py",
    "sync:english:check": "python3 src/seeds/syncEnglishSource.py --check",
    "format:data": "python3 src/seeds/formatDatasets.py",
    "format:data:check": "python3 src/seeds/formatDatasets.py --check",
    "format:mongo": "node src/seeds/refreshFormatting.js",
    "test": "node --test && python3 -m unittest discover -s test -p 'test_*.py'"
  },
```

- [ ] **Step 4: Verify no JavaScript references the stale structure as an English source**

Run: `grep -R "structureData" -n backend/src backend/test`

Expected: no result from `seedDatabase.js`; only historical formatting references may remain. If `seedDatabase.js` still references it, fix the import.

- [ ] **Step 5: Run the suite**

Run: `npm --prefix backend test`

Expected: PASS.

---

### Task 5: Add the Read-Only Book Content API

**Files:**
- Create: `backend/src/services/bookContent.js`
- Create: `backend/test/services/bookContent.test.js`
- Modify: `backend/src/controllers/bookController.js`
- Modify: `backend/src/routes/api.js`

**Interfaces:**
- Produces: `bookContent.groupBookContent({ blocks, issues, bookNumber, volumeNumber, type }) -> { frontMatter, introductions, footnotes, backMatter, issues }`
- Produces: `GET /api/books/:bookNumber/content`
- Consumes: `EnglishContentBlock`, `EnglishExtractionIssue`, `Book`.

- [ ] **Step 1: Write the failing service test**

Create `backend/test/services/bookContent.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBookContent } = require('../../src/services/bookContent');

const blocks = [
  { sourceBlockId: 'front', blockType: 'front_matter', bookNumber: null, volumeNumber: 1, sequenceInBook: 1 },
  { sourceBlockId: 'intro', blockType: 'section_introduction', bookNumber: 3, volumeNumber: 1, sequenceInBook: 2 },
  { sourceBlockId: 'note', blockType: 'footnote', bookNumber: 3, volumeNumber: 1, sequenceInBook: 3, relatedQuestionNumber: 675 },
  { sourceBlockId: 'back', blockType: 'back_matter', bookNumber: null, volumeNumber: 1, sequenceInBook: 4 },
  { sourceBlockId: 'other-book', blockType: 'section_introduction', bookNumber: 4, volumeNumber: 2, sequenceInBook: 5 },
  { sourceBlockId: 'other-volume', blockType: 'front_matter', bookNumber: null, volumeNumber: 2, sequenceInBook: 6 }
];
const issues = [
  { sourceIssueId: 'issue-book', bookNumber: 3, volumeNumber: 1, pdfPage: 10 },
  { sourceIssueId: 'issue-volume', bookNumber: null, volumeNumber: 1, pdfPage: 5 },
  { sourceIssueId: 'issue-other', bookNumber: null, volumeNumber: 2, pdfPage: 5 }
];

test('groups book and volume content for a logical book', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1
  });
  assert.deepEqual(result.frontMatter.map((row) => row.sourceBlockId), ['front']);
  assert.deepEqual(result.introductions.map((row) => row.sourceBlockId), ['intro']);
  assert.deepEqual(result.footnotes.map((row) => row.sourceBlockId), ['note']);
  assert.deepEqual(result.backMatter.map((row) => row.sourceBlockId), ['back']);
  assert.deepEqual(result.issues.map((row) => row.sourceIssueId), ['issue-volume', 'issue-book']);
});

test('filters content by type', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1,
    type: 'footnote'
  });
  assert.deepEqual(result.footnotes.map((row) => row.sourceBlockId), ['note']);
  assert.deepEqual(result.introductions, []);
  assert.deepEqual(result.issues, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test backend/test/services/bookContent.test.js`

Expected: FAIL with `Cannot find module '../../src/services/bookContent'`.

- [ ] **Step 3: Implement the pure grouping service**

Create `backend/src/services/bookContent.js`:

```js
const BLOCK_GROUPS = {
  front_matter: 'frontMatter',
  section_introduction: 'introductions',
  footnote: 'footnotes',
  back_matter: 'backMatter'
};

function groupBookContent({
  blocks = [],
  issues = [],
  bookNumber,
  volumeNumber,
  type
}) {
  const groups = {
    frontMatter: [],
    introductions: [],
    footnotes: [],
    backMatter: [],
    issues: []
  };

  const inScope = (row) =>
    row.bookNumber === bookNumber ||
    ((row.bookNumber === null || row.bookNumber === undefined) &&
      row.volumeNumber === volumeNumber);

  for (const block of blocks) {
    if (!inScope(block)) continue;
    if (type === 'issues') continue;
    if (type && type !== block.blockType) continue;
    const group = BLOCK_GROUPS[block.blockType];
    if (group) groups[group].push(block);
  }

  for (const issue of issues) {
    if (!inScope(issue)) continue;
    if (type && type !== 'issues') continue;
    groups.issues.push(issue);
  }

  const sortBySequence = (a, b) =>
    (a.sequenceInBook ?? 0) - (b.sequenceInBook ?? 0) ||
    (a.pdfPage ?? a.pdfPageStart ?? 0) - (b.pdfPage ?? b.pdfPageStart ?? 0);

  groups.frontMatter.sort(sortBySequence);
  groups.introductions.sort(sortBySequence);
  groups.footnotes.sort(sortBySequence);
  groups.backMatter.sort(sortBySequence);
  groups.issues.sort((a, b) => (a.pdfPage ?? 0) - (b.pdfPage ?? 0));

  return groups;
}

module.exports = { groupBookContent };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test backend/test/services/bookContent.test.js`

Expected: PASS.

- [ ] **Step 5: Add the controller and route**

Modify `backend/src/controllers/bookController.js` imports:

```js
const { catalogueFor } = require('../services/catalogue');
const { Book, EnglishContentBlock, EnglishExtractionIssue } = require('../models');
const { groupBookContent } = require('../services/bookContent');
```

Add this handler after `getChapter`:

```js
// GET /api/books/:bookNumber/content - Read-only English companion content
exports.getBookContent = async (req, res) => {
  try {
    const book = await Book.findOne({
      bookNumber: parseInt(req.params.bookNumber)
    }).lean();

    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }

    const scope = {
      $or: [
        { bookNumber: book.bookNumber },
        { bookNumber: null, volumeNumber: book.volume }
      ]
    };

    const [blocks, issues] = await Promise.all([
      EnglishContentBlock.find(scope).sort({ sequenceInBook: 1 }).lean(),
      EnglishExtractionIssue.find(scope).sort({ pdfPage: 1 }).lean()
    ]);

    const grouped = groupBookContent({
      blocks,
      issues,
      bookNumber: book.bookNumber,
      volumeNumber: book.volume,
      type: req.query.type
    });

    res.json({
      success: true,
      data: {
        book: {
          bookNumber: book.bookNumber,
          title: book.title,
          volume: book.volume
        },
        ...grouped
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

Modify `backend/src/routes/api.js` after the existing book routes:

```js
router.get('/books/:bookNumber/content', bookController.getBookContent);
```

- [ ] **Step 6: Run the API service test and full suite**

Run: `node --test backend/test/services/bookContent.test.js && npm --prefix backend test`

Expected: PASS.

---

### Task 6: Retire Legacy English Commands and Update Documentation

**Files:**
- Modify: `backend/src/seeds/formatDatasets.py`
- Modify: `README.md`
- Verify: `backend/src/seeds/structureData.js` is no longer imported by runtime seed/generator code.

**Interfaces:**
- Produces: `npm run format:data` and `npm run format:data:check` affect Arabic only.
- Produces: documented commands:
  - `npm run sync:english`
  - `npm run sync:english:check`
  - `npm run seed`
  - `npm run seed:english:migrate`
  - `npm run seed:arabic`

- [ ] **Step 1: Make the formatter Arabic-only**

Replace the top-level target selection in `backend/src/seeds/formatDatasets.py`:

```python
    targets = [("Arabic", ARABIC, format_arabic_dataset)]
```

Remove the `--english-only` and `--arabic-only` options from the parser and update the docstring to:

```python
"""Apply the shared whitespace formatter to the Arabic JSON dataset.

English is generated by syncEnglishSource.py; do not reformat it here.

Usage:
    python3 backend/src/seeds/formatDatasets.py --check
    python3 backend/src/seeds/formatDatasets.py
"""
```

Remove the unused `format_english_dataset` import and `ENGLISH` constant.

- [ ] **Step 2: Verify Arabic formatting still passes**

Run: `python3 backend/src/seeds/formatDatasets.py --check`

Expected: `Arabic: already formatted (1424 records)` and `Datasets are up to date`.

- [ ] **Step 3: Update the README**

Replace the English extraction/seed instructions with:

````markdown
## English source

The English catalogue is generated from the verified extraction source:

```bash
export ENGLISH_SOURCE_DIR="/path/to/catechism_extraction"
npm --prefix backend run sync:english
npm --prefix backend run sync:english:check
```

The generator writes `backend/data/english_structure.json`,
`backend/data/catechism_qa.json`,
`backend/data/english_content_blocks.json`, and
`backend/data/english_extraction_issues.json`. It validates source hashes,
hierarchy, counts, exact question text, and whitespace-only answer
normalization. Do not run the legacy English extraction scripts against these
artifacts.

Seed or migrate English only:

```bash
npm --prefix backend run seed
npm --prefix backend run seed:english:migrate          # dry run
npm --prefix backend run seed:english:migrate -- --apply
```

The migration is dry-run by default and never touches Arabic collections.
````

Keep the existing Arabic source/seed documentation unchanged.

- [ ] **Step 4: Verify no runtime import uses the stale structure**

Run: `grep -R "structureData" -n backend/src backend/test`

Expected: only `backend/src/seeds/formatting.py` may reference it for legacy title matching. `seedDatabase.js` must not.

- [ ] **Step 5: Run final verification**

Run each:

```bash
npm --prefix backend test
python3 backend/src/seeds/syncEnglishSource.py --check
python3 backend/src/seeds/syncArabicSource.py --check
python3 backend/src/seeds/formatDatasets.py --check
```

Expected:

- Node and Python tests pass.
- English `--check` exits 0.
- Arabic `--check` exits 0 with `7 books, 83 sections, 1424 questions, 61 images`.
- Arabic formatting check reports `1424 records` and `Datasets are up to date`.

- [ ] **Step 6: Inspect the final diff**

Run: `git status --short && git diff --stat`

Expected: English data/model/seed/API/test/docs changes plus the new spec and plan. No Arabic dataset changes, no commit.

---

## Self-Review

**Spec coverage:**

- 7 books, 84 chapters, 1,452 questions: Tasks 2 and 3.
- Correct ranges and nested subsections: Task 2.
- Source hashes and provenance: Task 2.
- Whitespace-only normalization: Task 1.
- Content blocks, issues, linked footnotes: Tasks 2 and 3.
- New models and seed: Task 3.
- Dry-run migration and English-only scope: Task 4.
- Read-only content API: Task 5.
- Legacy script retirement and docs: Task 6.
- Arabic unchanged and final verification: Task 6.

**Placeholder scan:** No TBD, TODO, or unspecified implementation steps. Every code task includes the actual code to add.

**Type consistency:**

- `normalize_english_body` is defined in Task 1 and consumed in Task 2.
- `validateEnglishSeed` and `seedEnglishContent` are defined in Task 3 and consumed in Task 4.
- `groupBookContent` is defined in Task 5 and consumed by the controller in the same task.
- Model exports match the imports used by the seed and controller.
- Artifact field names match between generator, seed, and API.
