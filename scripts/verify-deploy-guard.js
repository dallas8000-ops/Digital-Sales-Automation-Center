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

const nixpacksTomlPath = "nixpacks.toml";
if (!fs.existsSync(nixpacksTomlPath)) {
  fail("nixpacks.toml is required to force the Python build provider on Railway");
}

const nixpacksToml = fs.readFileSync(nixpacksTomlPath, "utf8");
if (!/providers\s*=\s*\[[^\]]*['"]python['"][^\]]*\]/i.test(nixpacksToml)) {
  fail("nixpacks.toml must explicitly set providers = ['python']");
}

if (!String(deploy.startCommand || "").includes("python manage.py runserver")) {
  fail("railway.json deploy.startCommand must run Django via 'python manage.py runserver'");
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

const trackedFiles = new Set(
  execSync("git ls-files", { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);

for (const path of forbiddenTrackedPaths) {
  if (trackedFiles.has(path) && fs.existsSync(path)) {
    fail(`${path} must not be tracked in git`);
  }
}

console.log("Deploy guard passed.");
