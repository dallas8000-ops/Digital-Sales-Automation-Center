const { readDb, writeDb } = require("../db");
const { sendEmail } = require("./mailService");

function findProspect(db, prospectId) {
  return db.prospects.find((item) => item.id === prospectId);
}

async function processDueEmailJobs(limit = 100) {
  const db = readDb();
  const now = Date.now();

  const due = db.emailJobs
    .filter((job) => job.status === "pending" && new Date(job.scheduledAt).getTime() <= now)
    .slice(0, limit);

  const results = [];

  for (const job of due) {
    const prospect = findProspect(db, job.prospectId);

    if (!prospect || !prospect.email) {
      job.status = "failed";
      job.error = "Prospect not found or missing email";
      job.processedAt = new Date().toISOString();
      results.push({ jobId: job.id, status: job.status, error: job.error });
      continue;
    }

    try {
      const sendResult = await sendEmail({
        to: prospect.email,
        subject: job.subject,
        text: job.body
      });

      job.status = "sent";
      job.processedAt = new Date().toISOString();
      job.delivery = sendResult;

      db.emailEvents.push({
        id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        createdAt: new Date().toISOString(),
        type: "email.sent",
        campaignId: job.campaignId,
        prospectId: job.prospectId,
        delivery: sendResult
      });

      results.push({
        jobId: job.id,
        status: job.status,
        messageId: sendResult.messageId,
        simulated: sendResult.simulated
      });
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.processedAt = new Date().toISOString();
      results.push({ jobId: job.id, status: job.status, error: error.message });
    }
  }

  if (due.length > 0) {
    writeDb(db);
  }

  return {
    processed: results.length,
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    results
  };
}

module.exports = {
  processDueEmailJobs
};
