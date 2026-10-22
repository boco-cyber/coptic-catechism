const TEXT_FIELDS = ['question', 'answer'];
const DEFAULT_MAX = { en: 1452, ar: 1424 };

function optionsFor(options = {}) {
  const lang = options.lang === 'ar' ? 'ar' : 'en';
  return {
    lang,
    maxQuestionNumber: options.maxQuestionNumber || DEFAULT_MAX[lang]
  };
}

function validateRow(row, options = {}) {
  const { lang, maxQuestionNumber } = optionsFor(options);
  const errors = [];
  const questionNumber = Number(row.questionNumber);
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > maxQuestionNumber) {
    errors.push(`questionNumber "${row.questionNumber}" is not an integer between 1 and ${maxQuestionNumber}`);
  }
  for (const field of TEXT_FIELDS) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim() === '') {
      errors.push(`${field} is present but empty`);
    }
  }
  if (lang === 'ar' && row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    const normalized = String(row.needsReview).trim().toLowerCase();
    if (!['true', 'false'].includes(normalized)) {
      errors.push(`needsReview "${row.needsReview}" must be TRUE or FALSE`);
    }
  }
  return errors;
}

function normalizeRow(row, options = {}) {
  const { lang } = optionsFor(options);
  const normalized = { questionNumber: Number(row.questionNumber) };
  for (const field of TEXT_FIELDS) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      normalized[field] = String(row[field]).trim();
    }
  }
  if (lang === 'ar' && row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    normalized.needsReview = String(row.needsReview).trim().toLowerCase() === 'true';
  }
  return normalized;
}

function diffRow(existing, incoming, options = {}) {
  const { lang } = optionsFor(options);
  const changes = [];
  for (const field of TEXT_FIELDS) {
    if (field in incoming && incoming[field] !== existing[field]) {
      changes.push({ field, oldValue: existing[field] ?? '', newValue: incoming[field] });
    }
  }
  if (lang === 'ar' && 'needsReview' in incoming && incoming.needsReview !== Boolean(existing.needsReview)) {
    changes.push({ field: 'needsReview', oldValue: Boolean(existing.needsReview), newValue: incoming.needsReview });
  }
  return changes;
}

module.exports = { validateRow, normalizeRow, diffRow, TEXT_FIELDS, DEFAULT_MAX };
