const { Question, QuestionAr } = require('../models');

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TEXT_FIELD_MAP = {
  question_en: { model: 'en', field: 'question' },
  answer_en: { model: 'en', field: 'answer' },
  question_ar: { model: 'ar', field: 'question' },
  answer_ar: { model: 'ar', field: 'answer' }
};

function toAdminRow(ar, en) {
  return {
    questionNumber: ar.questionNumber,
    bookNumber: ar.bookNumber,
    chapterTitle: ar.chapterTitle || '',
    question_en: en?.question || '',
    answer_en: en?.answer || '',
    question_ar: ar.question,
    answer_ar: ar.answer,
    needsReview: Boolean(ar.needsReview),
    reviewedBy: ar.reviewedBy || null,
    reviewedAt: ar.reviewedAt || null
  };
}

exports.listQuestions = async (req, res) => {
  try {
    const { book, chapter, needsReview, q, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    let matchingNumbers = null;
    if (q && q.trim().length >= 2) {
      const pattern = escapedRegex(q.trim());
      const textFilter = {
        $or: [
          { question: { $regex: pattern, $options: 'i' } },
          { answer: { $regex: pattern, $options: 'i' } }
        ]
      };
      const [enMatches, arMatches] = await Promise.all([
        Question.find(textFilter).select('questionNumber').lean(),
        QuestionAr.find(textFilter).select('questionNumber').lean()
      ]);
      matchingNumbers = [...new Set([...enMatches, ...arMatches].map((r) => r.questionNumber))];
    }

    const arFilter = {};
    if (book) arFilter.bookNumber = parseInt(book, 10);
    if (chapter) arFilter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (needsReview === 'true') arFilter.needsReview = true;
    if (needsReview === 'false') arFilter.needsReview = false;
    if (matchingNumbers) arFilter.questionNumber = { $in: matchingNumbers };

    const skip = (pageNum - 1) * limitNum;
    const [arRows, total] = await Promise.all([
      QuestionAr.find(arFilter).sort({ questionNumber: 1 }).skip(skip).limit(limitNum).lean(),
      QuestionAr.countDocuments(arFilter)
    ]);

    const numbers = arRows.map((r) => r.questionNumber);
    const enRows = await Question.find({ questionNumber: { $in: numbers } }).lean();
    const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));

    const data = arRows.map((ar) => toAdminRow(ar, enByNumber.get(ar.questionNumber)));

    res.json({
      success: true,
      count: data.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getQuestion = async (req, res) => {
  try {
    const questionNumber = parseInt(req.params.questionNumber, 10);
    const [en, ar] = await Promise.all([
      Question.findOne({ questionNumber }).lean(),
      QuestionAr.findOne({ questionNumber }).lean()
    ]);
    if (!en && !ar) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    res.json({ success: true, data: toAdminRow(ar || { questionNumber, question: '', answer: '' }, en) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const questionNumber = parseInt(req.params.questionNumber, 10);
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 1452) {
      return res.status(400).json({ success: false, error: 'questionNumber must be an integer between 1 and 1452' });
    }

    const enUpdate = {};
    const arUpdate = {};
    for (const [key, target] of Object.entries(TEXT_FIELD_MAP)) {
      if (!(key in req.body)) continue;
      const value = req.body[key];
      if (typeof value !== 'string' || value.trim() === '') {
        return res.status(400).json({ success: false, error: `${key} must be a non-empty string` });
      }
      (target.model === 'en' ? enUpdate : arUpdate)[target.field] = value.trim();
    }

    let needsReviewProvided = false;
    if ('needsReview' in req.body) {
      if (typeof req.body.needsReview !== 'boolean') {
        return res.status(400).json({ success: false, error: 'needsReview must be a boolean' });
      }
      arUpdate.needsReview = req.body.needsReview;
      needsReviewProvided = true;
    }

    if (Object.keys(enUpdate).length === 0 && Object.keys(arUpdate).length === 0) {
      return res.status(400).json({ success: false, error: 'No editable fields supplied' });
    }

    if (Object.keys(arUpdate).length > 0 && !needsReviewProvided) {
      arUpdate.needsReview = false;
    }
    if (Object.keys(arUpdate).length > 0) {
      arUpdate.reviewedBy = req.session.username;
      arUpdate.reviewedAt = new Date();
    }

    const [enDoc, arDoc] = await Promise.all([
      Object.keys(enUpdate).length
        ? Question.findOneAndUpdate({ questionNumber }, { $set: enUpdate }, { new: true }).lean()
        : Question.findOne({ questionNumber }).lean(),
      Object.keys(arUpdate).length
        ? QuestionAr.findOneAndUpdate({ questionNumber }, { $set: arUpdate }, { new: true }).lean()
        : QuestionAr.findOne({ questionNumber }).lean()
    ]);

    if (!enDoc && !arDoc) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    res.json({ success: true, data: toAdminRow(arDoc || { questionNumber, question: '', answer: '' }, enDoc) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [total, needsReview, byBook] = await Promise.all([
      QuestionAr.countDocuments(),
      QuestionAr.countDocuments({ needsReview: true }),
      QuestionAr.aggregate([
        { $group: { _id: '$bookNumber', total: { $sum: 1 }, needsReview: { $sum: { $cond: ['$needsReview', 1, 0] } } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, bookNumber: '$_id', total: 1, needsReview: 1 } }
      ])
    ]);
    res.json({ success: true, data: { total, needsReview, byBook } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
