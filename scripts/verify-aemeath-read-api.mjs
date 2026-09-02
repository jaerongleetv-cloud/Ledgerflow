const baseUrl = required("LEDGERFLOW_BASE_URL").replace(/\/$/, "");
const token = required("LEDGERFLOW_AEMEATH_TOKEN");
const endpoint = "/api/integrations/aemeath/p9c/ledgerflow/v1/transactions";

const first = await fetchPage(`${baseUrl}${endpoint}?limit=2`);
validatePage(first);

let resumed = null;
if (first.next_cursor) {
  resumed = await fetchPage(`${baseUrl}${endpoint}?limit=2&cursor=${encodeURIComponent(first.next_cursor)}`);
  validatePage(resumed);
}

console.log(JSON.stringify({
  endpoint: `${baseUrl}${endpoint}`,
  firstPageCount: first.transactions.length,
  cursorReturned: Boolean(first.next_cursor),
  resumeChecked: Boolean(resumed),
  resumedPageCount: resumed?.transactions.length ?? null,
  contract: "PASS",
}, null, 2));

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Aemeath API returned HTTP ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validatePage(page) {
  if (!page || !Array.isArray(page.transactions) || !(page.next_cursor === null || typeof page.next_cursor === "string")) {
    throw new Error("Response is not an Aemeath transaction page.");
  }
  for (const transaction of page.transactions) {
    for (const field of ["external_id", "account_id", "occurred_at", "description", "amount", "currency"]) {
      if (typeof transaction[field] !== "string" || !transaction[field]) throw new Error(`Invalid ${field}.`);
    }
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(transaction.occurred_at)) throw new Error("occurred_at lacks a timezone.");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(transaction.amount)) throw new Error("amount is not a decimal string.");
    if (!/^[A-Z]{3}$/.test(transaction.currency)) throw new Error("currency is invalid.");
    if (!["debit", "credit", "other"].includes(transaction.transaction_type)) throw new Error("transaction_type is invalid.");
    if (!["pending", "posted"].includes(transaction.state)) throw new Error("state is invalid.");
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running verify:aemeath.`);
  return value;
}
