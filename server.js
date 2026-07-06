const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
require("dotenv").config();
const {
  readDb,
  writeDb,
  ensureDb,
  insert,
  update,
  remove,
  appendActivity
} = require("./src/db");
const {
  generateColdEmail,
  generateFollowUp,
  assignProspectTier,
  suggestedProductForProspect
} = require("./src/services/automation");
const {
  detectWebsiteTechnology,
  buildSalesAssetPack,
  buildMarketingCalendar,
  buildEmailSequence
} = require("./src/services/salesPackage");
const { createCheckoutSession, verifyWebhook, getStripeConfig } = require("./src/services/stripeService");
const { sendEmail, getMailConfig } = require("./src/services/mailService");
const { processDueEmailJobs } = require("./src/services/sequenceProcessor");
const { getAiConfig, generateEmailDraftWithOpenAI } = require("./src/services/aiEmailService");
const { batchValidateProspects, validateProspect } = require("./src/services/validationService");

const app = express();
const port = process.env.PORT || 4000;
const sequenceDays = [1, 5, 12, 21];
const ENV_PATH = path.join(__dirname, ".env");
const SETTINGS_ADMIN_TOKEN = String(process.env.ADMIN_API_TOKEN || "").trim();
const ALLOW_RUNTIME_SECRET_UPDATES = String(process.env.ALLOW_RUNTIME_SECRET_UPDATES || "false").toLowerCase() === "true";
const MANAGED_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_API_VERSION",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SUCCESS_URL",
  "STRIPE_CANCEL_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "OPENAI_API_KEY",
  "OPENAI_MODEL"
];
const AI_AUTOMATION_DEFAULTS = {
  enabled: true,
  dailyLimit: 25,
  jobTitle: "CTO",
  tone: "consultative",
  resumeSummary:
    "Independent freelancer focused on production-ready automation, Stripe deployment flows, and measurable operational improvements.",
  lastDailyRunOn: null,
  lastRunSummary: null
};

function parseEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }

  const content = fs.readFileSync(ENV_PATH, "utf8");
  const map = {};

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map[key] = value.replace(/^"|"$/g, "");
  }

  return map;
}

function serializeEnv(map) {
  return Object.keys(map)
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((key) => {
      const value = String(map[key]);
      const safeValue = value.includes(" ") ? `"${value}"` : value;
      return `${key}=${safeValue}`;
    })
    .join("\n");
}

function readBearerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}

function requireSettingsAdmin(req, res, next) {
  const providedToken = readBearerToken(req) || String(req.headers["x-admin-token"] || "").trim();

  if (!ALLOW_RUNTIME_SECRET_UPDATES) {
    return res.status(403).json({
      error: "runtime secret updates are disabled"
    });
  }

  if (!SETTINGS_ADMIN_TOKEN) {
    return res.status(503).json({
      error: "runtime secret updates require ADMIN_API_TOKEN"
    });
  }

  if (!providedToken) {
    return res.status(401).json({ error: "missing admin token" });
  }

  if (providedToken !== SETTINGS_ADMIN_TOKEN) {
    return res.status(403).json({ error: "invalid admin token" });
  }

  return next();
}

ensureDb();

