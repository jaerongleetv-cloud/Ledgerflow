import "server-only";
import { ApiError } from "./p9cLedgerflowSchema.mjs";

export function createTransactionReader(supabase) {
  return async function fetchTransactions({ userId, cursor, limit }) {
    const { data, error } = await supabase.rpc("aemeath_fetch_transactions", {
      p_user_id: userId,
      p_after_updated_at: cursor?.updated_at || null,
      p_after_id: cursor?.id || null,
      p_limit: limit,
    });

    if (error) {
      console.error("Aemeath transaction feed query failed.", { code: error.code || "unknown" });
      const unavailable = ["PGRST202", "42P01", "42703"].includes(error.code);
      throw new ApiError(
        unavailable ? 503 : 500,
        unavailable ? "service_unavailable" : "internal_error",
        unavailable ? "The transaction feed is temporarily unavailable." : "The transaction page could not be produced."
      );
    }
    return data || [];
  };
}
