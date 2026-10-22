const { catalogueFor } = require('../services/catalogue');
const { workbookToRows } = require('../services/xlsxTemplate');
const { validateRow, normalizeRow, diffRow } = require('../services/questionDiff');

function language(req) {
  return req.query.lang === 'ar' ? 'ar' : 'en';
}

async function buildDiffPlan(buffer, lang) {
  const { Question: Model, maxQuestionNumber } = catalogueFor(lang);
  const rawRows = await workbookToRows(buffer, lang);
  const errors = [];
  const plan = [];

  const candidateNumbers = rawRows
    .map((row) => Number(row.questionNumber))
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= maxQuestionNumber);

  const existingRows = await Model.find({ questionNumber: { $in: candidateNumbers } }).lean();
  const existingByNumber = new Map(existingRows.map((row) => [row.questionNumber, row]));

  let unchanged = 0;
  for (const raw of rawRows) {
    const rowErrors = validateRow(raw, { lang, maxQuestionNumber });
    if (rowErrors.length) {
      errors.push({ row: raw.rowNumber, message: rowErrors.join('; ') });
      continue;
    }
    const incoming = normalizeRow(raw, { lang });
    const existing = existingByNumber.get(incoming.questionNumber);
    if (!existing) {
      errors.push({ row: raw.rowNumber, message: `questionNumber ${incoming.questionNumber} not found` });
      continue;
    }
    const current = {
      question: existing.question,
      answer: existing.answer,
      needsReview: Boolean(existing.needsReview)
    };
    const changes = diffRow(current, incoming, { lang });
    if (changes.length) {
      plan.push({ questionNumber: incoming.questionNumber, changes, incoming });
    } else {
      unchanged += 1;
    }
  }

  return { plan, errors, unchanged };
}

exports.importQuestions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded (field name must be "file")' });
    }
    const lang = language(req);
    const dryRun = req.query.dryRun !== 'false';
    const { plan, errors, unchanged } = await buildDiffPlan(req.file.buffer, lang);

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        lang,
        changed: plan.map((item) => ({ questionNumber: item.questionNumber, changes: item.changes })),
        unchanged,
        errors
      });
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        error: 'Import has validation errors; fix them before committing',
        errors
      });
    }

    const { Question: Model } = catalogueFor(lang);
    for (const item of plan) {
      const update = {};
      if ('question' in item.incoming) update.question = item.incoming.question;
      if ('answer' in item.incoming) update.answer = item.incoming.answer;
      if ('needsReview' in item.incoming) update.needsReview = item.incoming.needsReview;
      if (lang === 'ar') {
        update.reviewedBy = req.session.username;
        update.reviewedAt = new Date();
        if (!('needsReview' in update)) update.needsReview = false;
      }
      await Model.updateOne({ questionNumber: item.questionNumber }, { $set: update });
    }

    res.json({ success: true, dryRun: false, lang, updated: plan.length, unchanged, errors: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
