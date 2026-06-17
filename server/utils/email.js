const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send email function
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"LABEL UNIVERSE" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

// Email templates
const emailTemplates = {
  fileUploaded: (userName, fileName, fileType) => ({
    subject: `New ${fileType} File Uploaded - LABEL UNIVERSE`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">New File Upload Notification</h2>
        <p>Hello Admin,</p>
        <p><strong>${userName}</strong> has uploaded a new <strong>${fileType}</strong> file:</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>File Name:</strong> ${fileName}</p>
          <p><strong>Uploaded By:</strong> ${userName}</p>
          <p><strong>Upload Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Please process this file and upload the generated labels within 1-2 hours.</p>
        <a href="${process.env.CLIENT_URL}/admin/files" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Files</a>
        <br><br>
        <p>Best regards,<br>LABEL UNIVERSE System</p>
      </div>
    `
  }),

  labelsGenerated: (userName, fileName, downloadUrl) => ({
    subject: `Your Labels Are Ready - LABEL UNIVERSE`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Labels Ready for Download</h2>
        <p>Hello ${userName},</p>
        <p>Great news! Your labels have been processed and are ready for download.</p>
        <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
          <p><strong>Original File:</strong> ${fileName}</p>
          <p><strong>Status:</strong> Completed</p>
          <p><strong>Processed At:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Click the button below to download your labels:</p>
        <a href="${downloadUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Download Labels</a>
        <br><br>
        <p>If you have any questions, please contact the admin.</p>
        <p>Best regards,<br>LABEL UNIVERSE Team</p>
      </div>
    `
  }),

  userCreated: (userName, email, password, role) => ({
    subject: `Welcome to LABEL UNIVERSE - Account Created`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Welcome to LABEL UNIVERSE!</h2>
        <p>Hello ${userName},</p>
        <p>Your account has been created successfully. Here are your login credentials:</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Password:</strong> ${password}</p>
          <p><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
        </div>
        <p>Please login and change your password for security reasons.</p>
        <a href="${process.env.CLIENT_URL}/login" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login Now</a>
        <br><br>
        <p>Best regards,<br>LABEL UNIVERSE Team</p>
      </div>
    `
  }),

  passwordReset: (userName, resetUrl) => ({
    subject: `Password Reset Request - LABEL UNIVERSE`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Password Reset Request</h2>
        <p>Hello ${userName},</p>
        <p>You requested a password reset for your LABEL UNIVERSE account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
        <p style="margin-top: 20px; color: #6c757d; font-size: 14px;">This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <br>
        <p>Best regards,<br>LABEL UNIVERSE Team</p>
      </div>
    `
  })
};

module.exports = {
  sendEmail,
  emailTemplates
};