app.disable("x-powered-by");

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    const event = verifyWebhook(req.body, signature);

    if (!event) {
      return res.status(503).json({ error: "stripe webhook is not configured" });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const proposalId = session.metadata?.proposalId;

      if (proposalId) {
        const db = readDb();
        const proposal = db.proposals.find((item) => item.id === proposalId);

        if (proposal) {
          proposal.status = "paid";
          proposal.paymentStatus = "paid";
          proposal.paidAt = new Date().toISOString();
          proposal.stripeSessionId = session.id;
          proposal.updatedAt = new Date().toISOString();

          db.payments.push({
            id: `pay-${Date.now()}`,
            createdAt: new Date().toISOString(),
            proposalId,
            stripeSessionId: session.id,
            amountTotal: session.amount_total,
            currency: session.currency,
            status: session.payment_status
          });

          writeDb(db);
          appendActivity("payment.completed", `Stripe checkout completed for proposal ${proposalId}`, {
            proposalId,
            stripeSessionId: session.id
          });
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(400).json({ error: `webhook verification failed: ${error.message}` });
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function withScoring(prospect) {
  const scoring = assignProspectTier(prospect);
  return {
    ...prospect,
    score: scoring.score,
    tier: scoring.tier
  };
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoundedInt(value, defaultValue, minValue, maxValue) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(minValue, Math.min(maxValue, Math.trunc(parsed)));
}

function equalsIfSet(actual, expected) {
  if (!expected) {
    return true;
  }
  return normalizeString(actual) === expected;
}

function inScoreRange(score, minScore, maxScore) {
  const value = Number(score || 0);
  if (minScore !== null && value < minScore) {
    return false;
  }
  if (maxScore !== null && value > maxScore) {
    return false;
  }
  return true;
}

function matchesSearch(item, search) {
  if (!search) {
    return true;
  }

  const haystack = [
    item.company,
    item.firstName,
    item.lastName,
    item.email,
    item.industry,
    item.country,
    item.title,
    item.recommendedProduct,
    item.techStack
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function filterCampaigns(list, query = {}) {
  const search = normalizeString(query.search);
  const industry = normalizeString(query.targetIndustry);
  const status = normalizeString(query.status);
  const product = normalizeString(query.product);

  return list.filter((item) => {
    const matchesText =
      !search ||
      `${item.name || ""} ${item.product || ""} ${item.targetIndustry || ""}`.toLowerCase().includes(search);

    return (
      matchesText &&
      equalsIfSet(item.targetIndustry, industry) &&
      equalsIfSet(item.status, status) &&
      equalsIfSet(item.product, product)
    );
  });
}

function filterInquiries(list, query = {}) {
  const search = normalizeString(query.search);
  const status = normalizeString(query.status);
  const priority = normalizeString(query.priority);
  const sentiment = normalizeString(query.sentiment);

  return list.filter((item) => {
    const matchesText =
      !search ||
      `${item.name || ""} ${item.company || ""} ${item.email || ""} ${item.message || ""}`
        .toLowerCase()
        .includes(search);

    return (
      matchesText &&
      equalsIfSet(item.status, status) &&
      equalsIfSet(item.priority, priority) &&
      equalsIfSet(item.sentiment, sentiment)
    );
  });
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function removeMany(collection, ids) {
  const normalizedIds = normalizeIds(ids);

  if (normalizedIds.length === 0) {
    return {
      requested: 0,
      removed: 0,
      remaining: readDb()[collection].length
    };
  }

  const idSet = new Set(normalizedIds);
  const db = readDb();
  const before = db[collection].length;

  db[collection] = db[collection].filter((item) => !idSet.has(item.id));
  const removed = before - db[collection].length;

  if (removed > 0) {
    writeDb(db);
  }

  return {
    requested: normalizedIds.length,
    removed,
    remaining: db[collection].length
  };
}

function filterAndSortProspects(list, query = {}) {
  const search = normalizeString(query.search);
  const industry = normalizeString(query.industry);
  const country = normalizeString(query.country);
  const tier = normalizeString(query.tier);
  const stage = normalizeString(query.stage);
  const status = normalizeString(query.status);
  const product = normalizeString(query.product);
  const minScore = toNumberOrNull(query.minScore);
  const maxScore = toNumberOrNull(query.maxScore);

  let filtered = list.filter((item) => {
    return (
      matchesSearch(item, search) &&
      equalsIfSet(item.industry, industry) &&
      equalsIfSet(item.country, country) &&
      equalsIfSet(item.tier, tier) &&
      equalsIfSet(item.stage, stage) &&
      equalsIfSet(item.status, status) &&
      equalsIfSet(item.recommendedProduct, product) &&
      inScoreRange(item.score, minScore, maxScore)
    );
  });

  const sortBy = normalizeString(query.sortBy) || "score";
  const sortDir = normalizeString(query.sortDir) === "asc" ? 1 : -1;

  filtered = filtered.sort((a, b) => {
    let left;
    let right;

    if (sortBy === "company") {
      left = normalizeString(a.company);
      right = normalizeString(b.company);
    } else if (sortBy === "createdat") {
      left = new Date(a.createdAt || 0).getTime();
      right = new Date(b.createdAt || 0).getTime();
    } else {
      left = Number(a.score || 0);
      right = Number(b.score || 0);
    }

    if (left < right) return -1 * sortDir;
    if (left > right) return 1 * sortDir;
    return 0;
  });

  return filtered;
}

function asCsvValue(value) {
  const text = String(value === undefined || value === null ? "" : value);
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

function prospectsToCsv(list) {
  const columns = [
    "id",
    "company",
    "firstName",
    "lastName",
    "email",
    "title",
    "industry",
    "country",
    "techStack",
    "recommendedProduct",
    "score",
    "tier",
    "stage",
    "status",
    "createdAt"
  ];

  const rows = [columns.join(",")];

  for (const item of list) {
    rows.push(columns.map((column) => asCsvValue(item[column])).join(","));
  }

  return rows.join("\n");
}

function getAiAutomationConfig(db) {
  const current = db.config?.aiAutomation || {};
  const dailyLimit = Number(current.dailyLimit || AI_AUTOMATION_DEFAULTS.dailyLimit);

  return {
    ...AI_AUTOMATION_DEFAULTS,
    ...current,
    dailyLimit: Math.max(1, Math.min(200, Number.isFinite(dailyLimit) ? dailyLimit : AI_AUTOMATION_DEFAULTS.dailyLimit))
  };
}

function setAiAutomationConfig(db, partial = {}) {
  const next = {
    ...getAiAutomationConfig(db),
    ...partial
  };

  db.config = {
    ...db.config,
    aiAutomation: next
  };

  return next;
}

function buildNextBestAction(prospect) {
  const stage = normalizeString(prospect.stage) || "lead";
  const tier = normalizeString(prospect.tier) || "cold";
  const engagement = Number(prospect.engagementLevel || 0);

  if (stage === "lead" && tier === "hot") {
    return {
      action: "send-personalized-outreach",
      reason: "High lead score at early stage indicates strong outreach opportunity.",
      prompt: `Draft a concise professional outreach email to ${prospect.company} positioning ${prospect.recommendedProduct || "my automation services"}.`
    };
  }

  if ((stage === "contacted" || stage === "qualified") && engagement >= 10) {
    return {
      action: "book-demo",
      reason: "Engagement is strong enough to ask for a concrete meeting.",
      prompt: `Create a direct demo invitation for ${prospect.company} with two scheduling options and clear outcomes.`
    };
  }

  if (stage === "proposal") {
    return {
      action: "proposal-follow-up",
      reason: "Prospect is in proposal stage and benefits from implementation clarification.",
      prompt: `Write a follow-up that addresses deployment timeline, Stripe readiness, and implementation milestones for ${prospect.company}.`
    };
  }

  return {
    action: "nurture-sequence",
    reason: "Lead needs additional trust-building and education before a direct ask.",
    prompt: `Generate a short nurture touchpoint for ${prospect.company} focused on measurable automation wins in ${prospect.industry || "their industry"}.`
  };
}

function hasPendingJob(db, prospectId, kind) {
  return db.emailJobs.some((job) => {
    return (
      job.prospectId === prospectId &&
      job.status === "pending" &&
      normalizeString(job.jobKind || job.metadata?.kind) === normalizeString(kind)
    );
  });
}

function selectTopProspectsForAutomation(db, limit) {
  return db.prospects
    .map(withScoring)
    .filter((prospect) => {
      const stage = normalizeString(prospect.stage);
      const status = normalizeString(prospect.status);
      return (
        Boolean(prospect.email) &&
        stage !== "won" &&
        stage !== "lost" &&
        status !== "inactive" &&
        status !== "blocked"
      );
    })
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return Number(b.engagementLevel || 0) - Number(a.engagementLevel || 0);
    })
    .slice(0, limit);
}

async function runAiAutomationCycle(options = {}) {
  const db = readDb();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const settings = getAiAutomationConfig(db);
  const mode = options.mode || "manual";

  if (!settings.enabled) {
    return {
      skipped: true,
      reason: "AI automation is disabled",
      mode
    };
  }

  if (mode === "daily" && settings.lastDailyRunOn === today) {
    return {
      skipped: true,
      reason: "Daily automation already executed today",
      mode,
      lastDailyRunOn: settings.lastDailyRunOn
    };
  }

  const topProspects = selectTopProspectsForAutomation(db, Number(options.limit || settings.dailyLimit));
  const queuedOutreach = [];
  const queuedFollowUps = [];

  for (const prospect of topProspects) {
    if (hasPendingJob(db, prospect.id, "initial-outreach")) {
      continue;
    }

    const draft = await generateEmailDraftWithOpenAI({
      prospect,
      jobTitle: options.jobTitle || settings.jobTitle,
      resumeSummary: options.resumeSummary || settings.resumeSummary,
      tone: options.tone || settings.tone
    });

    const job = {
      id: `job-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      prospectId: prospect.id,
      campaignId: null,
      day: 0,
      subject: draft.subject,
      body: draft.body,
      scheduledAt: new Date().toISOString(),
      status: "pending",
      jobKind: "initial-outreach",
      metadata: {
        kind: "initial-outreach",
        source: "ai-automation",
        provider: draft.provider,
        model: draft.model,
        tone: draft.tone
      }
    };

    db.emailJobs.push(job);
    queuedOutreach.push({
      prospectId: prospect.id,
      company: prospect.company,
      subject: draft.subject,
      provider: draft.provider
    });
  }

  const followupCandidates = db.prospects
    .map(withScoring)
    .filter((prospect) => {
      const stage = normalizeString(prospect.stage);
      const engagement = Number(prospect.engagementLevel || 0);
      const hasSignalStage = stage === "contacted" || stage === "qualified" || stage === "proposal";
      return hasSignalStage && engagement >= 8 && Boolean(prospect.email);
    })
    .slice(0, Math.max(1, Math.min(100, Math.floor(topProspects.length / 2) || 5)));

  for (const prospect of followupCandidates) {
    if (hasPendingJob(db, prospect.id, "follow-up")) {
      continue;
    }

    const body = [
      `Hello ${prospect.firstName || "there"},`,
      "",
      `Following up on my earlier note for ${prospect.company}.`,
      "",
      "Based on your engagement signals, I can share a focused implementation plan and timeline tailored to your stack.",
      "",
      "Would a 20-minute walkthrough this week be useful?",
      "",
      "Regards,",
      "Barney R. Gilliom"
    ].join("\n");

    const job = {
      id: `job-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      prospectId: prospect.id,
      campaignId: null,
      day: 0,
      subject: `${prospect.company} | Follow-up`,
      body,
      scheduledAt: new Date().toISOString(),
      status: "pending",
      jobKind: "follow-up",
      metadata: {
        kind: "follow-up",
        source: "engagement-signal",
        stage: prospect.stage,
        engagementLevel: Number(prospect.engagementLevel || 0)
      }
    };

    db.emailJobs.push(job);
    queuedFollowUps.push({
      prospectId: prospect.id,
      company: prospect.company,
      stage: prospect.stage,
      engagementLevel: Number(prospect.engagementLevel || 0)
    });
  }

  let repliedInquiriesReviewed = 0;
  for (const inquiry of db.inquiries) {
    const signal = normalizeString(inquiry.status) === "replied" || normalizeString(inquiry.sentiment) === "positive";
    if (!signal) {
      continue;
    }

    repliedInquiriesReviewed += 1;
  }

  const recommendations = selectTopProspectsForAutomation(db, Number(options.recommendationLimit || 10)).map((prospect) => {
    const next = buildNextBestAction(prospect);
    return {
      prospectId: prospect.id,
      company: prospect.company,
      stage: prospect.stage,
      score: prospect.score,
      tier: prospect.tier,
      nextAction: next.action,
      reason: next.reason,
      prompt: next.prompt
    };
  });

  const summary = {
    mode,
    ranAt: new Date().toISOString(),
    topProspectsEvaluated: topProspects.length,
    outreachQueued: queuedOutreach.length,
    followUpsQueued: queuedFollowUps.length,
    repliedInquiriesReviewed,
    recommendations
  };

  const configUpdates = {
    lastRunSummary: summary
  };
  if (mode === "daily") {
    configUpdates.lastDailyRunOn = today;
  }
  setAiAutomationConfig(db, configUpdates);

  writeDb(db);

  appendActivity("ai.automation.cycle", `AI automation cycle executed (${mode})`, {
    topProspectsEvaluated: summary.topProspectsEvaluated,
    outreachQueued: summary.outreachQueued,
    followUpsQueued: summary.followUpsQueued
  });

  return summary;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "digital-sales-automation-center" });
});

app.get("/api/settings/env", (_req, res) => {
  return res.json({
    envFileExists: fs.existsSync(ENV_PATH),
    runtimeSecretUpdatesEnabled: ALLOW_RUNTIME_SECRET_UPDATES,
    managedKeys: MANAGED_ENV_KEYS,
    integrations: {
      stripe: getStripeConfig(),
      email: getMailConfig(),
      ai: getAiConfig()
    }
  });
});

app.post("/api/settings/env", requireSettingsAdmin, (req, res) => {
  const payload = req.body || {};
  const values = payload.values || {};
  const fileValues = parseEnvFile();
  let updates = 0;

  for (const key of MANAGED_ENV_KEYS) {
    if (!(key in values)) {
      continue;
    }

    const rawValue = values[key];
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") {
      delete fileValues[key];
      delete process.env[key];
      updates += 1;
      continue;
    }

    const safeValue = String(rawValue).trim();
    fileValues[key] = safeValue;
    process.env[key] = safeValue;
    updates += 1;
  }

  fs.writeFileSync(ENV_PATH, serializeEnv(fileValues) + "\n", "utf8");

  appendActivity("settings.updated", `Updated ${updates} integration settings`, {
    updates
  });

  return res.json({
    ok: true,
    updated: updates,
    integrations: {
      stripe: getStripeConfig(),
      email: getMailConfig(),
      ai: getAiConfig()
    }
  });
});

app.get("/api/config", (_req, res) => {
  const db = readDb();
  res.json(db.config);
});

app.get("/api/products", (_req, res) => {
  const db = readDb();
  res.json(db.products);
});

app.get("/api/prospects", (_req, res) => {
  const db = readDb();
  const prospects = db.prospects.map(withScoring);
  res.json(prospects);
});

app.get("/api/prospects/possible-clients", (req, res) => {
  const db = readDb();
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));

  const possibleClients = db.prospects
    .map(withScoring)
    .filter((item) => {
      const stage = normalizeString(item.stage);
      return stage !== "won" && stage !== "lost";
    })
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, limit);

  res.json({
    total: possibleClients.length,
    items: possibleClients
  });
});

