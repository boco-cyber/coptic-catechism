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
