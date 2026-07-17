const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'questionNumber', key: 'questionNumber', width: 14 },
  { header: 'book', key: 'book', width: 8 },
  { header: 'chapter', key: 'chapter', width: 30 },
  { header: 'question_en', key: 'question_en', width: 50 },
  { header: 'answer_en', key: 'answer_en', width: 60 },
  { header: 'question_ar', key: 'question_ar', width: 50 },
  { header: 'answer_ar', key: 'answer_ar', width: 60 },
  { header: 'needsReview', key: 'needsReview', width: 12 }
];

async function rowsToWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = COLUMNS;
  for (const row of rows) {
    sheet.addRow({
      questionNumber: row.questionNumber,
      book: row.bookNumber,
      chapter: row.chapterTitle || '',
      question_en: row.question_en || '',
      answer_en: row.answer_en || '',
      question_ar: row.question_ar || '',
      answer_ar: row.answer_ar || '',
      needsReview: row.needsReview ? 'TRUE' : 'FALSE'
    });
  }
  sheet.getColumn('question_ar').alignment = { horizontal: 'right', wrapText: true };
  sheet.getColumn('answer_ar').alignment = { horizontal: 'right', wrapText: true };
  return workbook.xlsx.writeBuffer();
}

async function workbookToRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');

  const headerIndex = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headerIndex[String(cell.value).trim()] = colNumber;
  });

  const requiredHeaders = COLUMNS.map((c) => c.key);
  const missing = requiredHeaders.filter((h) => !(h in headerIndex));
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  }

  const get = (row, key) => {
    const cell = row.getCell(headerIndex[key]);
    return cell.value === null || cell.value === undefined ? '' : String(cell.value);
  };

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    if (get(row, 'questionNumber') === '') continue;
    rows.push({
      rowNumber,
      questionNumber: get(row, 'questionNumber'),
      question_en: get(row, 'question_en'),
      answer_en: get(row, 'answer_en'),
      question_ar: get(row, 'question_ar'),
      answer_ar: get(row, 'answer_ar'),
      needsReview: get(row, 'needsReview')
    });
  }
  return rows;
}

module.exports = { COLUMNS, rowsToWorkbook, workbookToRows };
