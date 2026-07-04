const { spawnSync } = require("node:child_process");

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = run(probe, [command]);
  return result.status === 0;
}

function checkRailwayAuth() {
  const result = run("railway", ["whoami"]);
  return result.status === 0;
}

function checkStripeAuth() {
  const result = run("stripe", ["whoami"]);
  return result.status === 0;
}

function main() {
  const failures = [];
  const warnings = [];

  if (!commandExists("railway")) {
    failures.push("Railway CLI is not installed. Install it before deployment.");
  } else if (!checkRailwayAuth()) {
    failures.push("Railway CLI is installed but not authenticated. Run: railway login");
  }

  if (!commandExists("stripe")) {
    failures.push("Stripe CLI is not installed. Install it before deployment.");
  } else if (!checkStripeAuth()) {
    failures.push("Stripe CLI is installed but not authenticated. Run: stripe login");
  }

  if (!String(process.env.DATABASE_PATH || "").trim()) {
    warnings.push(
      "DATABASE_PATH is not set. On Railway, use a persistent volume path (example: /data/db.json)."
    );
  }

  if (!String(process.env.ADMIN_API_TOKEN || "").trim()) {
    warnings.push("ADMIN_API_TOKEN is not set. Settings API will be disabled in production.");
  }

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  if (failures.length > 0) {
    console.error("Predeploy checks failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Predeploy checks passed.");
}

main();
