import { createHash } from "node:crypto";
import { ApiError, AEMEATH_TRANSACTION_SCOPE } from "./p9cLedgerflowSchema.mjs";

const TOKEN_PATTERN = /^lf_aem_[A-Za-z0-9_-]{43}$/;

export function hashIntegrationToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || !TOKEN_PATTERN.test(match[1])) {
    throw new ApiError(401, "unauthorized", "A valid integration token is required.");
  }
  return match[1];
}

export function validateTokenRecord(record, now = new Date()) {
  if (!record || record.revoked_at || (record.expires_at && new Date(record.expires_at) <= now)) {
    throw new ApiError(401, "unauthorized", "A valid integration token is required.");
  }
  if (record.scope !== AEMEATH_TRANSACTION_SCOPE) {
    throw new ApiError(403, "forbidden", "The integration token lacks the required scope.");
  }
  return { tokenId: record.id, userId: record.user_id };
}
