const industries = [
  "SaaS",
  "FinTech",
  "Healthcare",
  "Logistics",
  "Government",
  "Education",
  "Insurance",
  "Manufacturing"
];

const countries = [
  "United States",
  "Kenya",
  "Uganda",
  "Rwanda",
  "Tanzania",
  "United Kingdom",
  "Canada"
];

const productsByIndustry = {
  saas: "AI Software Operations Studio",
  fintech: "Elite Fintech Systems",
  healthcare: "DBOps Control Center",
  logistics: "RigHand AI",
  government: "API Transfer",
  education: "AI Software Operations Studio",
  insurance: "Deployment & Stripe Automation Center",
  manufacturing: "API Transfer"
};

const roles = [
  "CTO",
  "VP Engineering",
  "Director of Engineering",
  "Engineering Manager",
  "DevOps Manager",
  "Platform Engineering Lead",
  "Technical Founder"
];

const firstNames = [
  "Jordan", "Taylor", "Morgan", "Avery", "Reese",
  "Kai", "Parker", "Alicia", "Moses", "Sofia",
  "Daniel", "Jessica", "Michael", "Sarah", "Christopher",
  "Amanda", "Benjamin", "Emily", "David", "Lauren",
  "James", "Rachel", "Andrew", "Catherine", "Thomas",
  "Rebecca", "Matthew", "Victoria", "Joseph", "Melissa",
  "William", "Stephanie", "Charles", "Michelle", "Richard",
  "Lisa", "Steven", "Karen", "Edward", "Nancy"
];

const lastNames = [
  "Brooks", "Walker", "Wright", "Njoroge", "Patel",
  "Kim", "Johnson", "Owens", "Rodriguez", "Mensah",
  "Garcia", "Martinez", "Anderson", "Taylor", "Thomas",
  "Moore", "Jackson", "Martin", "Lee", "Chen",
  "Brown", "Davis", "Miller", "Wilson", "Moore",
  "Taylor", "Anderson", "Thomas", "Jackson", "White",
  "Harris", "Martin", "Thompson", "Garcia", "Robinson",
  "Clark", "Rodriguez", "Lewis", "Lee", "Walker"
];

const companyPrefixes = [
  "Northstar", "Summit", "Bluewave", "Prime", "Velocity",
  "Vertex", "Atlas", "Brightpath", "Kijani", "Apex",
  "Zenith", "Catalyst", "Dynamic", "Nexus", "Quantum",
  "Horizon", "Quantum", "Stellar", "Fusion", "Pixel",
  "Forge", "Flux", "Nexus", "Prism", "Epoch",
  "Clarity", "Pinnacle", "Swift", "Helix", "Ascent"
];

const companySuffixes = [
  "Systems", "Labs", "Software", "Digital", "Technologies",
  "Networks", "Cloud", "Solutions", "Works", "Platforms",
  "Ventures", "Innovations", "Group", "Inc", "Corp",
  "Agency", "Studio", "Collective", "Hub", "Exchange",
  "Nexus", "Gateway", "Portal", "Bridge", "Link",
  "Stream", "Flow", "Pulse", "Spark", "Core"
];

const techByIndustry = {
  saas: "Node.js, PostgreSQL, AWS, Stripe",
  fintech: "Java, PostgreSQL, Kubernetes, Stripe",
  healthcare: "Python, PostgreSQL, Azure, HIPAA tooling",
  logistics: "React, APIs, GCP, GPS integrations",
  government: "Java, APIs, SSO, Azure",
  education: "Node.js, MongoDB, AWS",
  insurance: "Java, Stripe, Kafka, AWS",
  manufacturing: "C#, SQL Server, APIs, Azure"
};

