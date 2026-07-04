const nodemailer = require("nodemailer");

function getMailConfig() {
  return {
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM),
    hostConfigured: Boolean(process.env.SMTP_HOST),
    portConfigured: Boolean(process.env.SMTP_PORT),
    authConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
  };
}

function getTransporter() {
  const config = getMailConfig();
  if (!config.enabled) {
    return null;
  }

  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      : undefined
  });
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      provider: "mock",
      accepted: [to],
      messageId: `mock-${Date.now()}`,
      simulated: true
    };
  }

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });

  return {
    provider: "smtp",
    accepted: result.accepted,
    rejected: result.rejected,
    messageId: result.messageId,
    simulated: false
  };
}

module.exports = {
  getMailConfig,
  sendEmail
};
