const test = require('node:test');
const assert = require('node:assert/strict');
const { rowsToWorkbook, workbookToRows } = require('../../src/services/xlsxTemplate');

test('rowsToWorkbook + workbookToRows round-trips question data', async () => {
  const rows = [
    {
      questionNumber: 1,
      bookNumber: 1,
      chapterTitle: 'مقدمة',
      question_en: 'What is a catechism?',
      answer_en: 'A summary of the faith.',
      question_ar: 'ما هو الكاتيكيزم؟',
      answer_ar: 'ملخص للإيمان.',
      needsReview: true
    }
  ];
  const buffer = await rowsToWorkbook(rows);
  const parsed = await workbookToRows(buffer);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].questionNumber, '1');
  assert.equal(parsed[0].question_ar, 'ما هو الكاتيكيزم؟');
  assert.equal(parsed[0].needsReview, 'TRUE');
});

test('workbookToRows throws when a required column is missing', async () => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = [{ header: 'questionNumber', key: 'questionNumber' }];
  sheet.addRow({ questionNumber: 1 });
  const badBuffer = await workbook.xlsx.writeBuffer();
  const { workbookToRows: parse } = require('../../src/services/xlsxTemplate');
  await assert.rejects(() => parse(badBuffer), /Missing required column/);
});
