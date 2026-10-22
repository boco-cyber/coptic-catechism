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
                "chapters": chapters,
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
