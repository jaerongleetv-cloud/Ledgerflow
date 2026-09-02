import { getLedgerFlowSourceNamespace, getServiceSupabase } from "@/lib/server/supabase.mjs";
import { createIntegrationAuthenticator, recordTokenUse } from "@/server/aemeath/integrationAuth.mjs";
import { createTransactionReader } from "@/server/aemeath/p9cLedgerflowAdapter.mjs";
import { createTransactionRoute } from "@/server/aemeath/transactionRoute.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler;

export async function GET(request) {
  try {
    if (!handler) {
      const supabase = getServiceSupabase();
      handler = createTransactionRoute({
        authenticate: createIntegrationAuthenticator(supabase),
        fetchTransactions: createTransactionReader(supabase),
        recordUse: (tokenId) => recordTokenUse(supabase, tokenId),
        sourceNamespace: getLedgerFlowSourceNamespace(),
      });
    }
    return handler(request);
  } catch {
    console.error("Aemeath transaction endpoint could not initialize.");
    return Response.json(
      { error: { code: "internal_error", message: "The transaction page could not be produced." } },
      { status: 500, headers: { "cache-control": "private, no-store, max-age=0" } }
    );
  }
}
