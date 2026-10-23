import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "seeds"))

import formatDatasets


def make_rows(count=3):
    return [
        {
            "questionNumber": number,
            "bookNumber": 1,
            "chapterNumber": 1,
            "sourceQuestionId": 1000 + number,
            "sourceSectionId": 15,
            "question": f"Question {number}",
            "answer": f"Answer {number}",
        }
        for number in range(1, count + 1)
    ]


class FormatDatasetsTests(unittest.TestCase):
    def test_validate_accepts_valid_rows(self):
        self.assertEqual(
            formatDatasets.validate_arabic_rows(make_rows(), expected_count=3), []
        )

    def test_validate_rejects_wrong_count(self):
        errors = formatDatasets.validate_arabic_rows(make_rows(3), expected_count=4)
        self.assertIn("expected 4 records, found 3", errors)

    def test_validate_rejects_duplicate_question_number(self):
        rows = make_rows()
        rows[1]["questionNumber"] = 1
        errors = formatDatasets.validate_arabic_rows(rows)
        self.assertTrue(any("duplicate questionNumber" in error for error in errors))

    def test_validate_rejects_missing_required_field(self):
        rows = make_rows()
        del rows[0]["sourceSectionId"]
        errors = formatDatasets.validate_arabic_rows(rows)
        self.assertTrue(
            any("missing required field sourceSectionId" in error for error in errors)
        )

    def test_validate_rejects_empty_answer(self):
        rows = make_rows()
        rows[0]["answer"] = "   "
        errors = formatDatasets.validate_arabic_rows(rows)
        self.assertTrue(any("empty answer" in error for error in errors))

    def test_check_reports_committed_arabic_dataset_as_source_controlled(self):
        output = io.StringIO()
        with mock.patch.object(sys, "argv", ["formatDatasets.py", "--check"]):
            with contextlib.redirect_stdout(output):
                formatDatasets.main()

        text = output.getvalue()
        self.assertIn(
            "Arabic: source-controlled by syncArabicSource.py "
            "(1424 records); no formatting applied",
            text,
        )
        self.assertIn("Datasets are up to date", text)

    def test_check_exits_nonzero_for_invalid_rows(self):
        rows = make_rows()
        rows[0]["answer"] = ""
        with mock.patch.object(sys, "argv", ["formatDatasets.py", "--check"]):
            with mock.patch.object(formatDatasets, "load", return_value=rows):
                with self.assertRaises(SystemExit) as raised:
                    formatDatasets.main()

        message = str(raised.exception)
        self.assertIn("Arabic dataset is invalid", message)
        self.assertIn("empty answer", message)
        self.assertIn("syncArabicSource.py", message)


if __name__ == "__main__":
    unittest.main()
