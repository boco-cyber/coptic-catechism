const ExcelJS = require('exceljs');

const COLUMNS = {
  en: [
    { header: 'questionNumber', key: 'questionNumber', width: 14 },
    { header: 'book', key: 'book', width: 8 },
    { header: 'chapter', key: 'chapter', width: 30 },
    { header: 'question', key: 'question', width: 50 },
    { header: 'answer', key: 'answer', width: 60 }
  ],
  ar: [
    { header: 'questionNumber', key: 'questionNumber', width: 14 },
    { header: 'book', key: 'book', width: 8 },
    { header: 'chapter', key: 'chapter', width: 30 },
    { header: 'question', key: 'question', width: 50 },
    { header: 'answer', key: 'answer', width: 60 },
    { header: 'needsReview', key: 'needsReview', width: 12 }
  ]
};

function columnsFor(lang) {
  return COLUMNS[lang === 'ar' ? 'ar' : 'en'];
}

function normalizeLang(lang) {
  return lang === 'ar' ? 'ar' : 'en';
}

async function rowsToWorkbook(rows, lang) {
  const normalizedLang = normalizeLang(lang);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = columnsFor(normalizedLang);
  for (const row of rows) {
    const output = {
      questionNumber: row.questionNumber,
      book: row.bookNumber,
      chapter: row.chapterTitle || '',
      question: row.question || '',
      answer: row.answer || ''
    };
    if (normalizedLang === 'ar') {
      output.needsReview = row.needsReview ? 'TRUE' : 'FALSE';
    }
    sheet.addRow(output);
  }
  sheet.getColumn('question').alignment = { horizontal: 'right', wrapText: true };
  sheet.getColumn('answer').alignment = { horizontal: 'right', wrapText: true };
  return workbook.xlsx.writeBuffer();
}

async function workbookToRows(buffer, lang) {
  const normalizedLang = normalizeLang(lang);
  const columns = columnsFor(normalizedLang);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');

  const headerIndex = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headerIndex[String(cell.value).trim()] = colNumber;
  });

  const requiredHeaders = columns.map((column) => column.key);
  const missing = requiredHeaders.filter((header) => !(header in headerIndex));
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
    const parsed = {
      rowNumber,
      questionNumber: get(row, 'questionNumber'),
      question: get(row, 'question'),
      answer: get(row, 'answer')
    };
    if (normalizedLang === 'ar') {
      parsed.needsReview = get(row, 'needsReview');
    }
    rows.push(parsed);
  }
  return rows;
}

module.exports = { COLUMNS, columnsFor, rowsToWorkbook, workbookToRows };
