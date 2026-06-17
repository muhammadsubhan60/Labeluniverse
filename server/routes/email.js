const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize } = require('../middleware/auth');


const router = express.Router();

// Dummy email sending function
const sendDummyEmail = async (emailData) => {
  console.log('📧 Dummy Email Sent:', {
    to: emailData.to,
    subject: emailData.subject,
    timestamp: new Date().toISOString()
  });
  return true;
};

// @route   POST /api/email/send
// @desc    Send custom email (admin only)
// @access  Private (Admin)
router.post('/send', authenticateToken, authorize('admin'), [
  body('to').isEmail().withMessage('Valid email address is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('html').notEmpty().withMessage('Email content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { to, subject, html } = req.body;

    await sendDummyEmail({ to, subject, html });

    res.json({
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      message: 'Server error sending email'
    });
  }
});

// @route   POST /api/email/broadcast
// @desc    Send broadcast email to all users (admin only)
// @access  Private (Admin)
router.post('/broadcast', authenticateToken, authorize('admin'), [
  body('subject').notEmpty().withMessage('Subject is required'),
  body('html').notEmpty().withMessage('Email content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { subject, html } = req.body;

    // In dummy mode, just log the broadcast
    console.log('📢 Broadcast Email:', {
      subject,
      recipients: 'All users',
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Broadcast email sent successfully'
    });

  } catch (error) {
    console.error('Broadcast email error:', error);
    res.status(500).json({
      message: 'Server error sending broadcast email'
    });
  }
});

// @route   POST /api/email/test
// @desc    Send test email (admin only)
// @access  Private (Admin)
router.post('/test', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    await sendDummyEmail({
      to: req.user.email,
      subject: 'Test Email - LABEL UNIVERSE',
      html: 'This is a test email from the LABEL UNIVERSE system.'
    });

    res.json({
      message: 'Test email sent successfully'
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      message: 'Server error sending test email'
    });
  }
});

module.exports = router;