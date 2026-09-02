import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import nextConfig from "../next.config.mjs";
import {
  AEMEATH_TRANSACTION_SCOPE,
  ApiError,
  buildTransactionPage,
  decodeCursor,
  encodeCursor,
  mapLedgerFlowTransaction,
  parsePageRequest,
} from "../src/server/aemeath/p9cLedgerflowSchema.mjs";
import { hashIntegrationToken, readBearerToken, validateTokenRecord } from "../src/server/aemeath/integrationToken.mjs";
import { createTransactionRoute } from "../src/server/aemeath/transactionRoute.mjs";

const TOKEN = `lf_aem_${"A".repeat(43)}`;
const NOW = new Date("2026-09-02T12:00:00.000Z");
const ROW = {
  transaction_id: "101",
  account_id: "11111111-1111-4111-8111-111111111111",
  occurred_on: "2026-09-02",
  description: "Coffee",
  amount: "12.3400",
  currency: "cad",
  category: "Food",
  ledgerflow_type: "expense",
  transaction_class: null,
  updated_at: "2026-09-02T10:00:00+00:00",
};

function request(path = "?limit=500", token = TOKEN) {
  return new Request(`http://localhost/api/integrations/aemeath/p9c/ledgerflow/v1/transactions${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function record(overrides = {}) {
  return { id: "token-id", user_id: "user-a", scope: AEMEATH_TRANSACTION_SCOPE, expires_at: null, revoked_at: null, ...overrides };
}

test("valid authentication and stable token hashing", () => {
  assert.equal(readBearerToken(request()), TOKEN);
  assert.equal(hashIntegrationToken(TOKEN), hashIntegrationToken(TOKEN));
  assert.equal(hashIntegrationToken(TOKEN).length, 64);
});

test("missing and invalid tokens return authentication errors", () => {
  assert.throws(() => readBearerToken(request("", null)), (error) => error instanceof ApiError && error.status === 401);
  assert.throws(() => readBearerToken(request("", "short")), (error) => error.status === 401);
});

test("revoked, expired, and unknown tokens are rejected", () => {
  assert.throws(() => validateTokenRecord(record({ revoked_at: NOW.toISOString() }), NOW), (error) => error.status === 401);
  assert.throws(() => validateTokenRecord(record({ expires_at: "2026-09-02T11:59:59Z" }), NOW), (error) => error.status === 401);
  assert.throws(() => validateTokenRecord(null, NOW), (error) => error.status === 401);
});

test("wrong token scope is forbidden", () => {
  assert.throws(() => validateTokenRecord(record({ scope: "something:else" }), NOW), (error) => error.status === 403);
});

test("first page defaults to 500 and has a null cursor", () => {
  assert.deepEqual(parsePageRequest("http://localhost/api"), { limit: 500, cursor: null });
});

test("limit validation accepts the maximum and rejects invalid values", () => {
  assert.equal(parsePageRequest("http://localhost/api?limit=500").limit, 500);
  for (const value of ["0", "-1", "501", "1.5", "abc", ""]) {
    assert.throws(() => parsePageRequest(`http://localhost/api?limit=${value}`), (error) => error.status === 400);
  }
  assert.throws(() => parsePageRequest("http://localhost/api?limit=1&limit=2"), (error) => error.status === 400);
});

test("opaque cursor round trips and malformed cursors are rejected", () => {
  const cursor = encodeCursor(ROW);
  assert.deepEqual(decodeCursor(cursor), { updated_at: "2026-09-02T10:00:00.000Z", id: "101" });
  for (const value of ["%%%", "e30", Buffer.from('{"v":2}').toString("base64url")]) {
    assert.throws(() => decodeCursor(value), (error) => error.status === 400);
  }
});

test("mapping preserves decimal text, UTC time, stable ids, account, category, and posted state", () => {
  const first = mapLedgerFlowTransaction(ROW, "project.supabase.co");
  const second = mapLedgerFlowTransaction({ ...ROW, description: "Changed" }, "project.supabase.co");
  assert.equal(first.amount, "-12.3400");
  assert.equal(first.occurred_at, "2026-09-02T00:00:00.000Z");
  assert.equal(first.external_id, second.external_id);
  assert.equal(first.account_id, ROW.account_id);
  assert.equal(first.currency, "CAD");
  assert.equal(first.category, "Food");
  assert.equal(first.transaction_type, "debit");
  assert.equal(first.state, "posted");
});

