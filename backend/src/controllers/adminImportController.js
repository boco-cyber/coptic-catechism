const { Question, QuestionAr } = require('../models');
const { workbookToRows } = require('../services/xlsxTemplate');
const { validateRow, normalizeRow, diffRow } = require('../services/questionDiff');

async function buildDiffPlan(buffer) {
  const rawRows = await workbookToRows(buffer);
  const errors = [];
  const plan = [];

  const candidateNumbers = rawRows
    .map((r) => Number(r.questionNumber))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 1452);
  const [enRows, arRows] = await Promise.all([
    Question.find({ questionNumber: { $in: candidateNumbers } }).lean(),
    QuestionAr.find({ questionNumber: { $in: candidateNumbers } }).lean()
  ]);
  const enByNumber = new Map(enRows.map((r) => [r.questionNumber, r]));
  const arByNumber = new Map(arRows.map((r) => [r.questionNumber, r]));

  let unchanged = 0;
  for (const raw of rawRows) {
    const rowErrors = validateRow(raw);
    if (rowErrors.length) {
      errors.push({ row: raw.rowNumber, message: rowErrors.join('; ') });
      continue;
    }
    const incoming = normalizeRow(raw);
    const en = enByNumber.get(incoming.questionNumber);
    const ar = arByNumber.get(incoming.questionNumber);
    if (!en || !ar) {
      errors.push({ row: raw.rowNumber, message: `questionNumber ${incoming.questionNumber} not found` });
      continue;
    }
    const existing = {
      question_en: en.question,
      answer_en: en.answer,
      question_ar: ar.question,
      answer_ar: ar.answer,
      needsReview: Boolean(ar.needsReview)
    };
    const changes = diffRow(existing, incoming);
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
    const dryRun = req.query.dryRun !== 'false';
    const { plan, errors, unchanged } = await buildDiffPlan(req.file.buffer);

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        changed: plan.map((p) => ({ questionNumber: p.questionNumber, changes: p.changes })),
        unchanged,
        errors
      });
    }

    if (errors.length) {
      return res.status(400).json({ success: false, error: 'Import has validation errors; fix them before committing', errors });
    }

    for (const item of plan) {
      const enUpdate = {};
      const arUpdate = {};
      if ('question_en' in item.incoming) enUpdate.question = item.incoming.question_en;
      if ('answer_en' in item.incoming) enUpdate.answer = item.incoming.answer_en;
      if ('question_ar' in item.incoming) arUpdate.question = item.incoming.question_ar;
      if ('answer_ar' in item.incoming) arUpdate.answer = item.incoming.answer_ar;
      if ('needsReview' in item.incoming) arUpdate.needsReview = item.incoming.needsReview;

      if (Object.keys(arUpdate).length) {
        arUpdate.reviewedBy = req.session.username;
        arUpdate.reviewedAt = new Date();
      }

      await Promise.all([
        Object.keys(enUpdate).length ? Question.updateOne({ questionNumber: item.questionNumber }, { $set: enUpdate }) : Promise.resolve(),
        Object.keys(arUpdate).length ? QuestionAr.updateOne({ questionNumber: item.questionNumber }, { $set: arUpdate }) : Promise.resolve()
      ]);
    }

    res.json({ success: true, dryRun: false, updated: plan.length, unchanged, errors: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
