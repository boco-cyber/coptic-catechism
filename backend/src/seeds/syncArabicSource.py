#!/usr/bin/env python3
"""Build the Arabic catechism datasets from the Youth-Catechism-QA source.

The source's all_data.json array order is authoritative. SQLite question IDs
are arbitrary and must not be used for ordering.

Usage:
    python3 backend/src/seeds/syncArabicSource.py
    python3 backend/src/seeds/syncArabicSource.py --check
    python3 backend/src/seeds/syncArabicSource.py --skip-images
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parents[1] / "data"
PUBLIC_DIR = HERE.parents[1] / "public"
STRUCTURE_FILE = DATA_DIR / "arabic_structure.json"
QUESTION_FILE = DATA_DIR / "catechism_qa_ar.json"
IMAGE_DIR = PUBLIC_DIR / "images" / "questions"

SOURCE_DIR_DEFAULT = Path(
    os.environ.get("ARABIC_SOURCE_DIR", "/home/gergo/Downloads/Youth-Catechism-QA")
)
SOURCE_FILE_DEFAULT = SOURCE_DIR_DEFAULT / "all_data.json"

EXCLUDED_BOOK_IDS = {19}
EXPECTED_BOOKS = 7
EXPECTED_SECTIONS = 83
EXPECTED_QUESTIONS = 1424
EXPECTED_IMAGES = 61


def load_source(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload["fetchNewData"]


def _image_extension(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"} else ".jpg"


def build_catalogue(source_books: list[dict]) -> tuple[dict, list[dict]]:
    structure = {
        "source": "Youth-Catechism-QA/all_data.json",
        "books": [],
    }
    questions: list[dict] = []
    question_number = 0

    for source_book in source_books:
        source_book_id = int(source_book["id"])
        if source_book_id in EXCLUDED_BOOK_IDS:
            continue

        book_record = {
            "bookNumber": source_book_id,
            "sourceBookId": source_book_id,
            "title": source_book["name"],
            "slug": source_book.get("slug", ""),
            "questionRange": {"start": question_number + 1, "end": question_number},
            "totalQuestions": 0,
            "sections": [],
        }

        for chapter_number, source_section in enumerate(source_book.get("sections", []), start=1):
            source_section_id = int(source_section["id"])
            section_start = question_number + 1
            section_questions = source_section.get("questions", [])

            section_record = {
                "chapterNumber": chapter_number,
                "sourceSectionId": source_section_id,
                "title": source_section["name"],
                "slug": source_section.get("slug", ""),
                "sortOrder": chapter_number,
                "questionRange": {"start": section_start, "end": question_number},
                "totalQuestions": len(section_questions),
            }

            for source_question in section_questions:
                question_number += 1
                source_question_id = int(source_question["id"])
                source_image = source_question.get("image")
                questions.append(
                    {
                        "questionNumber": question_number,
                        "sourceQuestionId": source_question_id,
                        "bookNumber": source_book_id,
                        "chapterNumber": chapter_number,
                        "question": source_question["title"],
                        "answer": source_question.get("response") or "",
                        "image": None,
                        "_sourceImageUrl": source_image or None,
                    }
                )

            section_record["questionRange"]["end"] = question_number
            book_record["sections"].append(section_record)

        book_record["questionRange"]["end"] = question_number
        book_record["totalQuestions"] = (
            book_record["questionRange"]["end"] - book_record["questionRange"]["start"] + 1
        )
        structure["books"].append(book_record)

    return structure, questions


def validate_catalogue(
    structure: dict,
    questions: list[dict],
    source_books: list[dict],
    *,
    check_images: bool = True,
) -> list[str]:
    errors: list[str] = []
    books = structure.get("books", [])
    sections = [section for book in books for section in book.get("sections", [])]

    if len(books) != EXPECTED_BOOKS:
        errors.append(f"expected {EXPECTED_BOOKS} books, found {len(books)}")
    if len(sections) != EXPECTED_SECTIONS:
        errors.append(f"expected {EXPECTED_SECTIONS} sections, found {len(sections)}")
    if len(questions) != EXPECTED_QUESTIONS:
        errors.append(f"expected {EXPECTED_QUESTIONS} questions, found {len(questions)}")

    if [row.get("questionNumber") for row in questions] != list(
        range(1, len(questions) + 1)
    ):
        errors.append("question numbers are not contiguous from 1")

    source_ids = [row.get("sourceQuestionId") for row in questions]
    if len(source_ids) != len(set(source_ids)):
        errors.append("duplicate sourceQuestionId values")

    source_section_ids = [section.get("sourceSectionId") for section in sections]
    if len(source_section_ids) != len(set(source_section_ids)):
        errors.append("duplicate sourceSectionId values")

    source_book_ids = [book.get("sourceBookId") for book in books]
    if len(source_book_ids) != len(set(source_book_ids)):
        errors.append("duplicate sourceBookId values")
    if EXCLUDED_BOOK_IDS & set(source_book_ids):
        errors.append("excluded source book was included")

    source_questions = {}
    for source_book in source_books:
        if int(source_book["id"]) in EXCLUDED_BOOK_IDS:
            continue
        for source_section in source_book.get("sections", []):
            for source_question in source_section.get("questions", []):
                source_questions[int(source_question["id"])] = source_question

    expected_ids = set(source_questions)
    actual_ids = set(source_ids)
    missing = sorted(expected_ids - actual_ids)
    extra = sorted(actual_ids - expected_ids)
    if missing:
        errors.append(f"missing source questions: {missing[:10]}")
    if extra:
        errors.append(f"unexpected source questions: {extra[:10]}")

    for row in questions:
        source_question = source_questions.get(row.get("sourceQuestionId"))
        if not source_question:
            continue
        if row.get("question") != source_question["title"]:
            errors.append(f"question text changed for source ID {row['sourceQuestionId']}")
        if row.get("answer") != (source_question.get("response") or ""):
            errors.append(f"answer text changed for source ID {row['sourceQuestionId']}")

    if check_images:
        for row in questions:
            expected_image = bool(source_questions[row['sourceQuestionId']].get("image"))
            actual_image = row.get("image")
            if expected_image and not actual_image:
                errors.append(f"missing image path for source ID {row['sourceQuestionId']}")
            if not expected_image and actual_image:
                errors.append(f"unexpected image path for source ID {row['sourceQuestionId']}")
            image = row.get("image")
            if not image:
                continue
            if not image.startswith("/images/questions/"):
                errors.append(f"invalid image path for source ID {row['sourceQuestionId']}")
                continue
            if not (PUBLIC_DIR / image.lstrip("/")).exists():
                errors.append(f"image file missing for source ID {row['sourceQuestionId']}")

    return errors


def download_images(questions: list[dict]) -> int:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    for row in questions:
        url = row.get("_sourceImageUrl")
        if not url:
            continue
        filename = f"{row['sourceQuestionId']}{_image_extension(url)}"
        destination = IMAGE_DIR / filename
        if not destination.exists():
            request = urllib.request.Request(url, headers={"User-Agent": "catechism-sync/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response:
                destination.write_bytes(response.read())
            downloaded += 1
        row["image"] = f"/images/questions/{filename}"
    return downloaded


def public_question(row: dict) -> dict:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def run(source_path: Path, *, check: bool, skip_images: bool) -> int:
    source_books = load_source(source_path)
    built_structure, built_questions = build_catalogue(source_books)

    if check and STRUCTURE_FILE.exists() and QUESTION_FILE.exists():
        structure = json.loads(STRUCTURE_FILE.read_text(encoding="utf-8"))
        questions = json.loads(QUESTION_FILE.read_text(encoding="utf-8"))
        if structure != built_structure:
            print(
                f"ERROR: {STRUCTURE_FILE} is stale; run syncArabicSource.py",
                file=sys.stderr,
            )
            return 1
        def without_image(row):
            return {
                key: value
                for key, value in public_question(row).items()
                if key != "image"
            }

        if [without_image(row) for row in built_questions] != [
            without_image(row) for row in questions
        ]:
            print(
                f"ERROR: {QUESTION_FILE} is stale; run syncArabicSource.py",
                file=sys.stderr,
            )
            return 1
    else:
        structure, questions = built_structure, built_questions

    if not check and not skip_images:
        downloaded = download_images(questions)
        print(f"Downloaded {downloaded} image(s)")

    errors = validate_catalogue(
        structure,
        questions,
        source_books,
        check_images=(not skip_images) if check or not skip_images else False,
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    images = sum(1 for row in questions if row.get("image"))
    print(
        f"{len(structure['books'])} books, "
        f"{sum(len(book['sections']) for book in structure['books'])} sections, "
        f"{len(questions)} questions, {images} images"
    )

    if not check:
        write_json(STRUCTURE_FILE, structure)
        write_json(QUESTION_FILE, [public_question(row) for row in questions])
        print(f"Wrote {STRUCTURE_FILE}")
        print(f"Wrote {QUESTION_FILE}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE_FILE_DEFAULT)
    parser.add_argument("--check", action="store_true", help="validate without writing")
    parser.add_argument("--skip-images", action="store_true", help="do not download images")
    args = parser.parse_args()
    return run(args.source, check=args.check, skip_images=args.skip_images)


if __name__ == "__main__":
    raise SystemExit(main())