app.get("/api/prospects/query", (req, res) => {
  const db = readDb();
  const all = db.prospects.map(withScoring);
  const filtered = filterAndSortProspects(all, req.query || {});

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.max(1, Math.min(500, Number(req.query.pageSize || 50)));
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages
  });
});

app.get("/api/prospects/export.csv", (req, res) => {
  const db = readDb();
  const all = db.prospects.map(withScoring);
  const filtered = filterAndSortProspects(all, req.query || {});
  const csv = prospectsToCsv(filtered);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=prospects-export.csv");
  res.send(csv);
});

app.post("/api/prospects", async (req, res) => {
  const payload = req.body || {};

  if (!payload.company || !payload.email) {
    return res.status(400).json({ error: "company and email are required" });
  }

  // Validation is REQUIRED - check if API key is available
  if (!process.env.HUNTER_API_KEY) {
    return res.status(400).json({
      error: "Data verification requires HUNTER_API_KEY in .env",
      reason: "API key not configured",
      mustVerify: true
    });
  }

  const recommendedProduct = payload.recommendedProduct || suggestedProductForProspect(payload);

  try {
    // Create temporary prospect object for validation
    const tempProspect = {
      ...payload,
      company: payload.company,
      email: payload.email,
      website: payload.website
    };

    // Validate email and domain FIRST - this is mandatory
    const validated = await validateProspect(tempProspect, {
      validateEmail: true,
      validateDomain: true,
      apiKey: process.env.HUNTER_API_KEY
    });

    // Check validation results - BOTH must be valid
    const emailValid = validated.validation?.email?.valid === true;
    const domainValid = validated.validation?.domain?.valid === true;

    // Reject if either email or domain failed validation
    if (!emailValid) {
      return res.status(422).json({
        error: "Data not confirmed",
        reason: "Email validation failed",
        email: payload.email,
        validation: {
          email: validated.validation?.email,
          domain: null
        },
        saved: false
      });
    }

    if (!domainValid) {
      return res.status(422).json({
        error: "Data not confirmed",
        reason: "Domain validation failed",
        company: payload.company,
        validation: {
          email: validated.validation?.email,
          domain: validated.validation?.domain
        },
        saved: false
      });
    }

    // Both validations passed - now save the prospect
    const prospect = insert("prospects", {
      ...payload,
      status: payload.status || "new",
      stage: payload.stage || "lead",
      engagementLevel: Number(payload.engagementLevel || 0),
      recommendedProduct,
      dataQuality: {
        isReal: true,
        isVerified: true,
        validation: {
          email: 'valid',
          domain: 'valid'
        },
        sources: ['manual-entry-verified'],
        verifiedAt: new Date().toISOString(),
        emailScore: validated.validation?.email?.score || null
      }
    });

    const scoredProspect = withScoring(prospect);

    appendActivity("prospect.created", `Real verified prospect added: ${scoredProspect.company}`, {
      prospectId: scoredProspect.id,
      score: scoredProspect.score,
      tier: scoredProspect.tier,
      emailValid: true,
      domainValid: true,
      source: 'verified'
    });

    return res.status(201).json(scoredProspect);

  } catch (error) {
    console.error("Prospect validation error:", error.message);
    
    return res.status(503).json({
      error: "Data not confirmed",
      reason: "Verification service error: " + error.message,
      saved: false,
      retryable: true
    });
  }
});

