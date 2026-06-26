const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

function verifyEmailHtml(firstName, verifyUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4fb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,15,31,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 60%,#1e3a8a 100%);padding:28px 40px;">
          <span style="font-size:1.1rem;font-weight:800;color:#fff;letter-spacing:-0.4px;">Label Universe</span>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;font-size:1.2rem;font-weight:800;color:#0a0f1f;">Verify your email, ${firstName}</h2>
          <p style="margin:0 0 28px;color:#64748b;font-size:0.9rem;line-height:1.65;">Thanks for creating your Label Universe account. Click the button below to verify your email address and get started.</p>
          <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:700;font-size:0.9rem;text-decoration:none;border-radius:10px;">Verify Email Address</a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:0.78rem;">This link expires in <strong>24 hours</strong>. If you didn't create this account, ignore this email.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e6eaf5;">
          <p style="margin:0;color:#94a3b8;font-size:0.75rem;">Or copy this link into your browser:<br><a href="${verifyUrl}" style="color:#6366f1;word-break:break-all;font-size:0.72rem;">${verifyUrl}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function resetPasswordHtml(firstName, resetUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f4fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4fb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,15,31,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 60%,#1e3a8a 100%);padding:28px 40px;">
          <span style="font-size:1.1rem;font-weight:800;color:#fff;letter-spacing:-0.4px;">Label Universe</span>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;font-size:1.2rem;font-weight:800;color:#0a0f1f;">Reset your password, ${firstName}</h2>
          <p style="margin:0 0 28px;color:#64748b;font-size:0.9rem;line-height:1.65;">We received a request to reset the password for your Label Universe account. Click the button below to choose a new password.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:700;font-size:0.9rem;text-decoration:none;border-radius:10px;">Reset Password</a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:0.78rem;">This link expires in <strong>10 minutes</strong>. If you didn't request a password reset, ignore this email — your password will not change.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e6eaf5;">
          <p style="margin:0;color:#94a3b8;font-size:0.75rem;">Or copy this link into your browser:<br><a href="${resetUrl}" style="color:#6366f1;word-break:break-all;font-size:0.72rem;">${resetUrl}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, html }) {
  await resend.emails.send({
    from: 'Label Universe <noreply@labelflow.org>',
    to,
    subject,
    html,
  });
}

module.exports = { sendMail, verifyEmailHtml, resetPasswordHtml };
