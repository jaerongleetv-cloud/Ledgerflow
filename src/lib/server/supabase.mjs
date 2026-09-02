import "server-only";
import { createClient } from "@supabase/supabase-js";

let serviceClient;

export function getServiceSupabase() {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("LedgerFlow server integration environment is not configured.");
  }

  serviceClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return serviceClient;
}

export function getLedgerFlowSourceNamespace() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("LedgerFlow source namespace is not configured.");
  return new URL(url).host.toLowerCase();
}
