const { catalogueFor } = require('../services/catalogue');
const { rowsToWorkbook } = require('../services/xlsxTemplate');

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.exportQuestions = async (req, res) => {
  try {
    const lang = req.query.lang === 'ar' ? 'ar' : 'en';
    const { Question: Model } = catalogueFor(lang);
    const { book, chapter, needsReview } = req.query;
    const filter = {};
    if (book) filter.bookNumber = parseInt(book, 10);
    if (chapter) filter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (lang === 'ar' && needsReview === 'true') filter.needsReview = true;
    if (lang === 'ar' && needsReview === 'false') filter.needsReview = false;

    const rows = await Model.find(filter).sort({ questionNumber: 1 }).lean();
    const buffer = await rowsToWorkbook(rows, lang);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catechism-qa-${lang}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
