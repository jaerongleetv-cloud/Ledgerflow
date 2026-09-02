import { createHash } from "node:crypto";

export const AEMEATH_TRANSACTION_SCOPE = "aemeath:ledgerflow:transactions:read";
export const DEFAULT_PAGE_LIMIT = 500;
export const MAX_PAGE_LIMIT = 500;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function parsePageRequest(url) {
  const requestUrl = new URL(url);
  const limits = requestUrl.searchParams.getAll("limit");
  const cursors = requestUrl.searchParams.getAll("cursor");
  if (limits.length > 1 || cursors.length > 1) {
    throw new ApiError(400, "invalid_query", "Query parameters must not be repeated.");
  }

  const rawLimit = limits[0];
  const limit = rawLimit === undefined ? DEFAULT_PAGE_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new ApiError(400, "invalid_limit", `limit must be an integer from 1 to ${MAX_PAGE_LIMIT}.`);
  }

  return { limit, cursor: decodeCursor(cursors[0]) };
}

export function encodeCursor(row) {
  const updatedAt = normalizeTimestamp(row.updated_at);
  const id = normalizeTransactionId(row.transaction_id);
  return Buffer.from(JSON.stringify({ v: 1, updated_at: updatedAt, id }), "utf8").toString("base64url");
}

export function decodeCursor(value) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError(400, "invalid_cursor", "cursor is malformed.");
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || parsed.v !== 1 || Object.keys(parsed).some((key) => !["v", "updated_at", "id"].includes(key))) {
      throw new Error("Invalid cursor payload");
    }
    return {
      updated_at: normalizeTimestamp(parsed.updated_at),
      id: normalizeTransactionId(parsed.id),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_cursor", "cursor is malformed.");
  }
}

export function mapLedgerFlowTransaction(row, sourceNamespace) {
  const transactionId = normalizeTransactionId(row.transaction_id);
  const accountId = String(row.account_id || "").trim();
  if (!accountId) throw new Error("Transaction is missing its canonical account_id.");

  const currency = String(row.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Transaction account has no valid three-letter currency.");

  const description = String(row.description || row.category || "LedgerFlow transaction").trim().slice(0, 1000);
  const { amount, transactionType } = mapAmount(row.amount, row.ledgerflow_type, row.transaction_class);
  const externalDigest = createHash("sha256")
    .update(`${sourceNamespace}:transactions:${transactionId}`, "utf8")
    .digest("hex");

  return {
    external_id: `lf_tx_${externalDigest}`,
    account_id: accountId,
    occurred_at: normalizeOccurredOn(row.occurred_on),
    description: description || "LedgerFlow transaction",
    amount,
    currency,
    category: row.category == null || String(row.category).trim() === "" ? null : String(row.category),
    transaction_type: transactionType,
    state: "posted",
  };
}

export function buildTransactionPage(rows, priorCursor, sourceNamespace) {
  const transactions = rows.map((row) => mapLedgerFlowTransaction(row, sourceNamespace));
  const nextCursor = rows.length > 0 ? encodeCursor(rows.at(-1)) : priorCursor;
  return { transactions, next_cursor: nextCursor };
}

function mapAmount(value, ledgerFlowType, transactionClass) {
  const raw = String(value ?? "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) throw new Error("Transaction amount is not an exact decimal value.");
  const absolute = raw.replace(/^[+-]/, "");
  const type = String(ledgerFlowType || "").toLowerCase();
  const txClass = String(transactionClass || "").toLowerCase();

  if (txClass === "expense_refund" || type === "income") {
    return { amount: absolute, transactionType: "credit" };
  }
  if (type === "expense" || type === "savings") {
    return { amount: `-${absolute}`, transactionType: "debit" };
  }
  return { amount: raw, transactionType: "other" };
}

function normalizeOccurredOn(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error("Transaction has no valid occurrence date.");
  }
  return `${date}T00:00:00.000Z`;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new ApiError(400, "invalid_cursor", "cursor timestamp must include a timezone.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "invalid_cursor", "cursor timestamp is invalid.");
  return date.toISOString();
}

function normalizeTransactionId(value) {
  const id = String(value ?? "");
  if (!/^[1-9]\d*$/.test(id)) throw new ApiError(400, "invalid_cursor", "cursor transaction id is invalid.");
  return id;
}
