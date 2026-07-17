require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { User } = require('../models');
const { hashPassword } = require('../utils/password');

function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function _writeToOutput(text) {
      rl.output.write(text === question ? text : '*'.repeat(text.length));
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const deleteIndex = args.indexOf('--delete');

  await connectDB();

  if (deleteIndex !== -1) {
    const username = args[deleteIndex + 1];
    if (!username) {
      console.error('Usage: node createAdmin.js --delete <username>');
      process.exitCode = 1;
      await mongoose.disconnect();
      return;
    }
    const result = await User.deleteOne({ username: username.trim().toLowerCase() });
    console.log(result.deletedCount ? `Deleted admin "${username}".` : `No admin found with username "${username}".`);
    await mongoose.disconnect();
    return;
  }

  const username = args[0];
  if (!username) {
    console.error('Usage: node createAdmin.js <username>');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const password = await promptPassword(`Password for "${username}": `);
  const passwordHash = await hashPassword(password);
  await User.findOneAndUpdate(
    { username: username.trim().toLowerCase() },
    { $set: { passwordHash } },
    { upsert: true, new: true }
  );
  console.log(`Admin "${username}" is ready to log in.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await mongoose.disconnect();
});
