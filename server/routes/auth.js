const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User           = require('../models/User');
const Balance        = require('../models/Balance');
const Rate           = require('../models/Rate');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sendMail, otpEmailHtml, resetPasswordHtml } = require('../services/email');

const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'https://labelflow.org';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function validatePassword(password) {
  if (!password || password.length < 5) return 'Password must be at least 5 characters';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) return 'Password must contain at least one special character';
  return null;
}

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email } = req.body;

    let user = await User.findOne({ email });

    if (user && user.emailVerified) {
      return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    const otp     = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    if (user) {
      // Re-registration attempt — update OTP
      user.firstName = firstName;
      user.lastName  = lastName;
      user.otp       = otpHash;
      user.otpExpire = otpExpire;
      await user.save();
    } else {
      // Assign self-registered users to the main admin's tenant so they appear in the admin panel
      const mainAdmin = await User.findOne({ email: 'admin@uspslabelportal.com' }).select('_id').lean();
      user = await User.create({
        firstName, lastName, email,
        role: 'user',
        tenantId: mainAdmin?._id || null,
        emailVerified: false,
        otp: otpHash,
        otpExpire,
      });
      await Balance.create({ user: user._id, currentBalance: 0, transactions: [] });
      await Rate.create({ user: user._id, labelRate: 1.00, setBy: user._id, notes: 'Default rate' });
    }

    try {
      await sendMail({
        to:      user.email,
        subject: 'Your Label Flow verification code',
        html:    otpEmailHtml(user.firstName, otp),
      });
    } catch (mailErr) {
      console.error('OTP email failed:', mailErr.message);
    }

    res.status(201).json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────
router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      otp:       hashOtp(otp),
      otpExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code. Please try again.' });
    }

    user.emailVerified = true;
    user.otp           = undefined;
    user.otpExpire     = undefined;
    await user.save();

    // Short-lived token scoped to password setup only
    const setupToken = jwt.sign(
      { id: user._id, purpose: 'password-setup' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ setupToken, firstName: user.firstName });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

// ── POST /api/auth/set-password ───────────────────────────────
router.post('/set-password', [
  body('setupToken').notEmpty().withMessage('Setup token required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { setupToken, password } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Setup session expired. Please verify your email again.' });
    }

    if (decoded.purpose !== 'password-setup') {
      return res.status(400).json({ message: 'Invalid setup token.' });
    }

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ message: pwError });

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.password = password;
    await user.save();

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: 'Password set successfully.',
      token,
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     user.email,
        role:      user.role,
        fullName:  user.fullName,
      },
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ message: 'Server error during password setup' });
  }
});

// ── POST /api/auth/resend-otp ─────────────────────────────────
router.post('/resend-otp', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
], async (req, res) => {
  const SAFE_RESPONSE = { message: 'If your account exists and is unverified, a new code has been sent.' };
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.emailVerified) return res.json(SAFE_RESPONSE);

    const otp = generateOtp();
    user.otp       = hashOtp(otp);
    user.otpExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
      await sendMail({
        to:      user.email,
        subject: 'Your Label Flow verification code',
        html:    otpEmailHtml(user.firstName, otp),
      });
    } catch (mailErr) {
      console.error('Resend OTP email failed:', mailErr.message);
      return res.status(500).json({ message: 'Failed to send code. Please try again.' });
    }

    res.json(SAFE_RESPONSE);
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Please contact admin.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email first.',
        needsVerification: true,
        email: user.email,
      });
    }

    if (!user.password) {
      return res.status(403).json({
        message: 'Please complete your account setup.',
        needsVerification: true,
        email: user.email,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     user.email,
        role:      user.role,
        fullName:  user.fullName,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     user.email,
        role:      user.role,
        fullName:  user.fullName,
        lastLogin: user.lastLogin,
        isActive:  user.isActive,
        createdAt: user.createdAt,
        clients:   user.clients || [],
        ccAccess:  user.ccAccess
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error getting user info' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  const SAFE_RESPONSE = { message: 'If an account with that email exists, a password reset link has been sent.' };
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json(SAFE_RESPONSE);

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}`;
    try {
      await sendMail({
        to:      user.email,
        subject: 'Password Reset Request — Label Flow',
        html:    resetPasswordHtml(user.firstName, resetUrl),
      });
    } catch (mailErr) {
      console.error('Password reset email failed:', mailErr.message);
      user.resetPasswordToken  = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }

    res.json(SAFE_RESPONSE);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { token, password } = req.body;

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ message: pwError });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:  hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.password            = password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. Please sign in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful' });
});

module.exports = router;
