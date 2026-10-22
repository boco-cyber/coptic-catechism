import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "seeds"))

import formatting


class EnglishFormattingTests(unittest.TestCase):
    def test_joins_wrapped_lines_into_one_paragraph(self):
        body, footnotes, headers, dropped = formatting.format_english_answer(
            "This is a sentence that was\nwrapped by the PDF extractor.\n\nA second paragraph."
        )
        self.assertEqual(body, "This is a sentence that was wrapped by the PDF extractor.\n\nA second paragraph.")
        self.assertEqual(footnotes, [])
        self.assertEqual(headers, [])
        self.assertIsNone(dropped)

    def test_extracts_marked_footnote(self):
        body, footnotes, _, _ = formatting.format_english_answer(
            "The body ends here.1\n1 Cf. A source, p. 10.",
            question_number=1,
        )
        self.assertEqual(body, "The body ends here.1")
        self.assertEqual(footnotes, ["1 Cf. A source, p. 10."])

    def test_does_not_treat_body_list_as_footnotes(self):
        body, footnotes, _, _ = formatting.format_english_answer(
            "1. The first point.\n2. The second point."
        )
        self.assertIn("The first point.", body)
        self.assertEqual(footnotes, [])

    def test_removes_embedded_next_question(self):
        body, _, _, dropped = formatting.format_english_answer(
            "The answer belongs here.\n2 What is the next question? This text belongs to the next answer and should be removed because the previous answer ended at the question marker.",
            next_answer=(
                "This text belongs to the next answer and should be removed because the "
                "previous answer ended at the question marker."
            ),
            question_number=1,
        )
        self.assertEqual(body, "The answer belongs here.")
        self.assertIn("What is the next question?", dropped)

    def test_english_dataset_formatting_is_idempotent(self):
        rows = [{"questionNumber": 1, "question": "Q?", "answer": "A body.1\n1 Cf. Source."}]
        first = formatting.format_english_dataset(rows)
        second = formatting.format_english_dataset(first)
        self.assertEqual(first, second)


class ArabicFormattingTests(unittest.TestCase):
    def test_joins_blank_line_after_nonterminal_text(self):
        body = formatting.format_arabic_answer("هذا نص غير مكتمل\n\nيكمل في السطر التالي.")
        self.assertEqual(body, "هذا نص غير مكتمل يكمل في السطر التالي.")

    def test_keeps_paragraph_after_terminal_punctuation(self):
        body = formatting.format_arabic_answer("هذه فقرة أولى.\n\nهذه فقرة ثانية.")
        self.assertEqual(body, "هذه فقرة أولى.\n\nهذه فقرة ثانية.")

    def test_list_marker_starts_new_paragraph(self):
        body = formatting.format_arabic_answer("مقدمة:\n١. البند الأول")
        self.assertEqual(body, "مقدمة:\n\n١. البند الأول")

    def test_preserves_visible_characters(self):
        source = "نص عربي.\n\nثم نص آخر: ١٢٣"
        body = formatting.format_arabic_answer(source)
        self.assertTrue(formatting.validate_preserved(source, [body]))


if __name__ == "__main__":
    unittest.main()
