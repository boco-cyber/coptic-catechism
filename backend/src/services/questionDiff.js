const REQUIRED_TEXT_FIELDS = ['question_en', 'answer_en', 'question_ar', 'answer_ar'];

function validateRow(row) {
  const errors = [];
  const questionNumber = Number(row.questionNumber);
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 1452) {
    errors.push(`questionNumber "${row.questionNumber}" is not an integer between 1 and 1452`);
  }
  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim() === '') {
      errors.push(`${field} is present but empty`);
    }
  }
  if (row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    const normalized = String(row.needsReview).trim().toLowerCase();
    if (!['true', 'false'].includes(normalized)) {
      errors.push(`needsReview "${row.needsReview}" must be TRUE or FALSE`);
    }
  }
  return errors;
}

function normalizeRow(row) {
  const normalized = { questionNumber: Number(row.questionNumber) };
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      normalized[field] = String(row[field]).trim();
    }
  }
  if (row.needsReview !== undefined && row.needsReview !== null && row.needsReview !== '') {
    normalized.needsReview = String(row.needsReview).trim().toLowerCase() === 'true';
  }
  return normalized;
}

function diffRow(existing, incoming) {
  const changes = [];
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (field in incoming && incoming[field] !== existing[field]) {
      changes.push({ field, oldValue: existing[field] ?? '', newValue: incoming[field] });
    }
  }
  if ('needsReview' in incoming && incoming.needsReview !== Boolean(existing.needsReview)) {
    changes.push({ field: 'needsReview', oldValue: Boolean(existing.needsReview), newValue: incoming.needsReview });
  }
  return changes;
}

module.exports = { validateRow, normalizeRow, diffRow, REQUIRED_TEXT_FIELDS };
