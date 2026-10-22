const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { rowsToWorkbook, workbookToRows } = require('../../src/services/xlsxTemplate');

test('English workbook has question/answer but no needsReview column', async () => {
  const buffer = await rowsToWorkbook([
    {
      questionNumber: 1,
      bookNumber: 1,
      chapterTitle: 'Introduction',
      question: 'What is a catechism?',
      answer: 'A summary of the faith.',
      needsReview: true
    }
  ], 'en');

  const parsed = await workbookToRows(buffer, 'en');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].questionNumber, '1');
  assert.equal(parsed[0].question, 'What is a catechism?');
  assert.equal('needsReview' in parsed[0], false);
});

test('Arabic workbook round-trips needsReview', async () => {
  const buffer = await rowsToWorkbook([
    {
      questionNumber: 1,
      bookNumber: 1,
      chapterTitle: 'مقدمة',
      question: 'ما هو الكاتيكيزم؟',
      answer: 'ملخص للإيمان.',
      needsReview: true
    }
  ], 'ar');

  const parsed = await workbookToRows(buffer, 'ar');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].question, 'ما هو الكاتيكيزم؟');
  assert.equal(parsed[0].needsReview, 'TRUE');
});

test('workbookToRows throws when a required column is missing', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = [{ header: 'questionNumber', key: 'questionNumber' }];
  sheet.addRow({ questionNumber: 1 });
  const badBuffer = await workbook.xlsx.writeBuffer();

  await assert.rejects(() => workbookToRows(badBuffer, 'ar'), /Missing required column/);
});
