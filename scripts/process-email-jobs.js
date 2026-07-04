const { processDueEmailJobs } = require("../src/services/sequenceProcessor");

processDueEmailJobs(500)
  .then((result) => {
    console.log(`Processed ${result.processed} jobs. Sent=${result.sent} Failed=${result.failed}`);
  })
  .catch((error) => {
    console.error("Failed to process email jobs:", error.message);
    process.exitCode = 1;
  });
