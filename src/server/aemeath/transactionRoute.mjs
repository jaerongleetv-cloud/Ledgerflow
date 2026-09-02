import { ApiError, buildTransactionPage, parsePageRequest } from "./p9cLedgerflowSchema.mjs";

export function createTransactionRoute({ authenticate, fetchTransactions, recordUse, sourceNamespace }) {
  return async function GET(request) {
    try {
      const { limit, cursor } = parsePageRequest(request.url);
      const identity = await authenticate(request);
      const rows = await fetchTransactions({ userId: identity.userId, cursor, limit });
      const page = buildTransactionPage(rows, cursor ? encodePriorCursor(cursor) : null, sourceNamespace);
      await recordUse(identity.tokenId);
      return json(page, 200);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error("Aemeath transaction endpoint failed.");
      return json({ error: { code: "internal_error", message: "The transaction page could not be produced." } }, 500);
    }
  };
}

function encodePriorCursor(cursor) {
  return Buffer.from(JSON.stringify({ v: 1, updated_at: cursor.updated_at, id: cursor.id }), "utf8").toString("base64url");
}

function json(body, status) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
