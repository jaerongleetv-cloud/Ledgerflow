import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
    })
);
if (!env.LEDGERFLOW_TEST_EMAIL || !env.LEDGERFLOW_TEST_PASSWORD) {
  throw new Error("Set LEDGERFLOW_TEST_EMAIL and LEDGERFLOW_TEST_PASSWORD in .env.local.");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: env.LEDGERFLOW_TEST_EMAIL, password: env.LEDGERFLOW_TEST_PASSWORD });
if (authError) throw authError;
const userId = authData.user.id;
const stamp = Date.now();
const created = { account: null, category: null, asset: null, liability: null, transaction: null };
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

try {
  const { error: chartError } = await supabase.rpc("ensure_user_chart");
  if (chartError) throw chartError;

  const { data: accountId, error: accountError } = await supabase.rpc("ledger_create_account", { p_name: `Audit Account ${stamp}`, p_type: "Asset", p_opening_balance: 0, p_description: "Release audit" });
  if (accountError) throw accountError;
  created.account = accountId;
  const { data: updatedAccount, error: accountUpdateError } = await supabase.from("accounts").update({ name: `Audit Account Updated ${stamp}`, type: "Liability" }).eq("id", accountId).select().single();
  if (accountUpdateError) throw accountUpdateError;
  assert(updatedAccount.user_id === userId && updatedAccount.type === "Liability", "Account create/read/update preserves ownership");

  const { data: category, error: categoryError } = await supabase.from("categories").insert({ name: `audit-${stamp}`, type: "expense" }).select().single();
  if (categoryError) throw categoryError;
  created.category = category.id;
  assert(category.type === "expense" && category.user_id === userId, "Category create/read preserves type and ownership");
  const { data: updatedCategory, error: categoryUpdateError } = await supabase.from("categories").update({ name: `audit-updated-${stamp}`, type: "income" }).eq("id", category.id).select().single();
  if (categoryUpdateError) throw categoryUpdateError;
  assert(updatedCategory.type === "income" && updatedCategory.user_id === userId, "Category update preserves type and ownership");

  const refreshedSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: refreshAuthError } = await refreshedSupabase.auth.setSession({ access_token: authData.session.access_token, refresh_token: authData.session.refresh_token });
  if (refreshAuthError) throw refreshAuthError;
  const { data: persistedCategory, error: categoryRefreshError } = await refreshedSupabase.from("categories").select("id, name, type, user_id").eq("id", category.id).single();
  if (categoryRefreshError) throw categoryRefreshError;
  assert(persistedCategory.name === `audit-updated-${stamp}` && persistedCategory.type === "income" && persistedCategory.user_id === userId, "Category persists after client refresh");

  for (const [entity, table, payload, update] of [
    ["asset", "assets", { name: `Audit Asset ${stamp}`, category: "cash", value: 10 }, { value: 12 }],
    ["liability", "liabilities", { name: `Audit Liability ${stamp}`, category: "other", balance: 20 }, { balance: 22 }],
  ]) {
    const { data: inserted, error: insertError } = await supabase.from(table).insert(payload).select().single();
    if (insertError) throw insertError;
    created[entity] = inserted.id;
    const { data: updated, error: updateError } = await supabase.from(table).update(update).eq("id", inserted.id).select().single();
    if (updateError) throw updateError;
    assert(updated.user_id === userId, `${entity} create/read/update preserves ownership`);
  }

  const { data: chequing, error: chequingError } = await supabase.from("accounts").select("id").eq("name", "Chequing Account").single();
  if (chequingError) throw chequingError;
  const today = new Date().toISOString().slice(0, 10);
  const { data: transaction, error: transactionError } = await supabase.from("transactions").insert({ amount: 7.25, type: "expense", category: "food", description: `Audit Lunch ${stamp}`, transaction_date: today, date: today, account_id: chequing.id, recurring_type: "normal" }).select().single();
  if (transactionError) throw transactionError;
  created.transaction = transaction.id;
  let { data: lines, error: linesError } = await supabase.from("journal_entries").select("*").eq("transaction_id", transaction.id);
  if (linesError) throw linesError;
  assert(lines.length === 2 && lines.every((line) => line.user_id === userId), "Transaction creates exactly two owned journal lines");
  assert(Math.abs(lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0)) < 0.005, "Transaction posting is balanced");

  const { error: transactionUpdateError } = await supabase.from("transactions").update({ amount: 8.5 }).eq("id", transaction.id);
  if (transactionUpdateError) throw transactionUpdateError;
  ({ data: lines, error: linesError } = await supabase.from("journal_entries").select("*").eq("transaction_id", transaction.id));
  if (linesError) throw linesError;
  assert(lines.length === 2 && lines.reduce((sum, line) => sum + Number(line.debit), 0) === 8.5, "Transaction update replaces its posting without duplication");

  const { error: transactionDeleteError } = await supabase.from("transactions").delete().eq("id", transaction.id);
  if (transactionDeleteError) throw transactionDeleteError;
  created.transaction = null;
  const { count: remainingLines, error: cascadeError } = await supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("transaction_id", transaction.id);
  if (cascadeError) throw cascadeError;
  assert(remainingLines === 0, "Transaction delete cascades to journal lines");

  const { error: categoryDeleteError } = await supabase.from("categories").delete().eq("id", created.category);
  if (categoryDeleteError) throw categoryDeleteError;
  const { count: remainingCategories, error: categoryDeleteReadError } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("id", created.category);
  if (categoryDeleteReadError) throw categoryDeleteReadError;
  assert(remainingCategories === 0, "Category delete persists");
  created.category = null;

  for (const [entity, table] of [["asset", "assets"], ["liability", "liabilities"]]) {
    const { error } = await supabase.from(table).delete().eq("id", created[entity]);
    if (error) throw error;
    created[entity] = null;
    checks.push(`${entity} delete succeeds`);
  }
  const { error: accountDeleteError } = await supabase.rpc("ledger_delete_account", { p_account_id: created.account });
  if (accountDeleteError) throw accountDeleteError;
  created.account = null;
  checks.push("Unused account delete succeeds through safeguard");
} finally {
  if (created.transaction) {
    await supabase.from("journal_entries").delete().eq("transaction_id", created.transaction);
    await supabase.from("transactions").delete().eq("id", created.transaction);
  }
  if (created.category) await supabase.from("categories").delete().eq("id", created.category);
  if (created.asset) await supabase.from("assets").delete().eq("id", created.asset);
  if (created.liability) await supabase.from("liabilities").delete().eq("id", created.liability);
  if (created.account) await supabase.rpc("ledger_delete_account", { p_account_id: created.account });
}

console.log(JSON.stringify({ authenticatedUserId: userId, checks, passed: checks.length }, null, 2));
