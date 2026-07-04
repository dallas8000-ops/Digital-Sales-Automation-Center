const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function resolveDbPath() {
  const configured = String(process.env.DATABASE_PATH || "").trim();

  if (!configured) {
    return path.join(__dirname, "..", "data", "db.json");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(path.join(__dirname, ".."), configured);
}

const DB_PATH = resolveDbPath();

const defaultDb = {
  prospects: [],
  campaigns: [],
  inquiries: [],
  activities: [],
  emailJobs: [],
  emailEvents: [],
  payments: [],
  proposals: [],
  demos: [],
  jobBoardOutreach: [],
  salesAssets: [],
  calendarPlans: [],
  products: [
    {
      id: "prod-ai-studio",
      name: "AI Software Operations Studio",
      category: "AI Engineering",
      priceFrom: 7500,
      description:
        "Centralized AI-assisted software engineering, deployment workflows, and operational automation."
    },
    {
      id: "prod-stripe-center",
      name: "Deployment & Stripe Automation Center",
      category: "Payments",
      priceFrom: 4500,
      description:
        "Accelerates Stripe integration, deployment readiness, and payment infrastructure automation."
    },
    {
      id: "prod-dbops",
      name: "DBOps Control Center",
      category: "Database Operations",
      priceFrom: 5500,
      description:
        "Database monitoring, SQL operations, audit logging, and incident management workflows."
    },
    {
      id: "prod-fintech",
      name: "Elite Fintech Systems",
      category: "FinTech",
      priceFrom: 9000,
      description:
        "Multi-tenant fintech SaaS foundation for onboarding, billing, and secure operations."
    },
    {
      id: "prod-api-transfer",
      name: "API Transfer",
      category: "Integration",
      priceFrom: 3500,
      description:
        "API migration, endpoint validation, and environment synchronization workflows."
    },
    {
      id: "prod-righand",
      name: "RigHand AI",
      category: "Transportation",
      priceFrom: 4000,
      description:
        "Operations intelligence for owner-operators and fleet teams."
    },
    {
      id: "prod-pc-checker",
      name: "PC Checker Extreme",
      category: "IT Support",
      priceFrom: 2500,
      description:
        "Automated diagnostics and issue triage for managed IT support services."
    }
  ],
  config: {
    companyName: "Gilliom Frontline Digital",
    website: "https://gilliomfrontlinedigital.com/",
    founder: "Barney R. Gilliom"
  }
};

function ensureDb() {
  const parentDir = path.dirname(DB_PATH);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), "utf8");
    return;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const merged = { ...defaultDb, ...parsed };

    for (const key of Object.keys(defaultDb)) {
      if (typeof defaultDb[key] === "object" && !Array.isArray(defaultDb[key])) {
        const parsedSection = parsed[key] && typeof parsed[key] === "object" ? parsed[key] : {};
        merged[key] = { ...defaultDb[key], ...parsedSection };
      }
      if (Array.isArray(defaultDb[key]) && !Array.isArray(parsed[key])) {
        merged[key] = defaultDb[key];
      }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to parse DB file, recreating default database.", error);
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function insert(collection, record) {
  const db = readDb();
  const item = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...record
  };

  db[collection].push(item);
  writeDb(db);
  return item;
}

function update(collection, id, updates) {
  const db = readDb();
  const index = db[collection].findIndex((item) => item.id === id);

  if (index < 0) {
    return null;
  }

  db[collection][index] = {
    ...db[collection][index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  writeDb(db);
  return db[collection][index];
}

function remove(collection, id) {
  const db = readDb();
  const index = db[collection].findIndex((item) => item.id === id);

  if (index < 0) {
    return false;
  }

  db[collection].splice(index, 1);
  writeDb(db);
  return true;
}

function appendActivity(type, message, metadata = {}) {
  return insert("activities", {
    type,
    message,
    metadata
  });
}

module.exports = {
  readDb,
  writeDb,
  ensureDb,
  insert,
  update,
  remove,
  appendActivity
};
