function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

const industryWeights = {
  "software": 22,
  "saas": 24,
  "fintech": 18,
  "healthcare": 15,
  "logistics": 16,
  "banking": 18,
  "government": 12,
  "education": 10
};

const roleWeights = {
  "cto": 22,
  "vp engineering": 18,
  "director engineering": 16,
  "engineering manager": 15,
  "devops manager": 15,
  "platform lead": 14,
  "founder": 20
};

function includesAny(value = "", list = []) {
  const normalized = value.toLowerCase();
  return list.some((item) => normalized.includes(item));
}

function scoreProspect(prospect) {
  let score = 30;

  const industry = (prospect.industry || "").toLowerCase();
  const role = (prospect.title || "").toLowerCase();
  const tech = (prospect.techStack || "").toLowerCase();
  const engagement = Number(prospect.engagementLevel || 0);

  for (const key of Object.keys(industryWeights)) {
    if (industry.includes(key)) {
      score += industryWeights[key];
      break;
    }
  }

  for (const key of Object.keys(roleWeights)) {
    if (role.includes(key)) {
      score += roleWeights[key];
      break;
    }
  }

  if (includesAny(tech, ["stripe", "postgres", "aws", "azure", "gcp", "kubernetes"])) {
    score += 12;
  }

  if (includesAny(tech, ["ai", "openai", "llm", "copilot"])) {
    score += 10;
  }

  score += clamp(engagement, 0, 20);

  return clamp(Math.round(score), 0, 100);
}

function scoreLabel(score) {
  if (score >= 80) {
    return "Hot";
  }
  if (score >= 60) {
    return "Warm";
  }
  return "Cold";
}

module.exports = {
  scoreProspect,
  scoreLabel
};
