const { scoreProspect, scoreLabel } = require("./scoring");

function buildPersonalizedIntro(prospect) {
  const company = prospect.company || "your organization";
  const industry = prospect.industry || "your industry";
  const tech = prospect.techStack || "your current stack";

  return "I noticed " + company + " is active in " + industry + ", and organizations using " + tech + " often look for ways to reduce engineering overhead while improving delivery speed.";
}

function generateColdEmail(prospect, productName) {
  const intro = buildPersonalizedIntro(prospect);
  const recipient = prospect.firstName ? "Dear " + prospect.firstName + "," : "Hello,";

  return [
    recipient,
    "",
    "I hope you are doing well.",
    "",
    intro,
    "",
    "I am reaching out to introduce " + productName + ", a production-ready service from Gilliom Frontline Digital designed to automate high-friction operational workflows and improve execution consistency.",
    "",
    "It can help you:",
    "- Centralize critical workflows",
    "- Automate repetitive operational tasks",
    "- Improve visibility from first touch through conversion",
    "- Accelerate delivery outcomes with less manual coordination",
    "",
    "If useful, I would be glad to schedule a brief call and tailor recommendations to your environment.",
    "",
    "Website and demos:",
    "https://gilliomfrontlinedigital.com/",
    "",
    "Sincerely,",
    "Barney R. Gilliom",
    "Independent Freelancer, Gilliom Frontline Digital"
  ].join("\n");
}

function generateFollowUp(inquiry) {
  const tone = inquiry.sentiment === "negative" ? "supportive" : "confident";
  const urgency = inquiry.priority === "high" ? "priority" : "standard";

  return [
    "Hello " + (inquiry.name || "there") + ",",
    "",
    "Thank you for your message and for the opportunity to support your work.",
    "",
    "I reviewed your inquiry and prepared a " + urgency + " follow-up path with a " + tone + " approach so you can move forward efficiently.",
    "",
    "Next steps:",
    "1. Confirm your current workflow and constraints.",
    "2. Align on the best-fit solution and implementation scope.",
    "3. Schedule a focused walkthrough with practical recommendations.",
    "",
    "Please share two times that work for you this week, and I will send a meeting invite.",
    "",
    "Regards,",
    "Barney R. Gilliom"
  ].join("\n");
}

function assignProspectTier(prospect) {
  const score = scoreProspect(prospect);
  return {
    score,
    tier: scoreLabel(score)
  };
}

function suggestedProductForProspect(prospect) {
  const industry = (prospect.industry || "").toLowerCase();
  const tech = (prospect.techStack || "").toLowerCase();

  if (industry.includes("fintech") || industry.includes("bank")) {
    return "Elite Fintech Systems";
  }

  if (industry.includes("logistics") || industry.includes("transport")) {
    return "RigHand AI";
  }

  if (tech.includes("stripe") || tech.includes("payment")) {
    return "Deployment & Stripe Automation Center";
  }

  if (tech.includes("postgres") || industry.includes("database")) {
    return "DBOps Control Center";
  }

  if (tech.includes("api") || industry.includes("integration")) {
    return "API Transfer";
  }

  return "AI Software Operations Studio";
}

module.exports = {
  generateColdEmail,
  generateFollowUp,
  assignProspectTier,
  suggestedProductForProspect
};
