const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRow, normalizeRow, diffRow } = require('../../src/services/questionDiff');

test('validateRow accepts a well-formed Arabic row', () => {
  const errors = validateRow(
    { questionNumber: '5', question: 'سؤال', answer: 'جواب', needsReview: 'FALSE' },
    { lang: 'ar' }
  );
  assert.deepEqual(errors, []);
});

test('validateRow rejects an out-of-range English questionNumber', () => {
  const errors = validateRow({ questionNumber: '1453' }, { lang: 'en' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /between 1 and 1452/);
});

test('validateRow rejects an out-of-range Arabic questionNumber', () => {
  const errors = validateRow({ questionNumber: '1425' }, { lang: 'ar' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /between 1 and 1424/);
});

test('validateRow rejects a present-but-empty text field', () => {
  const errors = validateRow({ questionNumber: '5', answer: '   ' }, { lang: 'en' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /answer/);
});

test('validateRow rejects a non-boolean needsReview value', () => {
  const errors = validateRow({ questionNumber: '5', needsReview: 'maybe' }, { lang: 'ar' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /needsReview/);
});

test('normalizeRow trims text and coerces Arabic needsReview to boolean', () => {
  const normalized = normalizeRow(
    { questionNumber: '5', question: '  سؤال  ', answer: ' جواب ', needsReview: 'TRUE' },
    { lang: 'ar' }
  );
  assert.deepEqual(normalized, {
    questionNumber: 5,
    question: 'سؤال',
    answer: 'جواب',
    needsReview: true
  });
});

test('diffRow reports only fields that actually changed', () => {
  const existing = { question: 'a', answer: 'b', needsReview: true };
  const incoming = { question: 'a', answer: 'new answer', needsReview: false };
  const changes = diffRow(existing, incoming, { lang: 'ar' });
  assert.deepEqual(changes, [
    { field: 'answer', oldValue: 'b', newValue: 'new answer' },
    { field: 'needsReview', oldValue: true, newValue: false }
  ]);
});

test('diffRow ignores needsReview for English rows', () => {
  const changes = diffRow(
    { question: 'a', answer: 'b', needsReview: false },
    { question: 'a', answer: 'b', needsReview: true },
    { lang: 'en' }
  );
  assert.deepEqual(changes, []);
});
