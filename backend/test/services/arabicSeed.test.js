const test = require('node:test');
const assert = require('node:assert/strict');
const { validateArabicSeed } = require('../../src/seeds/seedArabic');

test('validateArabicSeed accepts the generated datasets', () => {
  const structure = require('../../data/arabic_structure.json');
  const questions = require('../../data/catechism_qa_ar.json');
  assert.deepEqual(validateArabicSeed(structure, questions), []);
});

test('validateArabicSeed rejects a non-contiguous question number', () => {
  const structure = require('../../data/arabic_structure.json');
  const questions = require('../../data/catechism_qa_ar.json').map((row) => ({ ...row }));
  questions[1].questionNumber = 99;
  const errors = validateArabicSeed(structure, questions);
  assert.match(errors.join('\n'), /contiguous/);
});
