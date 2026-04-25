/**
 * Shared Anthropic Messages API client for UNMAPPED.
 * Model defaults to Claude Sonnet 4 per product spec; override with ANTHROPIC_MODEL.
 */

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

function parseJsonFromAssistantText(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty assistant text");
  }
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z0-9]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return JSON.parse(t);
}

/**
 * @param {{ system: string, user: string | object, max_tokens?: number, apiKey: string }} opts
 */
async function callClaude(opts) {
  const { system, user, max_tokens = 4096, apiKey } = opts;
  const userContent = typeof user === "string" ? user : JSON.stringify(user);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens,
      system: `${system}\n\nReturn ONLY valid JSON. No preamble. No markdown code fences.`,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude request failed with ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Claude response missing text block");
  }

  return parseJsonFromAssistantText(text);
}

module.exports = {
  CLAUDE_MODEL,
  parseJsonFromAssistantText,
  callClaude
};
