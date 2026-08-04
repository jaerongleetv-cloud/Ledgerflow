import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let authenticatedUser = null;
if (env.LEDGERFLOW_TEST_EMAIL && env.LEDGERFLOW_TEST_PASSWORD) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: env.LEDGERFLOW_TEST_EMAIL,
    password: env.LEDGERFLOW_TEST_PASSWORD,
  });
  if (authError) throw new Error(`Verification sign-in failed. ${authError.message}`);
  authenticatedUser = authData.user;
}
const { data: entries, error } = await supabase
  .from("journal_entries")
  .select("transaction_id, account_id, account, debit, credit, line_no, user_id, accounts(name, type, user_id)");

if (error) {
  throw new Error(`Ledger query failed. Apply all pending Supabase migrations first. ${error.message}`);
}

const { data: accounts, error: accountsError } = await supabase
  .from("accounts")
  .select("id, name, type, user_id");

if (accountsError) {
  throw new Error(`Account query failed. ${accountsError.message}`);
}

const { data: transactions, error: transactionsError } = await supabase
  .from("transactions")
  .select("id, user_id");
if (transactionsError) throw new Error(`Transaction query failed. ${transactionsError.message}`);

const transactionPostings = new Map();
let totalDebit = 0;
let totalCredit = 0;
let missingAccounts = 0;
let nullNames = 0;
let ownershipMismatches = 0;

for (const entry of entries || []) {
  totalDebit += Number(entry.debit || 0);
  totalCredit += Number(entry.credit || 0);
  if (!entry.account_id || !entry.accounts?.name) missingAccounts += 1;
  if (!entry.accounts?.name || String(entry.accounts.name).toLowerCase() === "null") nullNames += 1;
  if (authenticatedUser && (entry.user_id !== authenticatedUser.id || entry.accounts?.user_id !== authenticatedUser.id)) ownershipMismatches += 1;
  if (entry.transaction_id) {
    const posting = transactionPostings.get(entry.transaction_id) || [];
    posting.push(entry);
    transactionPostings.set(entry.transaction_id, posting);
  }
}

const invalidPostings = [...transactionPostings.entries()].filter(([, posting]) => {
  const debit = posting.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);
  const credit = posting.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  return posting.length !== 2 || Math.abs(debit - credit) >= 0.005;
});

const result = {
  authenticated: Boolean(authenticatedUser),
  journalLines: entries?.length || 0,
  postedTransactions: transactionPostings.size,
  totalDebit: Number(totalDebit.toFixed(2)),
  totalCredit: Number(totalCredit.toFixed(2)),
  difference: Number(Math.abs(totalDebit - totalCredit).toFixed(2)),
  missingAccounts,
  nullNames,
  invalidPostingTransactionIds: invalidPostings.map(([id]) => id),
  ownershipMismatches,
  transactionOwnershipMismatches: authenticatedUser
    ? (transactions || []).filter((transaction) => transaction.user_id !== authenticatedUser.id).length
    : null,
};

const accountTotals = new Map((accounts || []).map((account) => [account.id, { ...account, debit: 0, credit: 0 }]));
for (const entry of entries || []) {
  const account = accountTotals.get(entry.account_id);
  if (!account) continue;
  account.debit += Number(entry.debit || 0);
  account.credit += Number(entry.credit || 0);
}

const normalizeType = (type) => {
  const normalized = String(type || "").trim().toLowerCase();
  return normalized === "income" ? "revenue" : normalized;
};
const balances = [...accountTotals.values()].map((account) => {
  const type = normalizeType(account.type);
  const balance = ["asset", "expense"].includes(type)
    ? account.debit - account.credit
    : account.credit - account.debit;
  return { ...account, type, balance };
});
const totalAssets = balances.filter((account) => account.type === "asset").reduce((sum, account) => sum + account.balance, 0);
const totalLiabilities = balances.filter((account) => account.type === "liability").reduce((sum, account) => sum + account.balance, 0);
const directEquity = balances.filter((account) => account.type === "equity" && !/retained earnings/i.test(account.name)).reduce((sum, account) => sum + account.balance, 0);
const openingRetainedEarnings = balances.filter((account) => account.type === "equity" && /retained earnings/i.test(account.name)).reduce((sum, account) => sum + account.balance, 0);
const cumulativeRevenue = balances.filter((account) => account.type === "revenue").reduce((sum, account) => sum + account.balance, 0);
const cumulativeExpenses = balances.filter((account) => account.type === "expense").reduce((sum, account) => sum + account.balance, 0);
const retainedEarnings = openingRetainedEarnings + cumulativeRevenue - cumulativeExpenses;
const totalEquity = directEquity + retainedEarnings;

result.balanceSheet = {
  totalAssets: Number(totalAssets.toFixed(2)),
  totalLiabilities: Number(totalLiabilities.toFixed(2)),
  retainedEarnings: Number(retainedEarnings.toFixed(2)),
  totalEquity: Number(totalEquity.toFixed(2)),
  equationDifference: Number((totalAssets - totalLiabilities - totalEquity).toFixed(2)),
};

console.log(JSON.stringify(result, null, 2));

if (!result.authenticated) {
  console.error("Ledger verification requires LEDGERFLOW_TEST_EMAIL and LEDGERFLOW_TEST_PASSWORD after strict RLS is applied.");
}

if (!result.authenticated || result.difference >= 0.01 || Math.abs(result.balanceSheet.equationDifference) >= 0.01 || missingAccounts || nullNames || ownershipMismatches || result.transactionOwnershipMismatches || invalidPostings.length) {
  process.exitCode = 1;
}