function pick(list, indexSeed) {
  return list[indexSeed % list.length];
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function collectHeuristicTech(urlValue) {
  const tech = [];
  const value = String(urlValue || "").toLowerCase();

  if (value.includes("shop") || value.includes("store")) {
    tech.push("Shopify", "Stripe", "Cloudflare");
  }

  if (value.includes("fin") || value.includes("pay")) {
    tech.push("Stripe", "PostgreSQL", "AWS");
  }

  if (value.includes("api") || value.includes("dev")) {
    tech.push("Node.js", "PostgreSQL", "Docker", "GitHub Actions");
  }

  if (value.includes("health")) {
    tech.push("Azure", "Python", "PostgreSQL");
  }

  if (tech.length === 0) {
    tech.push("Node.js", "PostgreSQL", "AWS", "Nginx");
  }

  return tech;
}

function addFingerprint(techSet, reasonSet, technology, reason) {
  techSet.add(technology);
  reasonSet.add(reason);
}

function detectFromHeaders(headers, techSet, reasonSet) {
  const server = String(headers.get("server") || "").toLowerCase();
  const poweredBy = String(headers.get("x-powered-by") || "").toLowerCase();
  const cfRay = String(headers.get("cf-ray") || "");
  const via = String(headers.get("via") || "").toLowerCase();
  const setCookie = String(headers.get("set-cookie") || "").toLowerCase();

  if (server.includes("nginx")) addFingerprint(techSet, reasonSet, "Nginx", "server header contains nginx");
  if (server.includes("cloudflare") || cfRay) addFingerprint(techSet, reasonSet, "Cloudflare", "cloudflare headers detected");
  if (server.includes("vercel")) addFingerprint(techSet, reasonSet, "Vercel", "server header contains vercel");
  if (server.includes("apache")) addFingerprint(techSet, reasonSet, "Apache", "server header contains apache");
  if (via.includes("fastly")) addFingerprint(techSet, reasonSet, "Fastly", "via header suggests fastly");

  if (poweredBy.includes("express")) addFingerprint(techSet, reasonSet, "Express", "x-powered-by contains express");
  if (poweredBy.includes("next.js")) addFingerprint(techSet, reasonSet, "Next.js", "x-powered-by contains next.js");
  if (poweredBy.includes("asp.net")) addFingerprint(techSet, reasonSet, "ASP.NET", "x-powered-by contains asp.net");
  if (poweredBy.includes("php")) addFingerprint(techSet, reasonSet, "PHP", "x-powered-by contains php");

  if (setCookie.includes("_shopify")) addFingerprint(techSet, reasonSet, "Shopify", "shopify cookie detected");
}

function detectFromBody(body, techSet, reasonSet) {
  const text = String(body || "").toLowerCase();

  if (text.includes("__next_data__") || text.includes("/_next/")) {
    addFingerprint(techSet, reasonSet, "Next.js", "next.js runtime markers in html");
    addFingerprint(techSet, reasonSet, "React", "next.js implies react runtime");
  }
  if (text.includes("__nuxt") || text.includes("/_nuxt/")) addFingerprint(techSet, reasonSet, "Nuxt.js", "nuxt markers in html");
  if (text.includes("wp-content") || text.includes("wordpress")) addFingerprint(techSet, reasonSet, "WordPress", "wordpress markers in html");
  if (text.includes("woocommerce")) addFingerprint(techSet, reasonSet, "WooCommerce", "woocommerce markers in html");
  if (text.includes("cdn.shopify.com") || text.includes("shopify-buy")) addFingerprint(techSet, reasonSet, "Shopify", "shopify assets in html");

  if (text.includes("js.stripe.com") || text.includes("stripe.com/v3")) addFingerprint(techSet, reasonSet, "Stripe", "stripe client script detected");
  if (text.includes("googletagmanager.com")) addFingerprint(techSet, reasonSet, "Google Tag Manager", "gtm script detected");
  if (text.includes("google-analytics.com") || text.includes("gtag(")) addFingerprint(techSet, reasonSet, "Google Analytics", "analytics markers detected");
  if (text.includes("segment.com") || text.includes("analytics.load")) addFingerprint(techSet, reasonSet, "Segment", "segment markers detected");
  if (text.includes("intercom") && text.includes("widget")) addFingerprint(techSet, reasonSet, "Intercom", "intercom widget markers detected");
  if (text.includes("hubspot")) addFingerprint(techSet, reasonSet, "HubSpot", "hubspot markers detected");
}

async function detectWebsiteTechnology(url) {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return {
      url,
      technologies: [],
      confidence: 0,
      validated: false,
      notes: "No URL provided."
    };
  }

  const techSet = new Set();
  const reasonSet = new Set();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DSAC-Tech-Detector/1.0)",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    clearTimeout(timeout);

    const html = await response.text();

    detectFromHeaders(response.headers, techSet, reasonSet);
    detectFromBody(html, techSet, reasonSet);

    const technologies = Array.from(techSet);
    const confidence = technologies.length > 0
      ? Math.min(0.95, Number((0.5 + technologies.length * 0.07).toFixed(2)))
      : 0.35;

    return {
      url: normalizedUrl,
      statusCode: response.status,
      validated: true,
      technologies,
      confidence,
      evidence: Array.from(reasonSet).slice(0, 12),
      notes:
        technologies.length > 0
          ? "Validated from live headers and HTML fingerprint signals."
          : "Site fetched successfully but no strong technology fingerprints were found."
    };
  } catch (error) {
    const fallback = Array.from(new Set(collectHeuristicTech(normalizedUrl)));
    return {
      url: normalizedUrl,
      validated: false,
      technologies: fallback,
      confidence: 0.35,
      notes: `Live validation failed, returning heuristic fallback: ${error.message}`
    };
  }
}

