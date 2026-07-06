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
  fail("nixpacks.toml is required to force the Node build provider on Railway");
}

const nixpacksToml = fs.readFileSync(nixpacksTomlPath, "utf8");
if (!/providers\s*=\s*\[[^\]]*['"]node['"][^\]]*\]/i.test(nixpacksToml)) {
  fail("nixpacks.toml must explicitly set providers = ['node']");
}

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
  "DJANGO_README.md",
  "Dockerfile.django",
  "Procfile.django",
  "manage.py",
  "requirements.txt",
  "campaigns/__init__.py",
  "campaigns/admin.py",
  "campaigns/apps.py",
  "campaigns/models.py",
  "campaigns/serializers.py",
  "campaigns/urls.py",
  "campaigns/views.py",
  "campaigns/migrations/__init__.py",
  "dsac/__init__.py",
  "dsac/celery.py",
  "dsac/settings.py",
  "dsac/urls.py",
  "dsac/wsgi.py",
  "emails/__init__.py",
  "emails/admin.py",
  "emails/apps.py",
  "emails/models.py",
  "emails/serializers.py",
  "emails/services.py",
  "emails/tasks.py",
  "emails/urls.py",
  "emails/views.py",
  "emails/migrations/__init__.py",
  "payments/__init__.py",
  "payments/admin.py",
  "payments/apps.py",
  "payments/models.py",
  "payments/serializers.py",
  "payments/urls.py",
  "payments/views.py",
  "payments/migrations/__init__.py",
  "prospects/__init__.py",
  "prospects/admin.py",
  "prospects/apps.py",
  "prospects/models.py",
  "prospects/serializers.py",
  "prospects/urls.py",
  "prospects/views.py",
  "prospects/migrations/__init__.py",
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
