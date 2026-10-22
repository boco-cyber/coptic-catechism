require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { BookAr, ChapterAr, QuestionAr } = require('../models');
const { seedArabicContent } = require('./seedArabic');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const [currentBooks, currentSections, currentQuestions] = await Promise.all([
    BookAr.countDocuments(),
    ChapterAr.countDocuments(),
    QuestionAr.countDocuments()
  ]);

  console.log('Arabic migration');
  console.log(`  current:  ${currentBooks} books, ${currentSections} sections, ${currentQuestions} questions`);

  const target = await seedArabicContent({ dryRun: true });
  console.log(`  target:   ${target.books} books, ${target.sections} sections, ${target.questions} questions`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to replace the Arabic catalogue.');
    await mongoose.connection.close();
    return;
  }

  await seedArabicContent();
  console.log('\nArabic catalogue replaced.');
  await mongoose.connection.close();
}

main().catch((error) => {
  console.error('Arabic migration failed:', error.message);
  process.exit(1);
});
