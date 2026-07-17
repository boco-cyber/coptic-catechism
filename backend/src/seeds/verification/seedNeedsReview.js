require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../../config/db');
const { QuestionAr } = require('../../models');

const REPORT_PATH = path.join(__dirname, '../../../data/verification/outstanding_614_review.json');

async function main() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`${REPORT_PATH} not found. Run the report-compilation step first.`);
  }
  const entries = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const questionNumbers = entries.map((entry) => entry.questionNumber);
  console.log(`Flagging ${questionNumbers.length} question(s) as needsReview=true...`);

  await connectDB();
  const result = await QuestionAr.updateMany(
    { questionNumber: { $in: questionNumbers } },
    { $set: { needsReview: true } }
  );
  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await mongoose.disconnect();
});
