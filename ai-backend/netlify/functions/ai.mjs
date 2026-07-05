// AI proxy for the finance tracker.
// Holds the AI provider key server-side; only signed-in users of YOUR Supabase
// project can call it. All values come from environment variables you set in
// Netlify (see .env.example and README.md). Nothing is hardcoded here.
const GROQ_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

if (!GROQ_KEY || !SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing env vars: set GROQ_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY in Netlify.");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

async function verifyUser(auth) {
  if (!auth) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: auth }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

async function groq(messages, jsonMode) {
  const body = { model: MODEL, messages, temperature: 0.2 };
  if (jsonMode) body.response_format = { type: "json_object" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!d.choices || !d.choices[0]) throw new Error((d.error && d.error.message) || "AI request failed");
  return d.choices[0].message.content;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "Method not allowed" };

  const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
  if (!user) return { statusCode: 401, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Please sign in first." }) };

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, headers: CORS, body: "bad json" }; }

  try {
    if (payload.mode === "parse") {
      const sys = "You extract transactions from raw bank or credit-card statement text. " +
        "Return ONLY a JSON object: {\"transactions\":[{\"date\":\"YYYY-MM-DD\",\"description\":\"merchant or payee\",\"amount\":-12.34}]}. " +
        "Use a NEGATIVE amount for money leaving the account (purchases, payments, withdrawals, fees) and POSITIVE for money in (deposits, payroll, refunds, credits). " +
        "Infer the full year from the statement period or dates. Clean up the description to a readable merchant name. " +
        "Ignore opening/closing balances, running balances, totals, subtotals, page headers and footers. If you find no transactions, return an empty array.";
      const content = await groq([
        { role: "system", content: sys },
        { role: "user", content: "Statement text:\n\n" + String(payload.text || "").slice(0, 28000) }
      ], true);
      return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: content };
    }

    if (payload.mode === "chat") {
      const sys = "You are a warm, plain-spoken personal-finance assistant built into a budgeting app. " +
        "Answer the user's question using ONLY the financial data provided below. Be concise and concrete: cite real numbers and dollar amounts, name specific months and categories. " +
        "Do simple math (totals, averages, differences) when helpful. If the data does not contain the answer, say so plainly. Never invent transactions. Do not use markdown tables.\n\n" +
        "=== USER FINANCIAL DATA ===\n" + String(payload.summary || "no data provided");
      const msgs = [{ role: "system", content: sys }];
      (Array.isArray(payload.history) ? payload.history.slice(-6) : []).forEach(m => {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") msgs.push(m);
      });
      msgs.push({ role: "user", content: String(payload.question || "").slice(0, 2000) });
      const answer = await groq(msgs, false);
      return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ answer }) };
    }

    return { statusCode: 400, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: "unknown mode" }) };
  } catch (e) {
    return { statusCode: 500, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
