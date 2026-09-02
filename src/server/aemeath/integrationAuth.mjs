import "server-only";
import { ApiError } from "./p9cLedgerflowSchema.mjs";
import { hashIntegrationToken, readBearerToken, validateTokenRecord } from "./integrationToken.mjs";

export function createIntegrationAuthenticator(supabase) {
  return async function authenticate(request) {
    const tokenHash = hashIntegrationToken(readBearerToken(request));
    const { data, error } = await supabase
      .from("integration_tokens")
      .select("id, user_id, scope, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw new ApiError(503, "service_unavailable", "The authentication store is temporarily unavailable.");
    return validateTokenRecord(data);
  };
}

export async function recordTokenUse(supabase, tokenId) {
  const { error } = await supabase
    .from("integration_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenId);
  if (error) console.error("Aemeath integration token usage timestamp could not be updated.");
}
