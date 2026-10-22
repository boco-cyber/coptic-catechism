import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "seeds"))

import syncArabicSource

SOURCE_FILE = Path("/home/gergo/Downloads/Youth-Catechism-QA/all_data.json")


@unittest.skipUnless(SOURCE_FILE.exists(), "Arabic source not present")
class ArabicSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_books = syncArabicSource.load_source(SOURCE_FILE)
        cls.structure, cls.questions = syncArabicSource.build_catalogue(cls.source_books)

    def test_source_has_expected_counts_and_order(self):
        self.assertEqual(len(self.structure["books"]), 7)
        self.assertEqual(
            sum(len(book["sections"]) for book in self.structure["books"]), 83
        )
        self.assertEqual(len(self.questions), 1424)
        first_book = self.structure["books"][0]
        self.assertEqual(
            [section["sourceSectionId"] for section in first_book["sections"]],
            [15, 16, 18, 17, 19, 20],
        )
        self.assertEqual(self.questions[0]["sourceQuestionId"], 1029)
        self.assertEqual(self.questions[-1]["sourceQuestionId"], 398)
        self.assertEqual(
            [row["questionNumber"] for row in self.questions],
            list(range(1, 1425)),
        )

    def test_source_contains_expected_images(self):
        self.assertEqual(
            sum(1 for row in self.questions if row["_sourceImageUrl"]), 61
        )

    def test_validation_reports_no_errors(self):
        errors = syncArabicSource.validate_catalogue(
            self.structure,
            self.questions,
            self.source_books,
            check_images=False,
        )
        self.assertEqual(errors, [])

    def test_letter_book_is_excluded(self):
        self.assertNotIn(
            19, [book["sourceBookId"] for book in self.structure["books"]]
        )
        self.assertFalse(
            any("Letter in english" in row["question"] for row in self.questions)
        )


if __name__ == "__main__":
    unittest.main()
