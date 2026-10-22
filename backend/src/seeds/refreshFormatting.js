#!/usr/bin/env node
/**
 * Refresh answer formatting in MongoDB from the committed JSON datasets.
 *
 * Dry run by default:
 *   npm run format:mongo
 *
 * Apply changes:
 *   npm run format:mongo -- --apply
 *
 * Only `answer` and (English) `footnotes` are updated. Questions, hierarchy,
 * review flags, and timestamps are untouched.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { Question, QuestionAr } = require('../models');

const DATA_DIR = path.join(__dirname, '../../data');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const langArg = process.argv.find((value) => value.startsWith('--lang='));
const lang = langArg ? langArg.split('=')[1] : 'both';

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

async function syncModel({ Model, file, label, includeFootnotes }) {
  const rows = load(file);
  const byNumber = new Map(rows.map((row) => [row.questionNumber, row]));
  const documents = await Model.find({ questionNumber: { $in: [...byNumber.keys()] } })
    .select('questionNumber answer footnotes')
    .lean();

  const changed = [];
  for (const document of documents) {
    const row = byNumber.get(document.questionNumber);
    if (!row) continue;
    const answerChanged = document.answer !== row.answer;
    const footnotesChanged = includeFootnotes
      && JSON.stringify(document.footnotes || []) !== JSON.stringify(row.footnotes || []);
    if (answerChanged || footnotesChanged) {
      changed.push({ questionNumber: document.questionNumber, answerChanged, footnotesChanged });
    }
  }

  console.log(`${label}: ${documents.length} documents, ${changed.length} need formatting updates`);
  if (changed.length) {
    console.log(`  first changed question numbers: ${changed.slice(0, 20).map((item) => item.questionNumber).join(', ')}`);
  }
  if (apply && changed.length) {
    for (const item of changed) {
      const row = byNumber.get(item.questionNumber);
      const update = { answer: row.answer };
      if (includeFootnotes) update.footnotes = row.footnotes || [];
      await Model.updateOne({ questionNumber: item.questionNumber }, { $set: update });
    }
    console.log(`  applied ${changed.length} updates`);
  }
  return changed.length;
}

async function main() {
  if (!['both', 'en', 'ar'].includes(lang)) {
    throw new Error('--lang must be en, ar, or both');
  }
  await connectDB();
  console.log(apply ? 'Mode: apply\n' : 'Mode: dry run (pass --apply to write)\n');
  let total = 0;
  if (lang === 'both' || lang === 'en') {
    total += await syncModel({
      Model: Question,
      file: 'catechism_qa.json',
      label: 'English',
      includeFootnotes: true
    });
  }
  if (lang === 'both' || lang === 'ar') {
    total += await syncModel({
      Model: QuestionAr,
      file: 'catechism_qa_ar.json',
      label: 'Arabic',
      includeFootnotes: false
    });
  }
  console.log(`\n${apply ? 'Updated' : 'Would update'} ${total} document(s).`);
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error('Formatting refresh failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
