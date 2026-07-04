const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const Stripe = require("stripe");

const ROOT_DIR = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");

function parseArgs(argv) {
  const out = {
    publicUrl: "",
    skipDeploy: false,
    skipRailwayLogin: false,
    skipStripeWebhook: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--public-url") {
      out.publicUrl = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (arg === "--skip-deploy") {
      out.skipDeploy = true;
      continue;
    }

    if (arg === "--skip-railway-login") {
      out.skipRailwayLogin = true;
      continue;
    }

    if (arg === "--skip-stripe-webhook") {
      out.skipStripeWebhook = true;
    }
  }

  return out;
}

function isTruthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], {
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    throw new Error(stderr || `Command failed: ${command} ${args.join(" ")}`);
  }

  return String(result.stdout || "").trim();
}

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(ENV_PATH, "utf8");
  return dotenv.parse(raw);
}

function buildValueLookup(fileVars) {
  return (key) => {
    if (process.env[key] !== undefined) {
      return String(process.env[key]);
    }
    if (fileVars[key] !== undefined) {
      return String(fileVars[key]);
    }
    return "";
  };
}

function assertPublicUrl(url) {
  if (!url) {
    throw new Error("Missing --public-url. Example: npm run connect:railway-stripe -- --public-url https://your-app.up.railway.app");
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("--public-url must be https");
    }
  } catch (error) {
    throw new Error(`Invalid --public-url: ${error.message}`);
  }
}

function buildRailwayVars(getVar, publicUrl) {
  const successUrl = `${publicUrl}/proposals.html?payment=success`;
  const cancelUrl = `${publicUrl}/proposals.html?payment=cancel`;

  const pairs = {
    STRIPE_SECRET_KEY: getVar("STRIPE_SECRET_KEY"),
    STRIPE_PUBLISHABLE_KEY: getVar("STRIPE_PUBLISHABLE_KEY"),
    STRIPE_SUCCESS_URL: successUrl,
    STRIPE_CANCEL_URL: cancelUrl,
    SMTP_HOST: getVar("SMTP_HOST"),
    SMTP_PORT: getVar("SMTP_PORT") || "587",
    SMTP_SECURE: getVar("SMTP_SECURE") || "false",
    SMTP_USER: getVar("SMTP_USER"),
    SMTP_PASS: getVar("SMTP_PASS"),
    SMTP_FROM: getVar("SMTP_FROM"),
    OPENAI_API_KEY: getVar("OPENAI_API_KEY"),
    OPENAI_MODEL: getVar("OPENAI_MODEL")
  };

  return Object.entries(pairs)
    .filter(([, value]) => String(value || "").trim() !== "")
    .map(([key, value]) => `${key}=${value}`);
}

async function createStripeWebhookIfPossible(getVar, publicUrl) {
  const stripeSecret = getVar("STRIPE_SECRET_KEY").trim();

  if (!stripeSecret) {
    console.log("Skipping Stripe webhook creation: STRIPE_SECRET_KEY is not set.");
    return "";
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2025-06-30.basil"
  });

  const url = `${publicUrl}/api/stripe/webhook`;
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ["checkout.session.completed"],
    description: "Digital Sales Automation Center webhook"
  });

  console.log(`Created Stripe webhook endpoint: ${endpoint.id}`);
  return endpoint.secret || "";
}

async function main() {
  const args = parseArgs(process.argv);
  assertPublicUrl(args.publicUrl);

  if (!commandExists("railway")) {
    throw new Error("Railway CLI is not installed. Install from https://docs.railway.com/develop/cli");
  }

  const fileVars = loadEnvFile();
  const getVar = buildValueLookup(fileVars);

  if (!args.skipRailwayLogin) {
    console.log("Opening Railway login flow...");
    run("railway", ["login"]);
  }

  console.log("Link this folder to your Railway project/service if prompted...");
  run("railway", ["link"]);

  const railwayVarPairs = buildRailwayVars(getVar, args.publicUrl);
  if (railwayVarPairs.length > 0) {
    console.log(`Setting ${railwayVarPairs.length} Railway environment variables...`);
    run("railway", ["variables", "set", ...railwayVarPairs]);
  } else {
    console.log("No local env values found to set on Railway (except computed URLs).");
  }

  let webhookSecret = "";
  if (!args.skipStripeWebhook) {
    webhookSecret = await createStripeWebhookIfPossible(getVar, args.publicUrl);
  }

  if (webhookSecret) {
    console.log("Saving STRIPE_WEBHOOK_SECRET into Railway variables...");
    run("railway", ["variables", "set", `STRIPE_WEBHOOK_SECRET=${webhookSecret}`]);
  }

  if (!args.skipDeploy) {
    console.log("Deploying to Railway...");
    run("railway", ["up"]);
  }

  console.log("Done. Railway + Stripe setup automation completed.");
  console.log("Tip: In Stripe Dashboard, verify webhook endpoint status and test events.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
