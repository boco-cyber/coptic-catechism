require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { seedEnglishContent } = require('./seedEnglish');

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB. Starting English seed...\n');

  const result = await seedEnglishContent();
  console.log('Seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Books:         ${result.books}`);
  console.log(`  Chapters:      ${result.chapters}`);
  console.log(`  Questions:     ${result.questions}`);
  console.log(`  Content blocks:${result.contentBlocks}`);
  console.log(`  Issues:        ${result.issues}`);
  console.log('─────────────────────────────────────');

  await mongoose.connection.close();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
