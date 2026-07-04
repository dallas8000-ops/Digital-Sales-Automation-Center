function getAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    enabled: Boolean(apiKey),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  };
}

function fallbackDraft({ prospect, jobTitle, resumeSummary, tone }) {
  const contactName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || "Hiring Manager";
  const subject = `${jobTitle || "Software Role"} | ${prospect.company || "Your Company"}`;

  const body = [
    `Dear ${contactName},`,
    "",
    `I am reaching out regarding the ${jobTitle || "open role"} opportunity at ${prospect.company || "your company"}.`,
    "",
    `Based on your focus in ${prospect.industry || "technology"}, I believe my background aligns with your current needs.`,
    "",
    "Relevant summary:",
    resumeSummary || "I build production-ready software systems, automation workflows, and operational platforms.",
    "",
    `If helpful, I would welcome a brief discussion on how I can contribute to your ${prospect.title || "engineering"} priorities.`,
    "",
    "Sincerely,",
    "Barney R. Gilliom"
  ].join("\n");

  return {
    provider: "template",
    model: "local",
    tone,
    subject,
    body
  };
}

function extractTextFromResponsesApi(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const blocks = payload && Array.isArray(payload.output) ? payload.output : [];
  const textParts = [];

  for (const block of blocks) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const item of content) {
      if (item?.type === "output_text" && typeof item.text === "string") {
        textParts.push(item.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

async function generateEmailDraftWithOpenAI({ prospect, jobTitle, resumeSummary, tone }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return fallbackDraft({ prospect, jobTitle, resumeSummary, tone });
  }

  const prompt = [
    "Create a professional business outreach email draft.",
    "Return JSON with fields: subject, body.",
    "Requirements:",
    "- Use professional tone.",
    "- Keep the body under 220 words.",
    "- Personalize using company and role context.",
    "- Include clear but low-pressure call to action.",
    "- Do not use hype language.",
    "Context:",
    `Company: ${prospect.company || "Unknown"}`,
    `Industry: ${prospect.industry || "Unknown"}`,
    `Contact First Name: ${prospect.firstName || ""}`,
    `Contact Last Name: ${prospect.lastName || ""}`,
    `Target Job Position: ${jobTitle || "Not specified"}`,
    `Preferred Tone: ${tone || "professional"}`,
    `Resume Summary: ${resumeSummary || "Not provided"}`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "email_draft",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              subject: { type: "string" },
              body: { type: "string" }
            },
            required: ["subject", "body"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const rawText = extractTextFromResponsesApi(payload);

  if (!rawText) {
    throw new Error("OpenAI response did not contain draft text");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("OpenAI response format could not be parsed as JSON");
  }

  return {
    provider: "openai",
    model,
    tone,
    subject: parsed.subject,
    body: parsed.body
  };
}

module.exports = {
  getAiConfig,
  generateEmailDraftWithOpenAI
};
