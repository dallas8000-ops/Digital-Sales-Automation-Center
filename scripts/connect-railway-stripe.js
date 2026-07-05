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
    skipRailwayLink: false,
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

    if (arg === "--skip-railway-link") {
      out.skipRailwayLink = true;
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
    shell: false,
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
    shell: false
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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "content-type": "application/json"
  };

  if (options.headers && typeof options.headers === "object") {
    Object.assign(headers, options.headers);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      body: payload,
      raw: text
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyDeploymentRoutes(publicUrl) {
  const healthUrl = `${publicUrl}/api/health`;
  const health = await fetchJsonWithTimeout(healthUrl, { method: "GET" });

  if (!health.ok || health.body?.ok !== true) {
    throw new Error(
      `Railway deployment is reachable but /api/health is invalid (${health.status}). ` +
        "This usually means the wrong service was linked/deployed."
    );
  }

  const webhookUrl = `${publicUrl}/api/stripe/webhook`;
  const webhook = await fetchJsonWithTimeout(webhookUrl, {
    method: "POST",
    body: JSON.stringify({ dryRun: true })
  });

  const routeExists = webhook.status === 400 || webhook.status === 503;
  if (!routeExists) {
    throw new Error(
      `Railway deployment is missing expected Stripe webhook route at ${webhookUrl} ` +
        `(status ${webhook.status}).`
    );
  }
}

function runRailwaySetWithRetry(pair, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      run("railway", ["variables", "set", pair]);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Railway variable set failed (attempt ${attempt}/${maxAttempts}) for ${pair.split("=")[0]}.`);
    }
  }

  throw lastError || new Error(`Unable to set Railway variable: ${pair.split("=")[0]}`);
}

async function verifyWebhookSecretSync(publicUrl) {
  const settingsUrl = `${publicUrl}/api/settings/env`;
  const settings = await fetchJsonWithTimeout(settingsUrl, { method: "GET" });

  if (!settings.ok || !settings.body?.integrations?.stripe) {
    throw new Error(`Could not verify webhook synchronization via ${settingsUrl} (status ${settings.status}).`);
  }

  if (!settings.body.integrations.stripe.hasWebhookSecret) {
    throw new Error(
      "Webhook secret is still not visible in deployed app config after Railway sync/deploy. " +
        "Check service linkage, environment scope, and last deployment status."
    );
  }
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

  if (!args.skipRailwayLink) {
    console.log("Link this folder to your Railway project/service if prompted...");
    run("railway", ["link"]);
  } else {
    console.log("Skipping railway link (using current linked project/service).");
  }

  const railwayVarPairs = buildRailwayVars(getVar, args.publicUrl);
  if (railwayVarPairs.length > 0) {
    console.log(`Setting ${railwayVarPairs.length} Railway environment variables...`);
    for (const pair of railwayVarPairs) {
      runRailwaySetWithRetry(pair);
    }
  } else {
    console.log("No local env values found to set on Railway (except computed URLs).");
  }

  let webhookSecret = "";
  if (!args.skipStripeWebhook) {
    webhookSecret = await createStripeWebhookIfPossible(getVar, args.publicUrl);
  }

  if (webhookSecret) {
    console.log("Saving STRIPE_WEBHOOK_SECRET into Railway variables...");
    runRailwaySetWithRetry(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  }

  if (!args.skipDeploy) {
    console.log("Deploying to Railway...");
    run("railway", ["up"]);

    console.log("Verifying deployed API routes...");
    await verifyDeploymentRoutes(args.publicUrl);

    if (webhookSecret) {
      console.log("Verifying webhook secret synchronization in deployed app config...");
      await verifyWebhookSecretSync(args.publicUrl);
    }
  } else if (webhookSecret) {
    console.log("Skipped deploy, so webhook secret synchronization could not be runtime-verified.");
  }

  console.log("Done. Railway + Stripe setup automation completed.");
  console.log("Tip: In Stripe Dashboard, verify webhook endpoint status and test events.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
