const fs = require("node:fs");
const { execSync } = require("node:child_process");

function fail(message) {
  console.error(`Deploy guard failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`${filePath} is missing`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${filePath} is not valid JSON: ${error.message}`);
  }
}

const railwayJson = readJson("railway.json");
const deploy = railwayJson.deploy || {};

if (String(deploy.startCommand || "").trim() !== "npm start") {
  fail("railway.json deploy.startCommand must be 'npm start'");
}

if (String(deploy.restartPolicyType || "").trim() !== "ON_FAILURE") {
  fail("railway.json deploy.restartPolicyType must be 'ON_FAILURE'");
}

const forbiddenTrackedPaths = [
  "railway.toml",
  "Dockerfile",
  "deploy.config.json",
  ".stripe-installer/deploy-manifest.json",
  ".stripe-installer/stripe-manifest.json",
];

const trackedFiles = execSync("git ls-files", { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const path of forbiddenTrackedPaths) {
  if (trackedFiles.includes(path)) {
    fail(`${path} must not be tracked in git`);
  }
}

console.log("Deploy guard passed.");
