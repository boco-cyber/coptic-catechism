const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRow, normalizeRow, diffRow } = require('../../src/services/questionDiff');

test('validateRow accepts a well-formed row', () => {
  const errors = validateRow({ questionNumber: '5', question_ar: 'سؤال', answer_ar: 'جواب', needsReview: 'FALSE' });
  assert.deepEqual(errors, []);
});

test('validateRow rejects an out-of-range questionNumber', () => {
  const errors = validateRow({ questionNumber: '9999' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /between 1 and 1452/);
});

test('validateRow rejects a present-but-empty text field', () => {
  const errors = validateRow({ questionNumber: '5', answer_ar: '   ' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /answer_ar/);
});

test('validateRow rejects a non-boolean needsReview value', () => {
  const errors = validateRow({ questionNumber: '5', needsReview: 'maybe' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /needsReview/);
});

test('normalizeRow trims text and coerces needsReview to boolean', () => {
  const normalized = normalizeRow({ questionNumber: '5', question_ar: '  سؤال  ', needsReview: 'TRUE' });
  assert.deepEqual(normalized, { questionNumber: 5, question_ar: 'سؤال', needsReview: true });
});

test('diffRow reports only fields that actually changed', () => {
  const existing = { question_en: 'a', answer_en: 'b', question_ar: 'c', answer_ar: 'd', needsReview: true };
  const incoming = { question_ar: 'c', answer_ar: 'new answer', needsReview: false };
  const changes = diffRow(existing, incoming);
  assert.deepEqual(changes, [
    { field: 'answer_ar', oldValue: 'd', newValue: 'new answer' },
    { field: 'needsReview', oldValue: true, newValue: false }
  ]);
});
