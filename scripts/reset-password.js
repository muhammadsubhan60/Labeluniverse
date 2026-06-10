/**
 * One-shot password reset script.
 * Usage: node scripts/reset-password.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../server/models/User');

const TARGET_EMAIL   = 'ixalicore@gmail.com';
const NEW_PASSWORD   = 'ixalicore@gmail.com';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: TARGET_EMAIL }).select('+password');
  if (!user) {
    console.error(`No user found with email: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  user.password = NEW_PASSWORD;
  await user.save(); // pre-save hook hashes the password

  console.log(`Password updated for ${user.email} (${user.firstName} ${user.lastName})`);
  await mongoose.disconnect();
})();
