const express = require('express');
const crypto  = require('crypto');
const { body, validationResult } = require('express-validator');
const User           = require('../models/User');
const Balance        = require('../models/Balance');
const Rate           = require('../models/Rate');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sendMail, verifyEmailHtml, resetPasswordHtml } = require('../services/email');

const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'https://labelflow.org';

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Public registration always creates role:'user', unverified until email confirmed.
    const user = await User.create({ firstName, lastName, email, password, role: 'user', emailVerified: false });

    await Balance.create({ user: user._id, currentBalance: 0, transactions: [] });
    await Rate.create({ user: user._id, labelRate: 1.00, setBy: user._id, notes: 'Default rate' });

    // Generate email verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(verifyToken).digest('hex');
    user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    const verifyUrl = `${CLIENT_URL}/verify-email?token=${verifyToken}`;
    try {
      await sendMail({
        to:      user.email,
        subject: 'Verify your Label Universe account',
        html:    verifyEmailHtml(user.firstName, verifyUrl),
      });
    } catch (mailErr) {
      console.error('Verification email failed to send:', mailErr.message);
    }

    res.status(201).json({ message: 'Account created! Please check your email to verify your account before signing in.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
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
        message: 'Please verify your email address before signing in.',
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
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
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
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        lastLogin: user.lastLogin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        clients: user.clients || [],
        ccAccess: user.ccAccess
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error getting user info' });
  }
});

// ── POST /api/auth/verify-email ───────────────────────────────
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const { token } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken:  hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification link.' });
    }

    user.emailVerified            = true;
    user.emailVerificationToken   = undefined;
    user.emailVerificationExpire  = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ message: 'Server error during email verification' });
  }
});

// ── POST /api/auth/resend-verification ───────────────────────
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
], async (req, res) => {
  const SAFE_RESPONSE = { message: 'If your account exists and is unverified, a new verification link has been sent.' };
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Valid email required' });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.emailVerified) {
      return res.json(SAFE_RESPONSE);
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken  = crypto.createHash('sha256').update(verifyToken).digest('hex');
    user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    const verifyUrl = `${CLIENT_URL}/verify-email?token=${verifyToken}`;
    try {
      await sendMail({
        to:      user.email,
        subject: 'Verify your Label Universe account',
        html:    verifyEmailHtml(user.firstName, verifyUrl),
      });
    } catch (mailErr) {
      console.error('Resend verification email failed:', mailErr.message);
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    res.json(SAFE_RESPONSE);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error' });
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

    if (!user) {
      return res.json(SAFE_RESPONSE);
    }

    // Generate reset token — store only the hashed version
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}`;
    try {
      await sendMail({
        to:      user.email,
        subject: 'Password Reset Request — Label Universe',
        html:    resetPasswordHtml(user.firstName, resetUrl),
      });
    } catch (mailErr) {
      console.error('Password reset email failed to send:', mailErr.message);
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
  body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { token, password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:  hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password            = password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. Please login with your new password.' });
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
