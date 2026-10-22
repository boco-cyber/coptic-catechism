const { catalogueFor } = require('../services/catalogue');

function language(req) {
  return req.query.lang === 'ar' ? 'ar' : 'en';
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toAdminRow(doc, lang) {
  return {
    questionNumber: doc.questionNumber,
    bookNumber: doc.bookNumber,
    chapterTitle: doc.chapterTitle || '',
    question: doc.question,
    answer: doc.answer,
    needsReview: lang === 'ar' ? Boolean(doc.needsReview) : false,
    reviewedBy: lang === 'ar' ? (doc.reviewedBy || null) : null,
    reviewedAt: lang === 'ar' ? (doc.reviewedAt || null) : null,
    lang
  };
}

exports.listQuestions = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
    const { book, chapter, needsReview, q, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = {};
    if (q && q.trim().length >= 2) {
      const pattern = escapedRegex(q.trim());
      filter.$or = [
        { question: { $regex: pattern, $options: 'i' } },
        { answer: { $regex: pattern, $options: 'i' } }
      ];
    }
    if (book) filter.bookNumber = parseInt(book, 10);
    if (chapter) filter.chapterTitle = { $regex: escapedRegex(chapter), $options: 'i' };
    if (lang === 'ar' && needsReview === 'true') filter.needsReview = true;
    if (lang === 'ar' && needsReview === 'false') filter.needsReview = false;

    const skip = (pageNum - 1) * limitNum;
    const [rows, total] = await Promise.all([
      Model.find(filter).sort({ questionNumber: 1 }).skip(skip).limit(limitNum).lean(),
      Model.countDocuments(filter)
    ]);

    res.json({
      success: true,
      lang,
      maxQuestionNumber,
      count: rows.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: rows.map((row) => toAdminRow(row, lang))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getQuestion = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
    const questionNumber = parseInt(req.params.questionNumber, 10);
    const doc = await Model.findOne({ questionNumber }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    res.json({ success: true, lang, maxQuestionNumber, data: toAdminRow(doc, lang) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
    const questionNumber = parseInt(req.params.questionNumber, 10);
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > maxQuestionNumber) {
      return res.status(400).json({
        success: false,
        error: `questionNumber must be an integer between 1 and ${maxQuestionNumber}`
      });
    }

    const update = {};
    for (const field of ['question', 'answer']) {
      if (!(field in req.body)) continue;
      const value = req.body[field];
      if (typeof value !== 'string' || value.trim() === '') {
        return res.status(400).json({ success: false, error: `${field} must be a non-empty string` });
      }
      update[field] = value.trim();
    }

    let needsReviewProvided = false;
    if ('needsReview' in req.body) {
      if (lang !== 'ar') {
        return res.status(400).json({ success: false, error: 'needsReview is only available for Arabic questions' });
      }
      if (typeof req.body.needsReview !== 'boolean') {
        return res.status(400).json({ success: false, error: 'needsReview must be a boolean' });
      }
      update.needsReview = req.body.needsReview;
      needsReviewProvided = true;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'No editable fields supplied' });
    }

    if (lang === 'ar') {
      if (!needsReviewProvided) update.needsReview = false;
      update.reviewedBy = req.session.username;
      update.reviewedAt = new Date();
    }

    const doc = await Model.findOneAndUpdate(
      { questionNumber },
      { $set: update },
      { new: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    res.json({ success: true, lang, maxQuestionNumber, data: toAdminRow(doc, lang) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const lang = language(req);
    const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
    const filter = lang === 'ar' ? { needsReview: true } : {};
    const [total, needsReview, byBook] = await Promise.all([
      Model.countDocuments(),
      Model.countDocuments(filter),
      Model.aggregate([
        { $group: { _id: '$bookNumber', total: { $sum: 1 }, needsReview: { $sum: { $cond: ['$needsReview', 1, 0] } } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, bookNumber: '$_id', total: 1, needsReview: 1 } }
      ])
    ]);
    res.json({
      success: true,
      data: { lang, total, needsReview, maxQuestionNumber, byBook }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