function buildSalesAssetPack() {
  return {
    jobBoardTemplates: {
      indeed: "Hi [Name], I noticed your role focus on [priority]. I help organizations centralize AI-assisted development and delivery operations with measurable reductions in manual overhead. Open to a short 15-minute exchange?",
      glassdoor: "Hi [Name], based on your current priorities, many teams are juggling AI tooling across fragmented workflows. I built AI Software Operations Studio to unify those workflows and improve consistency. Interested in a one-page overview?",
      hiringManager: "Hi [Name], if your roadmap includes AI-assisted automation, I can help standardize project setup, deployment readiness, and release operations in one platform. Interested in a brief call?"
    },
    callScripts: {
      discovery: [
        "What are the top 2 software delivery bottlenecks you are facing today?",
        "How are AI tools currently used across development and operations?",
        "What does your current release preparation workflow look like?",
        "If I improve one outcome in 90 days, what matters most: speed, quality, or cost?"
      ],
      demo: [
        "I will show workflow centralization, automation orchestration, and release readiness checks.",
        "I will map one of your current processes to a production-ready automation flow.",
        "I will align milestones, rollout model, and expected operational ROI with your goals."
      ]
    },
    proposalTemplates: {
      standardSections: [
        "Executive Summary",
        "Current State Assessment",
        "Target Operating Model",
        "Implementation Scope and Milestones",
        "Security and Compliance Considerations",
        "Pricing and Commercial Terms",
        "Success Metrics and Reporting",
        "Next Steps"
      ]
    },
    pricingSheets: [
      {
        solution: "AI Software Operations Studio",
        starter: "$7,500",
        growth: "$15,000",
        enterprise: "$35,000+"
      },
      {
        solution: "DBOps Control Center",
        starter: "$5,500",
        growth: "$11,000",
        enterprise: "$24,000+"
      },
      {
        solution: "Deployment & Stripe Automation Center",
        starter: "$4,500",
        growth: "$9,000",
        enterprise: "$18,000+"
      }
    ],
    aiPrompts: [
      "Generate a personalized first-paragraph cold email for a [title] at [company] in [industry], referencing [public_signal] and connecting to [product].",
      "Draft a 4-step follow-up sequence for [company] focused on business outcomes, with one CTA per message and no hype language.",
      "Create an Indeed or Glassdoor outreach note under 300 characters for a [role], with relevance to [tech_stack] and a low-friction call to action.",
      "Turn this inquiry into a professional response: [inquiry_text]. Include acknowledgement, value path, and two scheduling options."
    ]
  };
}

function buildMarketingCalendar(startYear = new Date().getFullYear()) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return months.map((month, index) => ({
    month,
    year: startYear,
    theme: index % 2 === 0 ? "AI Engineering Operations" : "Automation ROI Stories",
    emailCampaign: `${month} Industry Segment Campaign`,
    jobBoardSeries: `${month} Indeed + Glassdoor Decision-Maker Sequence`,
    webinar: `${month} Workflow Modernization Live Session`,
    blog: `${month} Implementation Playbook Article`,
    launchFocus: index % 3 === 0 ? "AI Software Operations Studio" : "Portfolio Cross-Sell"
  }));
}

function buildEmailSequence(productName = "AI Software Operations Studio", role = "engineering leader") {
  const safeProduct = productName;
  const safeRole = role;

  return [
    {
      day: 1,
      subject: `Helping ${safeRole}s Reduce Delivery Friction`,
      objective: "Introduce value proposition and strategic relevance",
      bodySummary: `Position ${safeProduct} around outcomes: faster delivery, lower overhead, stronger consistency.`
    },
    {
      day: 5,
      subject: "Operational Business Case",
      objective: "Share measurable before-and-after scenario",
      bodySummary: "Demonstrate likely ROI based on current process constraints."
    },
    {
      day: 12,
      subject: "Relevant Customer Scenario",
      objective: "Present tailored use case for industry and role",
      bodySummary: "Map workflow pain points to implementation steps and gains."
    },
    {
      day: 21,
      subject: "Live Demo Invitation",
      objective: "Secure meeting or referral",
      bodySummary: "Offer concise demo and next-step alignment."
    }
  ];
}

module.exports = {
  detectWebsiteTechnology,
  buildSalesAssetPack,
  buildMarketingCalendar,
  buildEmailSequence
};
