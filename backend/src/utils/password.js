const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Password must be a string of at least 8 characters');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword, SALT_ROUNDS };