test("income, refund, savings, and unknown transaction signs are deterministic", () => {
  assert.deepEqual(mapLedgerFlowTransaction({ ...ROW, ledgerflow_type: "income" }, "x").amount, "12.3400");
  assert.equal(mapLedgerFlowTransaction({ ...ROW, transaction_class: "expense_refund" }, "x").transaction_type, "credit");
  assert.equal(mapLedgerFlowTransaction({ ...ROW, ledgerflow_type: "savings" }, "x").amount, "-12.3400");
  assert.equal(mapLedgerFlowTransaction({ ...ROW, ledgerflow_type: "unknown", amount: "12.3400" }, "x").transaction_type, "other");
});

test("category is nullable and descriptions are non-empty and bounded", () => {
  const mapped = mapLedgerFlowTransaction({ ...ROW, category: "", description: "x".repeat(1200) }, "x");
  assert.equal(mapped.category, null);
  assert.equal(mapped.description.length, 1000);
  assert.equal(mapLedgerFlowTransaction({ ...ROW, category: null, description: "" }, "x").description, "LedgerFlow transaction");
});

test("missing account identity or authoritative currency fails closed", () => {
  assert.throws(() => mapLedgerFlowTransaction({ ...ROW, account_id: null }, "x"), /account_id/);
  assert.throws(() => mapLedgerFlowTransaction({ ...ROW, currency: null }, "x"), /currency/);
});

test("page cursor advances to the last ordered row and equal timestamps use id", () => {
  const rows = [{ ...ROW, transaction_id: "101" }, { ...ROW, transaction_id: "102" }];
  const page = buildTransactionPage(rows, null, "x");
  assert.equal(decodeCursor(page.next_cursor).id, "102");
  assert.equal(page.transactions.length, 2);
});

test("an empty initial page is valid and an empty resumed page keeps its cursor", () => {
  assert.deepEqual(buildTransactionPage([], null, "x"), { transactions: [], next_cursor: null });
  assert.equal(buildTransactionPage([], "prior", "x").next_cursor, "prior");
});

test("route passes only token-owned user id and supports cursor resume", async () => {
  let received;
  const route = createTransactionRoute({
    authenticate: async () => ({ tokenId: "token-id", userId: "user-a" }),
    fetchTransactions: async (query) => { received = query; return [ROW]; },
    recordUse: async () => {},
    sourceNamespace: "x",
  });
  const first = await route(request("?limit=1"));
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(received.userId, "user-a");
  assert.equal(received.limit, 1);
  assert.equal(received.cursor, null);

  await route(request(`?cursor=${encodeURIComponent(firstBody.next_cursor)}&limit=1`));
  assert.equal(received.cursor.id, "101");
});

test("an updated existing transaction can reappear with the same external id", () => {
  const oldRow = { ...ROW, updated_at: "2026-09-02T10:00:00Z" };
  const changedRow = { ...ROW, description: "Updated coffee", updated_at: "2026-09-02T11:00:00Z" };
  const oldPage = buildTransactionPage([oldRow], null, "x");
  const changedPage = buildTransactionPage([changedRow], oldPage.next_cursor, "x");
  assert.equal(oldPage.transactions[0].external_id, changedPage.transactions[0].external_id);
  assert.notEqual(oldPage.transactions[0].description, changedPage.transactions[0].description);
});

test("route returns predictable safe errors without token leakage", async () => {
  const route = createTransactionRoute({
    authenticate: async () => { throw new ApiError(401, "unauthorized", "A valid integration token is required."); },
    fetchTransactions: async () => { throw new Error("must not run"); },
    recordUse: async () => {},
    sourceNamespace: "x",
  });
  const response = await route(request());
  const text = await response.text();
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.doesNotMatch(text, new RegExp(TOKEN));
  assert.doesNotMatch(text, /supabase|sql|stack/i);
});

test("Base44 forwarding is fallback-only so local API routes win", async () => {
  const previous = process.env.NEXT_PUBLIC_BASE44_APP_BASE_URL;
  process.env.NEXT_PUBLIC_BASE44_APP_BASE_URL = "https://base44.example";
  const rewrites = await nextConfig.rewrites();
  assert.equal(rewrites.fallback[0].source, "/api/:path*");
  assert.deepEqual(rewrites.beforeFiles, []);
  assert.deepEqual(rewrites.afterFiles, []);
  if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE44_APP_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE44_APP_BASE_URL = previous;
});

