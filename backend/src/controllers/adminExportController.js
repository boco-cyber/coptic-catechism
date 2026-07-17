const { Question, QuestionAr } = require('../models');
const { rowsToWorkbook } = require('../services/xlsxTemplate');

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.exportQuestions = async (req, res) => {
  try {
    const { book, chapter, needsReview } = req.query;
    const arFilter = {};
    if (book) arFilter.bookNumber = parseInt(book, 10);
    if (chapter) arFilter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (needsReview === 'true') arFilter.needsReview = true;
    if (needsReview === 'false') arFilter.needsReview = false;

    const arRows = await QuestionAr.find(arFilter).sort({ questionNumber: 1 }).lean();
    const numbers = arRows.map((r) => r.questionNumber);
    const enRows = await Question.find({ questionNumber: { $in: numbers } }).lean();
    const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));

    const rows = arRows.map((ar) => ({
      questionNumber: ar.questionNumber,
      bookNumber: ar.bookNumber,
      chapterTitle: ar.chapterTitle,
      question_en: enByNumber.get(ar.questionNumber)?.question || '',
      answer_en: enByNumber.get(ar.questionNumber)?.answer || '',
      question_ar: ar.question,
      answer_ar: ar.answer,
      needsReview: Boolean(ar.needsReview)
    }));

    const buffer = await rowsToWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="catechism-qa-export.xlsx"');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
