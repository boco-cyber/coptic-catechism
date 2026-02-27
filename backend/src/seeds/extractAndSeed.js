/**
 * Extract Q&A content from the Catechism PDFs and update MongoDB.
 *
 * Prerequisites:
 *   - pip install pymupdf
 *   - Place PDF files in backend/data/ directory
 *   - Run "npm run seed" first to create the structure
 *
 * Usage:
 *   npm run seed:questions
 *
 * This script:
 *   1. Uses Python (PyMuPDF) to extract text from both volumes
 *   2. Parses Q&A pairs using the numbered question pattern
 *   3. Updates each Question document in MongoDB with the real text
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../../config/db');
const { Question } = require('../models');

const DATA_DIR = path.join(__dirname, '../../data');

// Python script to extract Q&A from a PDF
const PYTHON_EXTRACTOR = `
import fitz
import json
import re
import sys

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)

# Extract all text
full_text = ""
for page in doc:
    full_text += page.get_text() + "\\n"

# Split by question pattern: number. question text?
# Then capture everything until the next question as the answer
pattern = r'(?:^|\\n)\\s*(\\d+)\\.\\s+(.*?\\?)\\s*\\n(.*?)(?=\\n\\s*\\d+\\.\\s+.*?\\?|\\Z)'
matches = re.findall(pattern, full_text, re.DOTALL)

results = []
for num_str, question, answer in matches:
    num = int(num_str)
    if 1 <= num <= 1452:
        # Clean up answer text
        answer = answer.strip()
        # Remove page numbers and headers
        answer = re.sub(r'\\n\\s*\\d+\\s*\\n', '\\n', answer)
        answer = re.sub(r'Book \\d+:.*?\\n', '', answer)
        answer = re.sub(r'Catechism of the Coptic Orthodox Church.*?\\n', '', answer)
        answer = answer.strip()

        if len(answer) > 20:  # Only keep substantial answers
            results.append({
                'questionNumber': num,
                'question': question.strip(),
                'answer': answer
            })

# Deduplicate by question number (keep longest answer)
deduped = {}
for r in results:
    n = r['questionNumber']
    if n not in deduped or len(r['answer']) > len(deduped[n]['answer']):
        deduped[n] = r

print(json.dumps(list(deduped.values())))
`;

async function extractAndSeed() {
  // Check for PDF files
  const vol1Path = path.join(DATA_DIR, 'volume1.pdf');
  const vol2Path = path.join(DATA_DIR, 'volume2.pdf');

  if (!fs.existsSync(vol1Path) || !fs.existsSync(vol2Path)) {
    console.log('PDF files not found. Please place them in backend/data/:');
    console.log('  backend/data/volume1.pdf');
    console.log('  backend/data/volume2.pdf');
    console.log('');
    console.log('You can rename your files:');
    console.log('  Catechism-...-Volume-1-... .pdf  →  volume1.pdf');
    console.log('  Catechism-...-Volume-2-... .pdf  →  volume2.pdf');
    process.exit(1);
  }

  await connectDB();
  console.log('Connected to MongoDB.\n');

  // Write Python script to temp file
  const pyScript = path.join(__dirname, '_extract.py');
  fs.writeFileSync(pyScript, PYTHON_EXTRACTOR);

  let totalUpdated = 0;

  for (const [volNum, pdfPath] of [[1, vol1Path], [2, vol2Path]]) {
    console.log(`Extracting from Volume ${volNum}...`);

    try {
      const output = execSync(`python3 "${pyScript}" "${pdfPath}"`, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf-8'
      });

      const questions = JSON.parse(output);
      console.log(`  Found ${questions.length} Q&A pairs in Volume ${volNum}`);

      // Update each question in MongoDB
      for (const qa of questions) {
        const result = await Question.findOneAndUpdate(
          { questionNumber: qa.questionNumber },
          {
            question: qa.question,
            answer: qa.answer
          },
          { new: true }
        );
        if (result) totalUpdated++;
      }

      console.log(`  Updated ${questions.length} questions from Volume ${volNum}\n`);
    } catch (err) {
      console.error(`  Error extracting Volume ${volNum}:`, err.message);
    }
  }

  // Cleanup
  fs.unlinkSync(pyScript);

  // Stats
  const filled = await Question.countDocuments({
    question: { $not: /^\[Question \d+/ }
  });
  const placeholder = await Question.countDocuments({
    question: /^\[Question \d+/
  });

  console.log('Extraction complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Total updated:  ${totalUpdated}`);
  console.log(`  With content:   ${filled}`);
  console.log(`  Still placeholder: ${placeholder}`);
  console.log('─────────────────────────────────────\n');

  await mongoose.connection.close();
}

extractAndSeed().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