app.post("/api/ai/email-draft", async (req, res) => {
  const payload = req.body || {};
  const jobTitle = String(payload.jobTitle || "").trim();
  const resumeSummary = String(payload.resumeSummary || "").trim();
  const tone = String(payload.tone || "professional").trim();

  if (!payload.prospectId && !payload.company) {
    return res.status(400).json({ error: "prospectId or company is required" });
  }

  const db = readDb();
  let prospect = null;

  if (payload.prospectId) {
    prospect = db.prospects.find((item) => item.id === payload.prospectId) || null;
  }

  if (!prospect && payload.company) {
    prospect = {
      company: payload.company,
      firstName: payload.firstName || "",
      lastName: payload.lastName || "",
      email: payload.email || "",
      industry: payload.industry || "",
      title: payload.title || ""
    };
  }

  if (!prospect) {
    return res.status(404).json({ error: "prospect not found" });
  }

  try {
    const draft = await generateEmailDraftWithOpenAI({
      prospect,
      jobTitle,
      resumeSummary,
      tone
    });

    appendActivity("ai.email_draft.generated", `Generated AI draft for ${prospect.company}`, {
      prospectId: payload.prospectId || null,
      provider: draft.provider,
      model: draft.model
    });

    return res.json({
      prospect,
      draft
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/ai/automation/status", (_req, res) => {
  const db = readDb();
  const config = getAiAutomationConfig(db);
  const queuedOutreach = db.emailJobs.filter((job) => {
    return job.status === "pending" && normalizeString(job.jobKind || job.metadata?.kind) === "initial-outreach";
  }).length;
  const queuedFollowUps = db.emailJobs.filter((job) => {
    return job.status === "pending" && normalizeString(job.jobKind || job.metadata?.kind) === "follow-up";
  }).length;

  return res.json({
    config,
    queue: {
      outreach: queuedOutreach,
      followUps: queuedFollowUps,
      totalPending: db.emailJobs.filter((job) => job.status === "pending").length
    }
  });
});

app.post("/api/ai/automation/settings", (req, res) => {
  const payload = req.body || {};
  const db = readDb();
  const config = getAiAutomationConfig(db);

  const updates = {};
  if (payload.enabled !== undefined) {
    updates.enabled = Boolean(payload.enabled);
  }
  if (payload.dailyLimit !== undefined) {
    updates.dailyLimit = Math.max(1, Math.min(200, Number(payload.dailyLimit || config.dailyLimit)));
  }
  if (payload.jobTitle !== undefined) {
    updates.jobTitle = String(payload.jobTitle || "").trim() || config.jobTitle;
  }
  if (payload.tone !== undefined) {
    updates.tone = String(payload.tone || "").trim() || config.tone;
  }
  if (payload.resumeSummary !== undefined) {
    updates.resumeSummary = String(payload.resumeSummary || "").trim() || config.resumeSummary;
  }

  const saved = setAiAutomationConfig(db, updates);
  writeDb(db);

  appendActivity("ai.automation.settings.updated", "AI automation settings updated", {
    updates: Object.keys(updates)
  });

  return res.json({ config: saved });
});

app.post("/api/ai/automation/run", async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await runAiAutomationCycle({
      mode: "manual",
      limit: payload.limit,
      recommendationLimit: payload.recommendationLimit,
      tone: payload.tone,
      jobTitle: payload.jobTitle,
      resumeSummary: payload.resumeSummary
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/ai/pipeline-recommendations", (req, res) => {
  const db = readDb();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 12)));

  const items = selectTopProspectsForAutomation(db, limit).map((prospect) => {
    const next = buildNextBestAction(prospect);
    return {
      prospectId: prospect.id,
      company: prospect.company,
      contact: [prospect.firstName, prospect.lastName].filter(Boolean).join(" "),
      stage: prospect.stage,
      score: prospect.score,
      tier: prospect.tier,
      recommendedProduct: prospect.recommendedProduct,
      nextAction: next.action,
      reason: next.reason,
      prompt: next.prompt
    };
  });

  return res.json({
    total: items.length,
    items
  });
});

app.patch("/api/prospects/:id", (req, res) => {
  const updated = update("prospects", req.params.id, req.body || {});

  if (!updated) {
    return res.status(404).json({ error: "prospect not found" });
  }

  const scored = withScoring(updated);
  appendActivity("prospect.updated", `Prospect updated: ${scored.company}`, {
    prospectId: scored.id,
    stage: scored.stage,
    status: scored.status
  });

  return res.json(scored);
});

app.delete("/api/prospects/:id", (req, res) => {
  const deleted = remove("prospects", req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: "prospect not found" });
  }

  appendActivity("prospect.deleted", `Prospect deleted: ${req.params.id}`);
  return res.status(204).end();
});

