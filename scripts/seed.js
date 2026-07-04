const crypto = require("node:crypto");
const { ensureDb, readDb, writeDb, appendActivity } = require("../src/db");
const { assignProspectTier, suggestedProductForProspect } = require("../src/services/automation");

ensureDb();
const db = readDb();

if (db.prospects.length > 0 || db.campaigns.length > 0) {
  console.log("Seed skipped: data already exists.");
  process.exit(0);
}

const prospects = [
  {
    company: "Northstar SaaS Labs",
    firstName: "Alicia",
    lastName: "Wright",
    title: "CTO",
    email: "alicia@northstarsaas.com",
    industry: "SaaS",
    techStack: "Node.js, PostgreSQL, Stripe, AWS",
    country: "United States",
    engagementLevel: 14,
    status: "active",
    stage: "lead"
  },
  {
    company: "Kijani Fintech Group",
    firstName: "Moses",
    lastName: "Njoroge",
    title: "VP Engineering",
    email: "moses@kijani-fintech.co.ke",
    industry: "FinTech",
    techStack: "Java, PostgreSQL, Kubernetes, Azure",
    country: "Kenya",
    engagementLevel: 10,
    status: "active",
    stage: "contacted"
  },
  {
    company: "BlueRoute Logistics",
    firstName: "Rebecca",
    lastName: "Long",
    title: "Operations Technology Director",
    email: "rebecca@blueroute-logistics.com",
    industry: "Logistics",
    techStack: "React, APIs, GCP",
    country: "United States",
    engagementLevel: 8,
    status: "active",
    stage: "qualified"
  }
].map((prospect) => {
  const scoring = assignProspectTier(prospect);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...prospect,
    recommendedProduct: suggestedProductForProspect(prospect),
    score: scoring.score,
    tier: scoring.tier
  };
});

const campaigns = [
  {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "Q3 AI Engineering Outreach",
    product: "AI Software Operations Studio",
    targetIndustry: "SaaS",
    subject: "Centralize AI Engineering Workflows for Faster Releases",
    status: "active",
    emailsSent: 120,
    replies: 17,
    meetingsBooked: 6,
    lastRunAt: new Date().toISOString()
  }
];

const inquiries = [
  {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "Jordan Rivera",
    email: "jordan@velocitydev.io",
    company: "Velocity Dev",
    message: "Interested in your AI software operations platform for our dev teams.",
    priority: "high",
    sentiment: "positive",
    status: "open"
  }
];

const proposals = [
  {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    company: "Northstar SaaS Labs",
    contact: "Alicia Wright",
    productId: "prod-ai-studio",
    productName: "AI Software Operations Studio",
    scope: "Platform rollout + workflow automation",
    total: 12500,
    status: "draft",
    stripeCheckoutLink: "https://checkout.stripe.com/pay/prod-ai-studio-sample"
  }
];

const demos = [
  {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    company: "Kijani Fintech Group",
    contact: "Moses Njoroge",
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    channel: "Google Meet",
    status: "scheduled"
  }
];

db.prospects = prospects;
db.campaigns = campaigns;
db.inquiries = inquiries;
db.proposals = proposals;
db.demos = demos;

writeDb(db);
appendActivity("system.seeded", "Demo data initialized");

console.log("Seed complete. Data initialized for Digital Sales Automation Center.");