test("the integration exposes only a GET transaction route", () => {
  const routePath = "app/api/integrations/aemeath/p9c/ledgerflow/v1/transactions/route.js";
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export (?:async function|const) (?:POST|PUT|PATCH|DELETE)/);
  const routeFiles = fs.readdirSync("app/api/integrations/aemeath/p9c/ledgerflow/v1/transactions");
  assert.deepEqual(routeFiles, ["route.js"]);
});

test("token revocation changes an otherwise valid token to unauthorized", () => {
  assert.deepEqual(validateTokenRecord(record(), NOW), { tokenId: "token-id", userId: "user-a" });
  assert.throws(() => validateTokenRecord(record({ revoked_at: "2026-09-02T12:01:00Z" }), NOW), (error) => error.status === 401);
});

test("valid route authentication produces an application/json page", async () => {
  const route = createTransactionRoute({
    authenticate: async () => ({ tokenId: "t", userId: "u" }),
    fetchTransactions: async () => [ROW],
    recordUse: async () => {},
    sourceNamespace: "x",
  });
  const response = await route(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json/);
});

test("negative limits are rejected without calling authentication", async () => {
  let authenticated = false;
  const route = createTransactionRoute({
    authenticate: async () => { authenticated = true; },
    fetchTransactions: async () => [],
    recordUse: async () => {},
    sourceNamespace: "x",
  });
  assert.equal((await route(request("?limit=-5"))).status, 400);
  assert.equal(authenticated, false);
});

test("the maximum request limit is passed through unchanged", async () => {
  let receivedLimit;
  const route = createTransactionRoute({
    authenticate: async () => ({ tokenId: "t", userId: "u" }),
    fetchTransactions: async ({ limit }) => { receivedLimit = limit; return []; },
    recordUse: async () => {},
    sourceNamespace: "x",
  });
  await route(request("?limit=500"));
  assert.equal(receivedLimit, 500);
});

test("repeated pulls retain the same external id", () => {
  const first = buildTransactionPage([ROW], null, "same-project");
  const repeated = buildTransactionPage([ROW], first.next_cursor, "same-project");
  assert.equal(first.transactions[0].external_id, repeated.transactions[0].external_id);
});

test("a later update timestamp sorts after a persisted cursor", () => {
  const cursor = decodeCursor(encodeCursor(ROW));
  const changed = decodeCursor(encodeCursor({ ...ROW, updated_at: "2026-09-02T10:00:01Z" }));
  assert.ok(changed.updated_at > cursor.updated_at);
});

test("equal update timestamps have a unique transaction id tie-breaker", () => {
  const first = decodeCursor(encodeCursor({ ...ROW, transaction_id: "101" }));
  const second = decodeCursor(encodeCursor({ ...ROW, transaction_id: "102" }));
  assert.equal(first.updated_at, second.updated_at);
  assert.ok(BigInt(second.id) > BigInt(first.id));
});

test("database feed SQL constrains transactions and accounts to token owner", () => {
  const sql = fs.readFileSync("supabase/migrations/202609020001_aemeath_read_integration.sql", "utf8");
  assert.match(sql, /where transaction\.user_id = p_user_id/);
  assert.match(sql, /account\.user_id = transaction\.user_id/);
  assert.doesNotMatch(sql, /p_requested_user_id/);
});

test("token storage is hash-only and inaccessible to browser roles", () => {
  const sql = fs.readFileSync("supabase/migrations/202609020001_aemeath_read_integration.sql", "utf8");
  assert.match(sql, /token_hash text not null unique/);
  assert.doesNotMatch(sql, /token_plain|plaintext_token/);
  assert.match(sql, /revoke all on table public\.integration_tokens from public, anon, authenticated/);
});

test("the database feed is fixed read-only SQL with no financial mutation", () => {
  const sql = fs.readFileSync("supabase/migrations/202609020001_aemeath_read_integration.sql", "utf8");
  const functionBody = sql.split("create or replace function public.aemeath_fetch_transactions")[1];
  assert.match(functionBody, /select\s+transaction\.id::text/i);
  assert.doesNotMatch(functionBody, /\b(?:insert|update|delete)\s+(?:into|public\.|from)/i);
  assert.match(sql, /grant execute on function public\.aemeath_fetch_transactions[\s\S]+to service_role/);
});
