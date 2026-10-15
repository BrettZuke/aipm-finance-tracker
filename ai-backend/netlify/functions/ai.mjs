// AI proxy for the Finance Tracker app.
// Holds the Groq key server-side; only signed-in users of your Supabase project can call it.
// Set GROQ_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY in the Netlify site's environment variables.
const GROQ_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
// Each Groq model has its own free token quota. The first model reads statements most reliably, so a
// per-minute limit is waited out by the browser; only a used-up daily quota or a failed reply moves on.
// AI_MODEL (optional) is tried first.
const MODELS = [process.env.AI_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b"].filter((m, i, a) => m && a.indexOf(m) === i);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

const PARSE_PROMPT = `You read bank and credit card statements and return every transaction as JSON.
Return ONLY this JSON object:
{"account":{"kind":"bank or credit_card","name":"short label, e.g. Chase Visa 1234 or RBC Chequing 5678"},
 "period":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"},
 "summary":{"deposits":null,"withdrawals":null,"payments_credits":null,"purchases_debits":null,"cash_advances":null,"interest":null,"fees":null},
 "transactions":[{"date":"YYYY-MM-DD","desc":"merchant or payee","amount":12.34,"type":"expense","cat":"Groceries"}]}

amount:
- Bank account: positive for money in, negative for money out. Amounts in the text marked + are deposits and - are withdrawals: copy them with that sign. Numbers shown as (balance ...) are running balances, never transactions.
- Credit card: copy the amount exactly as the statement prints it. Charges (purchases, fees, interest, cash advances) are printed as plain numbers: keep them positive. Payments and credits are printed with a minus sign or CR: give them as negative numbers. Never change a credit card sign for any other reason, even when the description sounds like a charge.

summary: copy the totals from the statement's summary box as plain positive numbers. Bank account: deposits and withdrawals. Credit card: payments_credits, purchases_debits, cash_advances, interest, fees. Use null for anything the text does not show.

type is one of:
- card_payment: a payment to a credit card, on either statement (e.g. "PAYMENT - THANK YOU", "AUTOMATIC PAYMENT", "CREDIT CARD PAYMENT", "Visa payment").
- transfer: money moved between the holder's own accounts (e.g. "Online transfer to savings", "Transfer from checking", contributions to their own savings or retirement accounts).
- income or expense: everything else. Money sent to or received from other people (e-Transfers, Zelle and the like) is expense or income, never transfer.

cat: for income use "Income". For transfer and card_payment use "Transfers". For an expense it must be one of: {CATS}.
Use these rules for any of those names that are in the list:
- Groceries: supermarkets and grocery stores (e.g. Walmart Supercenter, Costco, Kroger, Safeway, Tesco, Aldi), fruit stands, farms, bakeries, butchers.
- Dining Out: restaurants, cafes, coffee shops, bars, pubs, breweries, fast food.
- Transportation: gas stations (e.g. Shell, Chevron, Esso, BP), car insurance, parking, transit, ride shares, car parts and repairs.
- Utilities: phone, internet, cable, electricity, gas and water bills.
- Rent: mortgage and rent.
- Health: pharmacies, doctors, dentists, salons, gyms.
- Subscriptions: streaming, apps, memberships.
- Entertainment: hotels, movies, events, travel.
- Shopping: all other stores (e.g. Amazon, Target, Home Depot, dollar stores, liquor stores, garden centres, pet stores).
- Other: only when nothing above fits.
desc: a clean readable name, e.g. "WAL-MART SUPERCENTER #1093" becomes "Walmart" and "STARBUCKS STORE #2790" becomes "Starbucks". For money sent to or from people keep who it was with, e.g. "e-Transfer from Sam Lee".
date: the transaction date (not the posting date), with the full year taken from the statement period.
Skip opening and closing balances, running balances, subtotals, points, minimum payment, credit limit and anything else that is not a transaction. List every transaction exactly once; two identical charges on the same day are two transactions. If there are none, return an empty transactions array.`;

class RateLimited extends Error {
  constructor(message, retryAfter) { super(message); this.retryAfter = retryAfter; this.daily = /per day/i.test(message); }
}

function retrySeconds(res, message) {
  const h = parseFloat(res.headers.get("retry-after"));
  if (h > 0) return Math.ceil(h);
  const m = /try again in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i.exec(message || "");
  const s = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  return s > 0 ? Math.ceil(s) : 10;
}

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

async function groqOnce(model, messages, opts) {
  const body = { model, messages, temperature: 0.2 };
  if (/^openai\/gpt-oss/.test(model)) body.reasoning_effort = "low";
  if (opts.json) body.response_format = { type: "json_object" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  const msg = (d.error && d.error.message) || `AI request failed (${r.status})`;
  if (r.status === 429) throw new RateLimited(msg, retrySeconds(r, msg));
  if (!d.choices || !d.choices[0]) throw new Error(d.error && d.error.code === "json_validate_failed" ? "The AI reply came back garbled" : msg);
  return d.choices[0].message.content;
}

// Netlify ends a free-plan function after 10 seconds, so a second model is only tried while there is time for it.
async function groq(messages, opts = {}) {
  const errors = [];
  for (const model of MODELS) {
    if (errors.length && Date.now() > opts.deadline) break;
    try { return await groqOnce(model, messages, opts); }
    catch (e) {
      if (e instanceof RateLimited && !e.daily) throw e;
      errors.push(e);
    }
  }
  throw errors.find(e => !(e instanceof RateLimited)) || errors[0];
}

function cleanList(v, max, len) {
  return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, max).map(x => x.slice(0, len)) : [];
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "Method not allowed" };
  const missing = [["GROQ_API_KEY", GROQ_KEY], ["SUPABASE_URL", SUPABASE_URL], ["SUPABASE_ANON_KEY", SUPABASE_ANON]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "The AI backend is missing " + missing.join(", ") + ". Add it in the Netlify site's environment variables and redeploy." }) };
  }

  const deadline = Date.now() + 5000;
  const user = await verifyUser(event.headers.authorization || event.headers.Authorization);
  if (!user) return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: "Please sign in first." }) };

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, headers: CORS, body: "bad json" }; }

  try {
    if (payload.mode === "parse") {
      // A tab opened before this reply format existed would misread it, so it is told to reload.
      if (!Array.isArray(payload.categories)) {
        return { statusCode: 409, headers: JSON_HEADERS, body: JSON.stringify({ error: "This page was updated. Refresh the page and upload again." }) };
      }
      const cats = cleanList(payload.categories, 40, 40);
      const sys = PARSE_PROMPT.replace("{CATS}", (cats.length ? cats : ["Other"]).join(", "));
      let prompt = "Statement text:\n\n" + String(payload.text || "").slice(0, 28000);
      const c = payload.context;
      if (c && typeof c === "object") {
        const f = k => String(c[k] || "").slice(0, 60);
        prompt = `This text continues a ${f("kind")} statement (${f("name")}, ${f("start")} to ${f("end")}). Its summary was on an earlier page, so return every summary field as null.\n\n` + prompt;
      }
      if (payload.hint) prompt += "\n\nNote: " + String(payload.hint).slice(0, 400);
      const content = await groq([
        { role: "system", content: sys },
        { role: "user", content: prompt }
      ], { json: true, deadline });
      let out;
      try { out = JSON.parse(content); } catch (e) { throw new Error("The AI reply was cut off. Please try that statement again."); }
      if (!out || !Array.isArray(out.transactions)) throw new Error("The AI reply had no transaction list. Please try that statement again.");
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(out) };
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
      const answer = await groq(msgs, { deadline });
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ answer }) };
    }

    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "unknown mode" }) };
  } catch (e) {
    if (e instanceof RateLimited) {
      return { statusCode: 429, headers: JSON_HEADERS, body: JSON.stringify({ error: "The free AI limit is busy.", retryAfter: e.retryAfter }) };
    }
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
