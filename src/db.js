const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

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
      priceFrom: 9,
      description:
        "Starter $9/month, Pro $79/month, Enterprise custom quote."
    },
    {
      id: "prod-stripe-center",
      name: "Deployment & Stripe Automation Center",
      category: "Payments",
      priceFrom: 79,
      description:
        "Flat rate $79/month for client access and subscription operations."
    },
    {
      id: "prod-specwright",
      name: "Specwright",
      category: "Productivity",
      priceFrom: 29,
      description:
        "Starter $29/month, Pro $79/month, annual billing approximately 20% off."
    },
    {
      id: "prod-dbops",
      name: "DBOps Control Center",
      category: "Database Operations",
      priceFrom: 79,
      description:
        "Starter $79/month, Pro $149/month, Enterprise $399/month."
    },
    {
      id: "prod-fintech",
      name: "Elite Fintech Systems",
      category: "FinTech",
      priceFrom: 12,
      description:
        "Tier anchors: $12/$35/$120 monthly, localized with VAT in supported regions."
    },
    {
      id: "prod-enpower-command-pro",
      name: "EnPowerCommandPro",
      category: "Operations",
      priceFrom: 39,
      description:
        "$39/month monthly client access plan."
    },
    {
      id: "prod-righand",
      name: "RigHand AI",
      category: "Transportation",
      priceFrom: 34.99,
      description:
        "Compliance Pro $34.99/month and Fleet Lite $89/month."
    },
    {
      id: "prod-pc-checker",
      name: "PC Checker Extreme",
      category: "IT Support",
      priceFrom: 4,
      description:
        "$4/month (pricing page currently unavailable in production URL)."
    },
    {
      id: "prod-eastbridge-ops",
      name: "EastBridge Ops Intelligence",
      category: "Operations",
      priceFrom: 0,
      description:
        "No published paid Stripe pricing page yet (internal catalog placeholder)."
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
      if (key === "products") {
        merged[key] = defaultDb[key];
        continue;
      }

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
