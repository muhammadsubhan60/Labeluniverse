const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    await resend.emails.send({
      from: 'Label Flow <noreply@labelflow.org>',
      to,
      subject,
      html,
    });
    console.log(`Email sent → ${to} | ${subject}`);
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
};

// ── Templates ──────────────────────────────────────────────────────────────

const vendorJobAssigned = (jobId, carrier, labelCount, portalUrl) => ({
  subject: `New Label Request — ${carrier} (${labelCount} labels)`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#1e293b;margin-bottom:8px;">New Label Generation Request</h2>
      <p style="color:#475569;">A new request has been assigned to your account:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Labels</td><td style="padding:10px 16px;color:#0f172a;">${labelCount}</td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
      </table>
      <p style="color:#475569;">Please log in to your portal to accept and process this request within <strong>1 hour</strong> of acceptance.</p>
      <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">View Request →</a>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">This is an automated notification. Do not reply to this email.</p>
    </div>
  `,
});

const vendorJobCancelled = (jobId, carrier, reason) => ({
  subject: `Request Cancelled — ${carrier} Job ${jobId}`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#dc2626;margin-bottom:8px;">Request Cancelled</h2>
      <p style="color:#475569;">The following job has been cancelled and removed from your queue:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        ${reason ? `<tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Reason</td><td style="padding:10px 16px;color:#0f172a;">${reason}</td></tr>` : ''}
      </table>
      <p style="color:#94a3b8;font-size:12px;">This is an automated notification.</p>
    </div>
  `,
});

const vendorUploadRejected = (jobId, carrier, reason) => ({
  subject: `Upload Rejected — Please Re-upload (${carrier} Job ${jobId})`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#d97706;margin-bottom:8px;">Upload Rejected</h2>
      <p style="color:#475569;">Your uploaded file for the following job has been rejected:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        ${reason ? `<tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Reason</td><td style="padding:10px 16px;color:#0f172a;">${reason}</td></tr>` : ''}
      </table>
      <p style="color:#475569;">Please review the issue and re-upload the corrected file via your portal.</p>
      <p style="color:#94a3b8;font-size:12px;">This is an automated notification.</p>
    </div>
  `,
});

const userLabelsReady = (userName, jobId, carrier, labelCount, downloadUrl) => ({
  subject: `Your ${carrier} Labels Are Ready — Download Now`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#059669;margin-bottom:8px;">Your Labels Are Ready!</h2>
      <p style="color:#475569;">Hello ${userName},</p>
      <p style="color:#475569;">Your label generation request has been completed and approved:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Labels</td><td style="padding:10px 16px;color:#0f172a;">${labelCount}</td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
      </table>
      <p style="color:#475569;">Please download your labels and ship within the required timeframe.</p>
      <a href="${downloadUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Download Labels →</a>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">LABEL FLOW</p>
    </div>
  `,
});

const CATEGORY_LABEL = { general: 'General', service: 'Service Update', pricing: 'Pricing', maintenance: 'Maintenance' };
const CATEGORY_COLOR = { general: '#2563EB', service: '#16A34A', pricing: '#D97706', maintenance: '#DC2626' };

const announcementNotification = (userName, title, content, category, portalUrl) => {
  const catLabel = CATEGORY_LABEL[category] || 'General';
  const catColor = CATEGORY_COLOR[category] || '#2563EB';
  return {
    subject: `[LABEL FLOW] ${catLabel}: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;">
        <div style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="height:4px;background:${catColor};"></div>
          <div style="padding:24px;">
            <div style="display:inline-block;padding:3px 12px;border-radius:99px;background:${catColor}18;color:${catColor};font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border:1px solid ${catColor}33;margin-bottom:14px;">
              ${catLabel}
            </div>
            <h2 style="color:#0f172a;margin:0 0 12px;font-size:20px;line-height:1.3;">${title}</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">${content}</p>
            <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 24px;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px;">View Announcement →</a>
          </div>
        </div>
        <p style="margin-top:16px;color:#94a3b8;font-size:11px;text-align:center;">
          Hello ${userName} — you're receiving this because you have announcement emails enabled.<br/>
          You can turn this off in your <a href="${portalUrl}/profile" style="color:#64748b;">profile settings</a>.
        </p>
      </div>
    `,
  };
};

module.exports = { sendEmail, vendorJobAssigned, vendorJobCancelled, vendorUploadRejected, userLabelsReady, announcementNotification };
