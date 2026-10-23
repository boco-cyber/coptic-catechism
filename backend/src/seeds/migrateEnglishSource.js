require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const {
  Book,
  Chapter,
  Question,
  EnglishContentBlock,
  EnglishExtractionIssue
} = require('../models');
const { seedEnglishContent } = require('./seedEnglish');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const [books, chapters, questions, contentBlocks, issues] =
    await Promise.all([
      Book.countDocuments(),
      Chapter.countDocuments(),
      Question.countDocuments(),
      EnglishContentBlock.countDocuments(),
      EnglishExtractionIssue.countDocuments()
    ]);

  console.log('English migration');
  console.log(
    `  current:  ${books} books, ${chapters} chapters, ${questions} questions, ` +
    `${contentBlocks} content blocks, ${issues} issues`
  );

  const target = await seedEnglishContent({ dryRun: true });
  console.log(
    `  target:   ${target.books} books, ${target.chapters} chapters, ` +
    `${target.questions} questions, ${target.contentBlocks} content blocks, ` +
    `${target.issues} issues`
  );

  if (!apply) {
    console.log(
      '\nDry run only. Re-run with --apply to replace the English catalogue.'
    );
    await mongoose.connection.close();
    return;
  }

  await seedEnglishContent();
  console.log('\nEnglish catalogue replaced.');
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error('English migration failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