app.post("/api/prospects/bulk-delete", (req, res) => {
  const result = removeMany("prospects", req.body?.ids);

  appendActivity("prospect.bulk_deleted", `Bulk delete executed for prospects`, {
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json(result);
});

app.post("/api/prospects/bulk-delete-by-query", (req, res) => {
  const db = readDb();
  const all = db.prospects.map(withScoring);
  const query = req.body?.query || {};
  const filtered = filterAndSortProspects(all, query);
  const ids = filtered.map((item) => item.id);
  const result = removeMany("prospects", ids);

  appendActivity("prospect.bulk_deleted", `Bulk delete executed for filtered prospects`, {
    matched: filtered.length,
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json({
    ...result,
    matched: filtered.length
  });
});

app.post("/api/prospects/validate", async (req, res) => {
  try {
    const payload = req.body || {};
    const prospectIds = payload.ids || [];
    const validateEmail = payload.validateEmail === true || payload.validateEmail === 'true';
    const validateDomain = payload.validateDomain === true || payload.validateDomain === 'true';
    const apiKey = process.env.HUNTER_API_KEY;

    if (!validateEmail && !validateDomain) {
      return res.status(400).json({
        error: "Must specify validateEmail or validateDomain",
        validated: 0
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        error: "Hunter API key not configured in .env (HUNTER_API_KEY)",
        validated: 0
      });
    }

    const db = readDb();
    const prospects = prospectIds
      .map(id => db.prospects.find(p => p.id === id))
      .filter(Boolean);

    if (prospects.length === 0) {
      return res.status(404).json({
        error: "No valid prospect IDs found",
        validated: 0
      });
    }

    // Validate prospects
    const validated = await batchValidateProspects(prospects, {
      validateEmail,
      validateDomain,
      apiKey,
      batchSize: 3
    });

    // Update prospects in database
    const updated = validated.map(prospect => {
      const updated = update("prospects", prospect.id, prospect);
      return updated;
    });

    appendActivity("prospect.validated", `Validated ${updated.length} prospects for email/domain`, {
      count: updated.length,
      validateEmail,
      validateDomain
    });

    res.json({
      validated: updated.length,
      prospects: updated.slice(0, 50)
    });
  } catch (error) {
    console.error("Prospect validation error:", error);
    res.status(500).json({
      error: error.message,
      validated: 0
    });
  }
});

app.get("/api/campaigns", (_req, res) => {
  const db = readDb();
  res.json(db.campaigns);
});

app.get("/api/email-jobs", (_req, res) => {
  const db = readDb();
  res.json(db.emailJobs.slice(-300).reverse());
});

app.post("/api/email-jobs/process", async (req, res) => {
  const limit = Number(req.body?.limit || 200);
  const result = await processDueEmailJobs(limit);
  appendActivity("email.jobs.processed", `Processed ${result.processed} email jobs`, {
    sent: result.sent,
    failed: result.failed
  });
  res.json(result);
});

app.post("/api/campaigns", (req, res) => {
  const payload = req.body || {};

  if (!payload.name || !payload.product) {
    return res.status(400).json({ error: "name and product are required" });
  }

  const campaign = insert("campaigns", {
    ...payload,
    status: payload.status || "draft",
    emailsSent: 0,
    replies: 0,
    meetingsBooked: 0
  });

  appendActivity("campaign.created", `Campaign created: ${campaign.name}`, {
    campaignId: campaign.id
  });

  return res.status(201).json(campaign);
});

app.delete("/api/campaigns/:id", (req, res) => {
  const deleted = remove("campaigns", req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: "campaign not found" });
  }

  appendActivity("campaign.deleted", `Campaign deleted: ${req.params.id}`);
  return res.status(204).end();
});

app.post("/api/campaigns/bulk-delete", (req, res) => {
  const result = removeMany("campaigns", req.body?.ids);

  appendActivity("campaign.bulk_deleted", `Bulk delete executed for campaigns`, {
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json(result);
});

app.post("/api/campaigns/bulk-delete-by-query", (req, res) => {
  const db = readDb();
  const query = req.body?.query || {};
  const filtered = filterCampaigns(db.campaigns, query);
  const ids = filtered.map((item) => item.id);
  const result = removeMany("campaigns", ids);

  appendActivity("campaign.bulk_deleted", `Bulk delete executed for filtered campaigns`, {
    matched: filtered.length,
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json({
    ...result,
    matched: filtered.length
  });
});

app.post("/api/campaigns/:id/send", (req, res) => {
  const db = readDb();
  const campaign = db.campaigns.find((item) => item.id === req.params.id);

  if (!campaign) {
    return res.status(404).json({ error: "campaign not found" });
  }

  const targetProspects = db.prospects.filter((prospect) => {
    return (
      !campaign.targetIndustry ||
      (prospect.industry || "").toLowerCase().includes(campaign.targetIndustry.toLowerCase())
    );
  });

  const generated = targetProspects.map((prospect) => ({
    prospectId: prospect.id,
    company: prospect.company,
    email: prospect.email,
    subject: campaign.subject,
    body: generateColdEmail(prospect, campaign.product)
  }));

  const deliverNow = Boolean(req.body?.deliverNow);

  const deliveryPromises = deliverNow
    ? generated.map((mail) =>
        sendEmail({
          to: mail.email,
          subject: mail.subject,
          text: mail.body
        })
      )
    : [];

  const nextCount = (campaign.emailsSent || 0) + generated.length;
  const nextReplies = (campaign.replies || 0) + Math.round(generated.length * 0.12);
  const nextMeetings = (campaign.meetingsBooked || 0) + Math.round(generated.length * 0.04);

  const updated = update("campaigns", campaign.id, {
    status: "active",
    emailsSent: nextCount,
    replies: nextReplies,
    meetingsBooked: nextMeetings,
    lastRunAt: new Date().toISOString()
  });

  appendActivity("campaign.sent", `Campaign sent: ${campaign.name}`, {
    campaignId: campaign.id,
    sent: generated.length
  });

  Promise.all(deliveryPromises)
    .then((deliveries) => {
      if (deliveries.length > 0) {
        const freshDb = readDb();
        for (let i = 0; i < deliveries.length; i += 1) {
          freshDb.emailEvents.push({
            id: `evt-${Date.now()}-${i}`,
            createdAt: new Date().toISOString(),
            type: "email.sent.immediate",
            campaignId: campaign.id,
            prospectId: generated[i].prospectId,
            delivery: deliveries[i]
          });
        }
        writeDb(freshDb);
      }

      return res.json({
        campaign: updated,
        generatedEmails: generated,
        deliveries
      });
    })
    .catch((error) => {
      return res.status(500).json({ error: error.message });
    });
});

app.post("/api/campaigns/:id/launch-sequence", (req, res) => {
  const db = readDb();
  const campaign = db.campaigns.find((item) => item.id === req.params.id);

  if (!campaign) {
    return res.status(404).json({ error: "campaign not found" });
  }

  const targetProspects = db.prospects.filter((prospect) => {
    return (
      !campaign.targetIndustry ||
      (prospect.industry || "").toLowerCase().includes(String(campaign.targetIndustry).toLowerCase())
    );
  });

  const now = Date.now();
  const jobs = [];

  for (const prospect of targetProspects) {
    for (const day of sequenceDays) {
      const scheduledAt = new Date(now + day * 24 * 60 * 60 * 1000).toISOString();
      const subject = day === 1 ? campaign.subject : `${campaign.product} Follow-up (Day ${day})`;
      const body =
        day === 1
          ? generateColdEmail(prospect, campaign.product)
          : [
              `Hello ${prospect.firstName || "there"},`,
              "",
              `Following up on ${campaign.product} for ${prospect.company}.`,
              "",
              "If this is relevant, I can share a focused implementation outline and scheduling options.",
              "",
              "Regards,",
              "Barney R. Gilliom"
            ].join("\n");

      jobs.push({
        id: `job-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        campaignId: campaign.id,
        prospectId: prospect.id,
        day,
        subject,
        body,
        scheduledAt,
        status: "pending"
      });
    }
  }

  db.emailJobs.push(...jobs);
  writeDb(db);

  appendActivity("campaign.sequence_launched", `Sequence launched for ${campaign.name}`, {
    campaignId: campaign.id,
    jobs: jobs.length
  });

  return res.status(201).json({
    campaignId: campaign.id,
    jobsCreated: jobs.length,
    prospectsTargeted: targetProspects.length
  });
});

app.get("/api/inquiries", (_req, res) => {
  const db = readDb();
  res.json(db.inquiries);
});

app.post("/api/inquiries", (req, res) => {
  const payload = req.body || {};

  if (!payload.name || !payload.email || !payload.message) {
    return res.status(400).json({ error: "name, email and message are required" });
  }

  const inquiry = insert("inquiries", {
    ...payload,
    status: payload.status || "open",
    priority: payload.priority || "standard",
    sentiment: payload.sentiment || "neutral"
  });

  appendActivity("inquiry.created", `Inquiry received from ${inquiry.name}`, {
    inquiryId: inquiry.id
  });

  return res.status(201).json(inquiry);
});

app.post("/api/inquiries/:id/reply", (req, res) => {
  const db = readDb();
  const inquiry = db.inquiries.find((item) => item.id === req.params.id);

  if (!inquiry) {
    return res.status(404).json({ error: "inquiry not found" });
  }

  const reply = generateFollowUp(inquiry);
  const updated = update("inquiries", inquiry.id, {
    status: "replied",
    lastReplyAt: new Date().toISOString(),
    lastReply: reply
  });

  appendActivity("inquiry.replied", `Automated follow-up generated for ${inquiry.name}`, {
    inquiryId: inquiry.id
  });

  return res.json({ inquiry: updated, reply });
});

app.delete("/api/inquiries/:id", (req, res) => {
  const deleted = remove("inquiries", req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: "inquiry not found" });
  }

  appendActivity("inquiry.deleted", `Inquiry deleted: ${req.params.id}`);
  return res.status(204).end();
});

app.post("/api/inquiries/bulk-delete", (req, res) => {
  const result = removeMany("inquiries", req.body?.ids);

  appendActivity("inquiry.bulk_deleted", `Bulk delete executed for inquiries`, {
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json(result);
});

app.post("/api/inquiries/bulk-delete-by-query", (req, res) => {
  const db = readDb();
  const query = req.body?.query || {};
  const filtered = filterInquiries(db.inquiries, query);
  const ids = filtered.map((item) => item.id);
  const result = removeMany("inquiries", ids);

  appendActivity("inquiry.bulk_deleted", `Bulk delete executed for filtered inquiries`, {
    matched: filtered.length,
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json({
    ...result,
    matched: filtered.length
  });
});

app.get("/api/proposals", (_req, res) => {
  const db = readDb();
  res.json(db.proposals);
});

app.post("/api/proposals", async (req, res) => {
  const payload = req.body || {};

  if (!payload.company || !payload.productId) {
    return res.status(400).json({ error: "company and productId are required" });
  }

  const db = readDb();
  const product = db.products.find((item) => item.id === payload.productId);

  if (!product) {
    return res.status(404).json({ error: "product not found" });
  }

  const monthlyFee = Number(payload.price || product.priceFrom);
  const proposal = insert("proposals", {
    ...payload,
    productName: product.name,
    status: "draft",
    paymentStatus: "pending",
    billingCycle: "monthly",
    total: monthlyFee
  });

  const checkout = await createCheckoutSession({
    proposal,
    product,
    customerEmail: payload.email
  });

  const saved = update("proposals", proposal.id, {
    stripeCheckoutLink: checkout.url,
    stripeSessionId: checkout.sessionId,
    paymentProvider: checkout.provider
  });

  appendActivity("proposal.created", `Monthly subscription plan generated for ${saved.company}`, {
    proposalId: saved.id,
    monthlyFee
  });

  return res.status(201).json(saved);
});

app.delete("/api/proposals/:id", (req, res) => {
  const deleted = remove("proposals", req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: "proposal not found" });
  }

  appendActivity("proposal.deleted", `Proposal deleted: ${req.params.id}`);
  return res.status(204).end();
});

app.post("/api/proposals/bulk-delete", (req, res) => {
  const result = removeMany("proposals", req.body?.ids);

  appendActivity("proposal.bulk_deleted", `Bulk delete executed for proposals`, {
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json(result);
});

app.get("/api/integrations/status", (_req, res) => {
  const db = readDb();
  const pendingEmailJobs = db.emailJobs.filter((item) => item.status === "pending").length;

  res.json({
    stripe: getStripeConfig(),
    email: getMailConfig(),
    ai: getAiConfig(),
    queues: {
      pendingEmailJobs,
      sentEmailEvents: db.emailEvents.length,
      payments: db.payments.length
    }
  });
});

app.get("/api/demos", (_req, res) => {
  const db = readDb();
  res.json(db.demos);
});

app.post("/api/demos", (req, res) => {
  const payload = req.body || {};

  if (!payload.company || !payload.contact || !payload.dateTime) {
    return res.status(400).json({ error: "company, contact and dateTime are required" });
  }

  const demo = insert("demos", {
    ...payload,
    status: payload.status || "scheduled"
  });

  appendActivity("demo.scheduled", `Demo scheduled for ${demo.company}`, {
    demoId: demo.id,
    dateTime: demo.dateTime
  });

  return res.status(201).json(demo);
});

app.delete("/api/demos/:id", (req, res) => {
  const deleted = remove("demos", req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: "demo not found" });
  }

  appendActivity("demo.deleted", `Demo deleted: ${req.params.id}`);
  return res.status(204).end();
});

app.post("/api/demos/bulk-delete", (req, res) => {
  const result = removeMany("demos", req.body?.ids);

  appendActivity("demo.bulk_deleted", `Bulk delete executed for demos`, {
    requested: result.requested,
    removed: result.removed,
    remaining: result.remaining
  });

  return res.json(result);
});

app.get("/api/analytics", (req, res) => {
  const db = readDb();
  const prospects = db.prospects.map(withScoring);
  const recentLimit = toBoundedInt(req.query.recentLimit, 12, 1, 100);

  const hotLeads = prospects.filter((prospect) => prospect.tier === "Hot").length;
  const warmLeads = prospects.filter((prospect) => prospect.tier === "Warm").length;

  const emailsSent = db.campaigns.reduce((sum, campaign) => sum + (campaign.emailsSent || 0), 0);
  const replies = db.campaigns.reduce((sum, campaign) => sum + (campaign.replies || 0), 0);
  const meetings = db.campaigns.reduce((sum, campaign) => sum + (campaign.meetingsBooked || 0), 0);

  const pipelineValue = db.proposals.reduce((sum, proposal) => sum + Number(proposal.total || 0), 0);

  const openInquiries = db.inquiries.filter((inquiry) => inquiry.status !== "replied").length;

  res.json({
    prospects: prospects.length,
    hotLeads,
    warmLeads,
    campaigns: db.campaigns.length,
    emailsSent,
    replies,
    meetings,
    replyRate: emailsSent > 0 ? Number(((replies / emailsSent) * 100).toFixed(2)) : 0,
    meetingRate: emailsSent > 0 ? Number(((meetings / emailsSent) * 100).toFixed(2)) : 0,
    openInquiries,
    proposals: db.proposals.length,
    pipelineValue,
    demosScheduled: db.demos.length,
    recentActivity: db.activities.slice(-recentLimit).reverse()
  });
});

app.get("/api/activity", (req, res) => {
  const db = readDb();
  const limit = toBoundedInt(req.query.limit, 40, 1, 200);
  const typeFilter = normalizeString(req.query.type);
  const search = normalizeString(req.query.search);

  let activities = [...db.activities];

  if (typeFilter) {
    activities = activities.filter((item) => normalizeString(item.type) === typeFilter);
  }

  if (search) {
    activities = activities.filter((item) => {
      return `${item.type || ""} ${item.message || ""}`.toLowerCase().includes(search);
    });
  }

  res.json(activities.slice(-limit).reverse());
});

app.patch("/api/activity/:id", (req, res) => {
  const payload = req.body || {};
  const updates = {};

  if (payload.type !== undefined) {
    updates.type = String(payload.type || "").trim() || "activity.updated";
  }

  if (payload.message !== undefined) {
    updates.message = String(payload.message || "").trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "message or type is required" });
  }

  if (updates.message !== undefined && !updates.message) {
    return res.status(400).json({ error: "message cannot be empty" });
  }

  const updatedItem = update("activities", req.params.id, updates);

  if (!updatedItem) {
    return res.status(404).json({ error: "activity not found" });
  }

  return res.json(updatedItem);
});

app.delete("/api/activity/:id", (req, res) => {
  const removed = remove("activities", req.params.id);

  if (!removed) {
    return res.status(404).json({ error: "activity not found" });
  }

  return res.status(204).send();
});

app.post("/api/activity/bulk-delete", (req, res) => {
  const result = removeMany("activities", req.body?.ids);
  return res.json(result);
});

app.post("/api/activity/prune", (req, res) => {
  const db = readDb();
  const keepLast = toBoundedInt(req.body?.keepLast, 100, 10, 5000);
  const previousCount = db.activities.length;

  db.activities = db.activities.slice(-keepLast);
  writeDb(db);

  return res.json({
    previousCount,
    currentCount: db.activities.length,
    removed: Math.max(0, previousCount - db.activities.length),
    keepLast
  });
});

app.post("/api/discovery/bulk-prospects", (req, res) => {
  appendActivity(
    "prospect.bulk_generation_blocked",
    "Blocked deprecated synthetic prospect generation endpoint.",
    {
      route: "/api/discovery/bulk-prospects"
    }
  );

  return res.status(410).json({
    error: "bulk prospect generation has been removed",
    reason: "synthetic prospect data is not allowed",
    route: "/api/discovery/bulk-prospects"
  });
});

app.post("/api/discovery/tech-detect", async (req, res) => {
  const payload = req.body || {};
  if (!payload.url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const result = await detectWebsiteTechnology(payload.url);
    appendActivity("tech.detected", `Technology detection completed for ${payload.url}`, {
      url: payload.url,
      technologies: result.technologies,
      validated: result.validated
    });

    return res.json(result);
  } catch (error) {
    return res.status(503).json({ error: `technology detection failed: ${error.message}` });
  }
});

app.get("/api/sales-package/assets", (_req, res) => {
  const pack = buildSalesAssetPack();
  res.json(pack);
});

app.get("/api/sales-package/calendar", (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  res.json(buildMarketingCalendar(year));
});

app.get("/api/sales-package/sequence", (req, res) => {
  const product = req.query.product;
  const role = req.query.role;
  res.json(buildEmailSequence(product, role));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Digital Sales Automation Center listening on http://localhost:${port}`);
});
