"use client";

import { getAppParams } from "@/lib/app-params";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "ledgerflow_local_store";
const DEFAULT_STORE = {
  Transaction: [
    {
      id: "tx-demo-1",
      description: "Salary deposit",
      amount: 3200,
      type: "income",
      category: "salary",
      transaction_date: "2026-07-01",
      tags: ["salary", "monthly"],
      is_deductible: false,
      original_text: "Salary deposit",
    },
    {
      id: "tx-demo-2",
      description: "Groceries",
      amount: 82.4,
      type: "expense",
      category: "food",
      transaction_date: "2026-07-03",
      tags: ["groceries"],
      is_deductible: false,
      original_text: "Bought groceries",
    },
    {
      id: "tx-demo-3",
      description: "Emergency fund transfer",
      amount: 250,
      type: "savings",
      category: "savings",
      transaction_date: "2026-07-05",
      tags: ["savings"],
      is_deductible: false,
      original_text: "Transferred to savings",
    },
  ],
  Asset: [
    {
      id: "asset-demo-1",
      name: "Emergency Fund",
      category: "cash",
      value: 5400,
      institution: "Local Bank",
      notes: "Short-term reserve",
    },
  ],
  Liability: [
    {
      id: "liability-demo-1",
      name: "Credit Card",
      category: "credit_card",
      balance: 820,
      institution: "Visa",
      interest_rate: 19.9,
      minimum_payment: 45,
    },
  ],
  RecurringTransaction: [
    {
      id: "rec-demo-1",
      name: "Rent",
      amount: 1700,
      type: "expense",
      category: "rent",
      frequency: "monthly",
      next_date: "2026-07-01",
      is_active: true,
      notes: "Monthly housing cost",
    },
    {
      id: "rec-demo-2",
      name: "Freelance Income",
      amount: 1200,
      type: "income",
      category: "freelance",
      frequency: "monthly",
      next_date: "2026-07-15",
      is_active: true,
      notes: "Average freelance revenue",
    },
  ],
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readStore() {
  const storage = getStorage();
  if (!storage) {
    return structuredClone(DEFAULT_STORE);
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = structuredClone(DEFAULT_STORE);
      storage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw);
    return {
      Transaction: parsed.Transaction || [],
      Asset: parsed.Asset || [],
      Liability: parsed.Liability || [],
      RecurringTransaction: parsed.RecurringTransaction || [],
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

function persistStore(store) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ENTITY_LOCAL_FALLBACK = [];
const TRANSACTION_DELETE_MIGRATION = "202608040003_fix_transaction_delete_cascade.sql";
const FINANCIAL_RESET_MIGRATION = "202608050001_atomic_user_financial_reset.sql";

function isMissingTableError(error) {
  return error?.code === "PGRST205";
}

function isPermissionDeniedError(error) {
  return error?.code === "42501";
}

function transactionDeleteFailure(operation, transactionId, error, status) {
  const diagnostics = {
    operation,
    transactionId,
    code: error?.code || null,
    message: error?.message || "Unknown Supabase delete error",
    details: error?.details || null,
    hint: error?.hint || null,
    httpStatus: status ?? error?.status ?? null,
  };
  console.error("[LedgerFlow] Transaction delete/reset failed", diagnostics);

  let message = diagnostics.message;
  if (error?.code === "23503") {
    message = `The transaction is still linked to journal entries. Apply ${TRANSACTION_DELETE_MIGRATION}.`;
  } else if (["PGRST202", "42883"].includes(error?.code)) {
    message = `Transaction deletion is not installed. Apply ${TRANSACTION_DELETE_MIGRATION}.`;
  } else if (["42501", "P0002"].includes(error?.code)) {
    message = "The transaction was not found or you do not have permission to delete it.";
  }

  const failure = new Error(message);
  Object.assign(failure, diagnostics, { rawMessage: diagnostics.message });
  failure.message = message;
  return failure;
}

async function deleteLedgerTransaction(transactionId, operation = "delete") {
  console.info("[LedgerFlow] Transaction delete request", { operation, transactionId });
  const { data, error, status } = await supabase.rpc("ledger_delete_transaction", {
    p_transaction_id: transactionId,
  });
  if (error) throw transactionDeleteFailure(operation, transactionId, error, status);
  console.info("[LedgerFlow] Transaction delete succeeded", { operation, transactionId, httpStatus: status });
  return data;
}

async function clearLedgerTransactions() {
  const transactionId = "all-owned-transactions";
  console.info("[LedgerFlow] Transaction reset request", { transactionId });
  const { data, error, status } = await supabase.rpc("ledger_clear_transactions");
  if (error) throw transactionDeleteFailure("reset", transactionId, error, status);
  console.info("[LedgerFlow] Transaction reset succeeded", { transactionId, deletedCount: data, httpStatus: status });
  return data;
}

async function resetLedgerFinancialData() {
  const resetScope = "current-user-financial-data";
  console.info("[LedgerFlow] Financial reset request", { resetScope });
  const { data, error, status } = await supabase.rpc("ledger_reset_financial_data");
  if (error) {
    const diagnostics = {
      resetScope,
      code: error.code || null,
      message: error.message || null,
      details: error.details || null,
      hint: error.hint || null,
      httpStatus: status ?? error.status ?? null,
    };
    console.error("[LedgerFlow] Financial reset failed", diagnostics);
    const missingMigration = ["PGRST202", "42883"].includes(error.code);
    const failure = new Error(
      missingMigration
        ? `Financial reset is not installed. Apply ${FINANCIAL_RESET_MIGRATION}.`
        : error.message || "Could not reset financial data."
    );
    Object.assign(failure, diagnostics, { rawMessage: diagnostics.message });
    if (missingMigration) failure.message = `Financial reset is not installed. Apply ${FINANCIAL_RESET_MIGRATION}.`;
    throw failure;
  }
  console.info("[LedgerFlow] Financial reset succeeded", { resetScope, deleted: data, httpStatus: status });
  return data;
}

function sortRecords(items, sortField = "") {
  if (!sortField) {
    return items;
  }

  const direction = sortField.startsWith("-") ? -1 : 1;
  const normalizedField = sortField.replace(/^-/, "");

  return [...items].sort((a, b) => {
    const left = a?.[normalizedField] ?? "";
    const right = b?.[normalizedField] ?? "";

    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * direction;
    }

    return String(left).localeCompare(String(right)) * direction;
  });
}

const cap = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const normalizeAccountingType = (type) => {
  const normalized = String(type || "").trim().toLowerCase();
  return normalized === "income" ? "revenue" : normalized;
};

function getEntityRecords(entityName) {
  const store = readStore();
  return store[entityName] || [];
}

function isBadTransaction(transaction) {
  return /^Parse this financial transaction/i.test(String(transaction?.description || ""));
}

function filterCleanTransactions(transactions) {
  return (transactions || []).filter((tx) => !isBadTransaction(tx));
}

function updateEntityRecords(entityName, nextItems) {
  const store = readStore();
  store[entityName] = nextItems;
  persistStore(store);
}

const ACCOUNT_DEFINITIONS = {
  Cash: { type: "Asset", category: "cash" },
  "Bank Account": { type: "Asset", category: "bank_account" },
  "Checking Account": { type: "Asset", category: "checking_account" },
  "Chequing Account": { type: "Asset", category: "checking_account" },
  "Savings Account": { type: "Asset", category: "savings_account" },
  Vehicle: { type: "Asset", category: "vehicle" },
  "Phone Equipment": { type: "Asset", category: "phone_equipment" },
  Investment: { type: "Asset", category: "investment" },
  Equipment: { type: "Asset", category: "equipment" },
  "Credit Card Payable": { type: "Liability", category: "credit_card" },
  "Car Loan": { type: "Liability", category: "car_loan" },
  "Phone Financing": { type: "Liability", category: "phone_financing" },
  Loan: { type: "Liability", category: "loan" },
  "Owner's Equity": { type: "Equity", category: "owner_equity" },
  "Salary Revenue": { type: "Revenue", category: "salary" },
  "Freelance Revenue": { type: "Revenue", category: "freelance" },
  "Other Revenue": { type: "Revenue", category: "other" },
  "Food Expense": { type: "Expense", category: "food" },
  "Phone Expense": { type: "Expense", category: "phone" },
  "Transportation Expense": { type: "Expense", category: "transport" },
  "Rent Expense": { type: "Expense", category: "rent" },
  "Subscription Expense": { type: "Expense", category: "subscriptions" },
  "Utilities Expense": { type: "Expense", category: "utilities" },
  "Other Expense": { type: "Expense", category: "other" },
};

const ACCOUNT_NAME_ALIASES = {
  "credit card": "Credit Card Payable",
  "owner capital": "Owner's Equity",
  salary: "Salary Revenue",
  freelance: "Freelance Revenue",
  food: "Food Expense",
  transport: "Transportation Expense",
  subscription: "Subscription Expense",
  subscriptions: "Subscription Expense",
  utilities: "Utilities Expense",
  income: "Other Revenue",
  expense: "Other Expense",
  other: "Other Expense",
};

const DEFAULT_ACCOUNT_META = { type: "Expense", category: "other" };

function normalizeAccountingAccountName(accountName) {
  const trimmed = String(accountName || "").trim();
  if (!trimmed) return "Other Expense";
  return ACCOUNT_NAME_ALIASES[trimmed.toLowerCase()] || cap(trimmed);
}

function getAccountingAccountMeta(accountName) {
  const normalizedName = normalizeAccountingAccountName(accountName);
  const directMatch = ACCOUNT_DEFINITIONS[normalizedName];

  if (directMatch) {
    return directMatch;
  }

  const normalizedCategory = String(accountName || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/s$/, "");

  const categoryMatch = Object.values(ACCOUNT_DEFINITIONS).find(
    (meta) => meta.category === normalizedCategory
  );

  return categoryMatch || DEFAULT_ACCOUNT_META;
}

const TABLE_COLUMN_CACHE = {};
const STATIC_TABLE_COLUMNS = {
  accounts: ["id", "name", "type", "category", "opening_balance", "description", "user_id", "created_at"],
  transactions: ["id", "amount", "type", "category", "description", "transaction_date", "tags", "is_deductible", "category_id", "account_id", "date", "recurring_type", "transaction_class", "user_id", "created_at"],
  assets: ["id", "name", "category", "value", "institution", "notes", "user_id", "created_at"],
  liabilities: ["id", "name", "category", "balance", "institution", "interest_rate", "minimum_payment", "user_id", "created_at"],
  journal_entries: ["id", "transaction_id", "account_id", "account", "debit", "credit", "description", "entry_date", "line_no", "posting_key", "user_id", "created_at"],
  categories: ["id", "name", "type", "color", "icon", "user_id", "created_at"],
  recurring_transactions: ["id", "name", "amount", "type", "category", "frequency", "next_date", "is_active", "notes", "user_id", "created_at"],
};

function normalizeTableName(tableName) {
  return String(tableName || "").toLowerCase();
}

async function getTableColumns(tableName) {
  const normalized = normalizeTableName(tableName);
  if (TABLE_COLUMN_CACHE[normalized]) {
    return TABLE_COLUMN_CACHE[normalized];
  }

  let columns = STATIC_TABLE_COLUMNS[normalized] || null;

  try {
    const { data, error } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", normalized)
      .eq("table_schema", "public")
      .order("ordinal_position", { ascending: true });

    if (!error && data && data.length > 0) {
      columns = data.map((row) => row.column_name);
    } else if (error && !isMissingTableError(error)) {
      console.warn(`Could not load schema columns for table ${normalized}:`, error.message || JSON.stringify(error));
    }
  } catch (err) {
    console.warn(`Unable to load schema columns for table ${normalized}:`, err?.message || err);
  }

  if (!columns) {
    return null;
  }

  TABLE_COLUMN_CACHE[normalized] = columns;
  return columns;
}

async function filterPayloadForTable(tableName, payload) {
  if (!payload || typeof payload !== "object") return payload;
  const columns = await getTableColumns(tableName);
  if (!columns) return payload;
  return Object.entries(payload).reduce((next, [key, value]) => {
    if (columns.includes(key)) {
      next[key] = value;
    }
    return next;
  }, {});
}

function normalizeCategoryType(categoryType) {
  return ["income", "expense", "savings"].includes(categoryType) ? categoryType : "expense";
}

async function getCategoryId(categoryName, categoryType) {
  const normalizedName = String(categoryName || "other").trim().toLowerCase() || "other";
  const { data: existing, error: selectError } = await supabase
    .from("categories")
    .select("id")
    .eq("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error("SUPABASE ERROR:", JSON.stringify(selectError, null, 2));
    throw new Error(selectError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const filteredInsert = await filterPayloadForTable("categories", {
    name: normalizedName,
    type: normalizeCategoryType(categoryType),
  });
  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert(filteredInsert)
    .select()
    .single();

  if (insertError) {
    if (isPermissionDeniedError(insertError) || isMissingTableError(insertError)) {
      console.warn(`Could not create category "${normalizedName}":`, insertError.message);
      return null;
    }
    console.error("SUPABASE ERROR:", JSON.stringify(insertError, null, 2));
    throw new Error(insertError.message);
  }

  return inserted.id;
}

async function getAccountingAccountId(accountName) {
  const normalizedName = normalizeAccountingAccountName(accountName);
  const meta = getAccountingAccountMeta(normalizedName);
  const { data: existing, error: selectError } = await supabase
    .from("accounts")
    .select("id, type, category")
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error("SUPABASE ERROR:", JSON.stringify(selectError, null, 2));
    throw new Error(selectError.message);
  }

  if (existing?.id) {
    if ((!existing.type || !existing.category) && (meta.type || meta.category)) {
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ type: meta.type, category: meta.category })
        .eq("id", existing.id);

      if (updateError) {
        console.error("SUPABASE ERROR:", JSON.stringify(updateError, null, 2));
      }
    }
    return existing.id;
  }

  const insertData = {
    name: normalizedName,
    type: meta.type,
    category: meta.category,
  };

  const filteredInsert = await filterPayloadForTable("accounts", insertData);
  const { data: inserted, error: insertError } = await supabase
    .from("accounts")
    .insert(filteredInsert)
    .select()
    .single();

  if (insertError) {
    console.error("SUPABASE ERROR:", JSON.stringify(insertError, null, 2));
    if (isPermissionDeniedError(insertError)) {
      throw new Error("Accounting accounts are not writable. Apply the LedgerFlow accounting migration and retry.");
    }
    throw new Error(`Could not resolve accounting account "${normalizedName}": ${insertError.message}`);
  }

  if (!inserted?.id) {
    throw new Error(`Could not resolve accounting account "${normalizedName}".`);
  }
  return inserted.id;
}

function transactionClassForType(type) {
  switch (type) {
    case "income":
      return "income";
    case "expense":
      return "expense";
    case "savings":
      return "asset_increase";
    default:
      return "expense";
  }
}

function getIncomeAccountName(category) {
  if (/freelance|contract|gig/.test(category)) return "Freelance Revenue";
  if (/salary|payroll|work/.test(category)) return "Salary Revenue";
  return "Other Revenue";
}

function getExpenseAccountName(category) {
  if (/lunch|food|grocery|coffee|restaurant/.test(category)) return "Food Expense";
  if (/uber|taxi|gas|fuel|train|bus|car|travel|transport/.test(category)) return "Transportation Expense";
  if (/rent|mortgage|lease/.test(category)) return "Rent Expense";
  if (/electric|water|internet|utility|bill/.test(category)) return "Utilities Expense";
  if (/netflix|spotify|subscription|stream/.test(category)) return "Subscription Expense";
  if (/phone/.test(category)) return "Phone Expense";
  return "Other Expense";
}

function getAssetAccountName(category) {
  if (/equipment|computer|laptop|furniture/.test(category)) return "Equipment";
  if (/vehicle|car/.test(category)) return "Vehicle";
  if (/phone/.test(category)) return "Phone Equipment";
  if (/investment|stock|bond|crypto/.test(category)) return "Investment";
  if (/savings/.test(category)) return "Savings Account";
  if (/bank|checking|chequing/.test(category)) return "Bank Account";
  return "Cash";
}

function getLiabilityAccountName(category) {
  if (/credit|card/.test(category)) return "Credit Card Payable";
  if (/car.*loan|vehicle.*loan/.test(category)) return "Car Loan";
  if (/phone.*financ/.test(category)) return "Phone Financing";
  if (/loan/.test(category)) return "Loan";
  return "Credit Card Payable";
}

function buildJournalLines(transaction) {
  const amount = Math.abs(Number(transaction.amount) || 0);
  const rawDescription = transaction.description || transaction.original_text || "Transaction entry";
  const description = String(rawDescription).trim();
  const date = transaction.transaction_date || transaction.date || new Date().toISOString().split("T")[0];
  const cls = transaction.transaction_class || transactionClassForType(transaction.type);
  const category = String(transaction.category || "").toLowerCase();
  const incomeAccount = getIncomeAccountName(category);
  const expenseAccount = getExpenseAccountName(category);
  const assetAccount = getAssetAccountName(category);
  const liabilityAccount = getLiabilityAccountName(category);
  const paymentAccount = normalizeAccountingAccountName(
    transaction.account || transaction.account_name || "Chequing Account"
  );

  switch (cls) {
    case "income":
      return [
        { accountName: paymentAccount, debit: amount, credit: 0, description, date },
        { accountName: incomeAccount, debit: 0, credit: amount, description, date },
      ];
    case "expense":
      return [
        { accountName: expenseAccount, debit: amount, credit: 0, description, date },
        { accountName: paymentAccount, debit: 0, credit: amount, description, date },
      ];
    case "expense_refund":
      return [
        { accountName: paymentAccount, debit: amount, credit: 0, description, date },
        { accountName: expenseAccount, debit: 0, credit: amount, description, date },
      ];
    case "asset_increase":
      return [
        { accountName: assetAccount, debit: amount, credit: 0, description, date },
        { accountName: paymentAccount, debit: 0, credit: amount, description, date },
      ];
    case "asset_decrease":
      return [
        { accountName: paymentAccount, debit: amount, credit: 0, description, date },
        { accountName: assetAccount, debit: 0, credit: amount, description, date },
      ];
    case "liability_increase":
      return [
        { accountName: expenseAccount, debit: amount, credit: 0, description, date },
        { accountName: liabilityAccount, debit: 0, credit: amount, description, date },
      ];
    case "liability_decrease":
      return [
        { accountName: liabilityAccount, debit: amount, credit: 0, description, date },
        { accountName: paymentAccount, debit: 0, credit: amount, description, date },
      ];
    case "owner_capital":
    case "owner capital":
      return [
        { accountName: paymentAccount, debit: amount, credit: 0, description, date },
        { accountName: "Owner's Equity", debit: 0, credit: amount, description, date },
      ];
    default:
      return [
        { accountName: expenseAccount, debit: amount, credit: 0, description, date },
        { accountName: paymentAccount, debit: 0, credit: amount, description, date },
      ];
  }
}

async function insertJournalEntries(entries) {
  const transactionId = entries[0]?.transaction_id;
  if (transactionId) {
    const { data: existing, error: existingError } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("transaction_id", transactionId);

    if (existingError) throw new Error(existingError.message);
    const existingDebit = (existing || []).reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const existingCredit = (existing || []).reduce((sum, row) => sum + Number(row.credit || 0), 0);
    if ((existing || []).length === 2 && Math.abs(existingDebit - existingCredit) < 0.005) {
      return existing;
    }
    if ((existing || []).length > 0) {
      const { error: cleanupError } = await supabase
        .from("journal_entries")
        .delete()
        .eq("transaction_id", transactionId);
      if (cleanupError) throw new Error(cleanupError.message);
    }
  }

  const totalDebit = entries.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = entries.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (entries.length !== 2 || Math.abs(totalDebit - totalCredit) >= 0.005) {
    throw new Error("Journal posting must contain exactly two balanced lines.");
  }

  const resolved = await Promise.all(
    entries.map(async (line, index) => {
      const account_id = await getAccountingAccountId(line.accountName);
      if (!account_id) throw new Error(`Missing account for journal line: ${line.accountName}`);
      return {
        transaction_id: line.transaction_id,
        account_id,
        account: normalizeAccountingAccountName(line.accountName),
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        entry_date: line.date,
        line_no: index + 1,
        created_at: line.date,
      };
    })
  );

  const filteredResolved = await Promise.all(
    resolved.map(async (row) => filterPayloadForTable("journal_entries", row))
  );

  const { data, error } = await supabase.from("journal_entries").insert(filteredResolved).select();
  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }
  return data;
}

async function createJournalEntry(transaction) {
  const journalLines = buildJournalLines(transaction).map((line) => ({
    ...line,
    transaction_id: transaction.id,
  }));

  return insertJournalEntries(journalLines);
}

async function deleteAllJournalEntries() {
  const { error } = await supabase.from("journal_entries").delete().not("id", "is", null);
  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }
  return true;
}

async function cleanupBadTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .ilike("description", "Parse this financial transaction%");

  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }

  for (const transaction of data || []) {
    await deleteLedgerTransaction(transaction.id, "cleanup-bad-transaction");
  }

  return true;
}

async function rebuildJournalEntries() {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*");

  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }

  await deleteAllJournalEntries();

  const cleanTransactions = filterCleanTransactions(transactions);

  for (const transaction of cleanTransactions) {
    await createJournalEntry(transaction);
  }

  return true;
}

function migrationRequired(error) {
  if (["PGRST200", "PGRST202", "42703"].includes(error?.code)) {
    return new Error("Apply supabase/migrations/202608040001_repair_accounting_ledger.sql before using the ledger.");
  }
  return new Error(error?.message || "Accounting operation failed.");
}

async function listAccountingAccounts() {
  const { error: chartError } = await supabase.rpc("ensure_user_chart");
  if (chartError) throw migrationRequired(chartError);
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("type")
    .order("name");
  if (error) throw migrationRequired(error);
  return data || [];
}

async function listLedgerEntries({ from, to } = {}) {
  let query = supabase
    .from("journal_entries")
    .select("*, accounts(id, name, type, category)")
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (from) query = query.gte("entry_date", from);
  if (to) query = query.lte("entry_date", to);
  const { data, error } = await query;
  if (error) throw migrationRequired(error);

  return (data || []).map((entry) => ({
    ...entry,
    account_name: entry.accounts?.name || entry.account || "Uncategorized Account",
    account_type: entry.accounts?.type || "Expense",
    entry_date: entry.entry_date || entry.created_at?.slice(0, 10),
  }));
}

async function createAccountingAccount(input) {
  const { data, error } = await supabase.rpc("ledger_create_account", {
    p_name: input.name,
    p_type: input.type,
    p_opening_balance: Number(input.opening_balance || 0),
    p_description: input.description || null,
  });
  if (error) throw migrationRequired(error);
  return data;
}

async function updateAccountingAccount(id, changes) {
  const filteredChanges = await filterPayloadForTable("accounts", changes);
  const { data, error } = await supabase
    .from("accounts")
    .update(filteredChanges)
    .eq("id", id)
    .select()
    .single();
  if (error) throw migrationRequired(error);

  if (changes.name) {
    const { error: journalError } = await supabase
      .from("journal_entries")
      .update({ account: changes.name })
      .eq("account_id", id);
    if (journalError) throw migrationRequired(journalError);
  }
  return data;
}

async function mergeAccountingAccounts(sourceId, targetId) {
  const { error } = await supabase.rpc("ledger_merge_accounts", {
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  if (error) throw migrationRequired(error);
  return true;
}

async function deleteAccountingAccount(id) {
  const { error } = await supabase.rpc("ledger_delete_account", { p_account_id: id });
  if (error) throw migrationRequired(error);
  return true;
}

async function listJournalEntries() {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, accounts(id, name, type, category)");

  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }

  return (data || []).map((entry) => {
    const accountName = entry.accounts?.name || entry.account || "Uncategorized Account";
    const accountMeta = getAccountingAccountMeta(accountName);
    return {
      ...entry,
      account_name: accountName,
      account_type: entry.accounts?.type || accountMeta.type || "Expense",
      account_category: accountMeta.category || "Unknown",
    };
  });
}

async function generateTrialBalance() {
  const entries = await listJournalEntries();
  const accounts = entries.reduce((acc, entry) => {
    const accountKey = entry.account_name || `unknown-${entry.account || "Unknown Account"}`;
    acc[accountKey] = acc[accountKey] || {
      account_name: accountKey,
      account_type: entry.account_type || "Unknown",
      debit: 0,
      credit: 0,
    };
    acc[accountKey].debit += Number(entry.debit || 0);
    acc[accountKey].credit += Number(entry.credit || 0);
    return acc;
  }, {});

  const totalDebit = Object.values(accounts).reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = Object.values(accounts).reduce((sum, item) => sum + item.credit, 0);

  return {
    totalDebit,
    totalCredit,
    accounts: Object.values(accounts),
    balanced: totalDebit === totalCredit,
  };
}

async function generateIncomeStatement() {
  const entries = await listJournalEntries();

  const incomeByAccount = entries.reduce((acc, entry) => {
    if (normalizeAccountingType(entry.account_type) !== "revenue") return acc;
    const key = entry.account_name || "Unknown Account";
    acc[key] = acc[key] || 0;
    acc[key] += Number(entry.credit || 0) - Number(entry.debit || 0);
    return acc;
  }, {});

  const expenseByAccount = entries.reduce((acc, entry) => {
    if (normalizeAccountingType(entry.account_type) !== "expense") return acc;
    const key = entry.account_name || "Unknown Account";
    acc[key] = acc[key] || 0;
    acc[key] += Number(entry.debit || 0) - Number(entry.credit || 0);
    return acc;
  }, {});

  const revenue = Object.values(incomeByAccount).reduce((sum, value) => sum + value, 0);
  const expenses = Object.values(expenseByAccount).reduce((sum, value) => sum + value, 0);

  return {
    incomeByAccount,
    expenseByAccount,
    revenue,
    expenses,
    netIncome: revenue - expenses,
  };
}

async function generateBalanceSheet() {
  const trial = await generateTrialBalance();
  const assetBalance = trial.accounts
    .filter((account) => normalizeAccountingType(account.account_type) === "asset")
    .reduce((sum, account) => sum + account.debit - account.credit, 0);
  const liabilityBalance = trial.accounts
    .filter((account) => normalizeAccountingType(account.account_type) === "liability")
    .reduce((sum, account) => sum + account.credit - account.debit, 0);
  const equityBalance = trial.accounts
    .filter((account) => normalizeAccountingType(account.account_type) === "equity")
    .reduce((sum, account) => sum + account.credit - account.debit, 0);

  const incomeStatement = await generateIncomeStatement();
  const retainedEarnings = incomeStatement.netIncome;

  return {
    assets: assetBalance,
    liabilities: liabilityBalance,
    equity: equityBalance + retainedEarnings,
    details: {
      accounts: trial.accounts,
      retainedEarnings,
    },
  };
}

function createEntityManager(entityName) {
  const tableMap = {
    Transaction: "transactions",
    Category: "categories",
    Account: "accounts",
    Asset: "assets",
    Liability: "liabilities",
    RecurringTransaction: "recurring_transactions",
  };

  const table = tableMap[entityName];

  return {
    list: async (sortField = "", limit = 200) => {
      if (!table) return [];

      const query = entityName === "Transaction"
        ? supabase.from(table).select(`
            *,
            categories (
              name
            ),
            accounts (
              name
            )
          `)
        : supabase.from(table).select("*");

      const { data, error } = await query.limit(limit);

      if (error) {
        console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
        if (ENTITY_LOCAL_FALLBACK.includes(entityName) && isMissingTableError(error)) {
          return getEntityRecords(entityName);
        }
        throw new Error(error.message);
      }

      if (entityName === "Transaction") {
        return (data || []).map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          transaction_date: t.transaction_date || t.date,
          category: t.categories?.name || t.category || "",
          account: t.accounts?.name || t.account || "",
          created_date: t.created_at,
          recurring_type: t.recurring_type || "normal",
          original_text: t.original_text || "",
          tags: t.tags || [],
          is_deductible: t.is_deductible || false,
        }));
      }

      return sortRecords(data || [], sortField);
    },

    create: async (input) => {
      try {
        if (entityName === "Transaction") {
          const dateValue = input.transaction_date || new Date().toISOString().split("T")[0];
          const categoryValue = input.category || "other";
          const accountName = input.account || input.account_name || "Chequing Account";
          const [category_id, account_id] = await Promise.all([
            input.category_id ? Promise.resolve(input.category_id) : getCategoryId(categoryValue, input.type),
            input.account_id ? Promise.resolve(input.account_id) : getAccountingAccountId(accountName),
          ]);
          const payload = {
            amount: input.amount,
            type: input.type,
            description: input.description,
            original_text: input.original_text,
            transaction_date: dateValue,
            date: dateValue,
            category: categoryValue,
            category_id,
            account_id,
            account: accountName,
            recurring_type: input.recurring_type || "normal",
            transaction_class: input.transaction_class || null,
            tags: input.tags || [],
            is_deductible: input.is_deductible || false,
          };

          const filteredPayload = await filterPayloadForTable("transactions", payload);

          const { data, error } = await supabase
            .from("transactions")
            .insert(filteredPayload)
            .select()
            .single();

          if (error) {
            console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
            throw new Error(error.message);
          }

          console.log("INSERT SUCCESS:", data);
          try {
            await createJournalEntry({ ...data, category: categoryValue, account: accountName });
          } catch (journalError) {
            await deleteLedgerTransaction(data.id, "rollback-failed-posting");
            throw new Error(`Transaction was not saved because its ledger posting failed: ${journalError?.message || journalError}`);
          }
          return data;
        }

        const entityInput = entityName === "Category"
          ? { ...input, type: normalizeCategoryType(input.type) }
          : input;
        const filteredInput = await filterPayloadForTable(table, entityInput);
        const { data, error } = await supabase
          .from(table)
          .insert(filteredInput)
          .select()
          .single();

        if (error) {
          console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
          if (ENTITY_LOCAL_FALLBACK.includes(entityName) && isMissingTableError(error)) {
            const fallbackItem = {
              id: input.id || createId(entityName.toLowerCase()),
              ...input,
            };
            const existing = getEntityRecords(entityName);
            updateEntityRecords(entityName, [...existing, fallbackItem]);
            return fallbackItem;
          }
          throw new Error(error.message);
        }

        return data;
      } catch (err) {
        console.error("CREATE FAILED:", err);
        throw err;
      }
    },

    update: async (id, changes) => {
      const filteredChanges = await filterPayloadForTable(table, changes);
      if (!filteredChanges || Object.keys(filteredChanges).length === 0) {
        const { data, error } = await supabase
          .from(table)
          .select()
          .eq("id", id)
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from(table)
        .update(filteredChanges)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    delete: async (id) => {
      if (entityName === "Transaction") {
        await deleteLedgerTransaction(id);
        return true;
      }

      const { error, status } = await supabase
        .from(table)
        .delete()
        .eq("id", id);

      if (error) {
        console.error("[LedgerFlow] Entity delete failed", {
          entityName,
          id,
          code: error.code || null,
          message: error.message || null,
          details: error.details || null,
          hint: error.hint || null,
          httpStatus: status ?? null,
        });
        throw error;
      }

      return true;
    },
    clearAll: async () => {
      if (entityName !== "Transaction") {
        throw new Error(`Bulk clear is not supported for ${entityName}`);
      }
      return clearLedgerTransactions();
    },
  };
}

function buildInsights(transactions) {
  const totalIncome = transactions.filter((t) => t.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalSavings = transactions.filter((t) => t.type === "savings").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
      return acc;
    }, {});

  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  if (!transactions.length) {
    return [{ emoji: "✨", text: "Add a few transactions to start tracking your money." }];
  }

  const items = [];
  if (totalExpenses > totalIncome) {
    items.push({ emoji: "⚠️", text: `Spending is above income by $${(totalExpenses - totalIncome).toFixed(0)}.` });
  }
  if (topCategory) {
    items.push({ emoji: "📊", text: `${topCategory[0]} is your biggest expense category.` });
  }
  if (totalSavings > 0) {
    items.push({ emoji: "💚", text: `You are setting aside $${totalSavings.toFixed(0)} for savings.` });
  }

  return items.slice(0, 3);
}

function getStructuredRelativeDate(text) {
  const lower = String(text || "").toLowerCase();
  const date = new Date();

  if (/\byesterday\b/.test(lower)) {
    date.setDate(date.getDate() - 1);
  } else if (/\btomorrow\b/.test(lower)) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split("T")[0];
}

function getStructuredAccountName(lower) {
  if (/\bchequing\b/.test(lower)) return "Chequing Account";
  if (/\bchecking\b/.test(lower)) return "Checking Account";
  if (/\bsavings?\b/.test(lower)) return "Savings Account";
  if (/\bcredit card|visa|mastercard|amex\b/.test(lower)) return "Credit Card";
  if (/\bbank\b/.test(lower)) return "Bank Account";
  return null;
}

function getStructuredDescription(text, type, category) {
  const cleaned = text
    .replace(/(?:CAD\s*|\$)?\d[\d,]*(?:\.\d+)?/gi, "")
    .replace(/\b(got paid|paid for|spent|paid|bought|purchase|lost|cost|bill|earned|salary|received|income|deposit|saved|put aside|invested|charged|refunded|refund|reimbursed|using|today|yesterday|tomorrow|monthly|every month|per month)\b/gi, "")
    .replace(/\b(for|on|to|at|from|into|my|me)\b/gi, "")
    .replace(/\b(chequing|checking|savings?|account|credit card|work)\b/gi, "")
    .replace(/[^\x00-\x7F\w\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const description = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (description) return description;
  if (type === "income") return category === "freelance" ? "Freelance Income" : "Work";
  if (type === "savings") return "Savings";
  return cap(category) || "Transaction";
}

function parseStructuredTransactionText(input) {
  const raw = String(input || "").trim();
  const promptMatch = raw.match(/Parse this financial transaction:\s*["']?(.*?)["']?$/i);
  const text = promptMatch ? promptMatch[1].trim() : raw;
  const lower = text.toLowerCase();
  const currencyAmounts = [...text.matchAll(/(?:CAD\s*|\$)\s*(\d[\d,]*(?:\.\d+)?)/gi)]
    .map((match) => Number(match[1].replace(/,/g, "")));
  const fallbackAmount = text.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
  const amount = currencyAmounts[0] || (fallbackAmount ? Number(fallbackAmount[1].replace(/,/g, "")) : 0);
  const account = getStructuredAccountName(lower);
  const monthlyMatch = /\bmonthly|every month|per month\b/.test(lower);
  const splitFinancingMatch = /\bfinanc(?:ed|ing)\b/.test(lower) && /\bpaid\b/.test(lower) && currencyAmounts.length >= 2;

  if (splitFinancingMatch) {
    return {
      unsupported_reason: "Split-payment and financed purchases need a multi-line transaction editor. Nothing was saved.",
      amount: 0,
    };
  }

  const incomeMatch = /\b(?:got paid|salary|received|earned|income|deposit|paycheck|paycheque|work)\b/.test(lower);
  const savingsMatch = /\b(?:saved|put aside|invested)\b/.test(lower);
  const expenseMatch = /\b(?:spent|paid|bought|purchase|expense|lost|charged)\b/.test(lower);
  const assetIncreaseMatch = /\b(?:bought|purchased|invested|saved|put aside|transferred)\b/.test(lower) && /\b(?:equipment|phone|vehicle|investment|account|savings|asset)\b/.test(lower);
  const liabilityIncreaseMatch = /\b(?:used|charged|charge|swiped)\b.*\bcredit card\b/.test(lower);
  const liabilityDecreaseMatch = /\b(?:paid off|paid down|loan payment|loan repayment)\b/.test(lower);
  const refundMatch = /\b(?:refund|refunded|reimbursed|reimbursement)\b/.test(lower);

  let type = "expense";
  let category = "other";
  let transaction_class = null;

  if (refundMatch) {
    type = "income";
    transaction_class = "expense_refund";
  } else if (liabilityDecreaseMatch) {
    category = /loan/.test(lower) ? "loan" : "credit_card";
    transaction_class = "liability_decrease";
  } else if (assetIncreaseMatch) {
    transaction_class = "asset_increase";
  } else if (liabilityIncreaseMatch) {
    transaction_class = "liability_increase";
  } else if (savingsMatch) {
    type = "savings";
    category = /invest/.test(lower) ? "investment" : "savings";
  } else if (incomeMatch && !expenseMatch) {
    type = "income";
    category = /freelance|contract|gig/.test(lower) ? "freelance" : "salary";
  }

  if (type === "expense" || transaction_class === "expense_refund") {
    if (/starbucks|lunch|food|grocery|coffee|restaurant/.test(lower)) category = "food";
    else if (/\b(?:uber|taxi|gas|fuel|train|bus|car)\b/.test(lower)) category = "transport";
    else if (/rent|mortgage|lease/.test(lower)) category = "rent";
    else if (/electric|water|internet|utility|bill/.test(lower)) category = "utilities";
    else if (/netflix|spotify|subscription|stream/.test(lower)) category = "subscriptions";
    else if (/movie|game|entertainment|concert/.test(lower)) category = "entertainment";
    else if (/\bphone\b/.test(lower)) category = transaction_class === "asset_increase" ? "phone_equipment" : "phone";
    else if (/shop|amazon|clothes|purchase/.test(lower)) category = "shopping";
    else if (/doctor|health|hospital|pharmacy/.test(lower)) category = "health";
    else if (/travel|flight|hotel/.test(lower)) category = "travel";
    else if (/gift|present/.test(lower)) category = "gift";
  }

  return {
    amount,
    type,
    category,
    description: getStructuredDescription(text, type, category),
    account: account || (type === "income" ? "Bank Account" : "Cash"),
    recurring_type: monthlyMatch ? "monthly" : "normal",
    transaction_class,
    transaction_date: getStructuredRelativeDate(text),
    tags: lower.split(/\s+/).filter(Boolean).slice(0, 4),
    is_deductible: /business|medical|education|work/.test(lower),
  };
}

function createBase44Client() {
  const params = getAppParams();

  return {
    appId: params.appId || process.env.NEXT_PUBLIC_BASE44_APP_ID || "local",
    auth: {
      me: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) throw new Error("Authentication required");
        return data.user;
      },
      logout: () => supabase.auth.signOut(),
      redirectToLogin: () => {
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
      },
    },
    entities: {
      Transaction: createEntityManager("Transaction"),
      Account: createEntityManager("Account"),
      Category: createEntityManager("Category"),
      Asset: createEntityManager("Asset"),
      Liability: createEntityManager("Liability"),
      RecurringTransaction: createEntityManager("RecurringTransaction"),
    },
    integrations: {
      Core: {
        InvokeLLM: async ({ prompt }) => {
          const parsed = parseStructuredTransactionText(prompt || "");
          return parsed;
        },
      },
    },
    accounting: {
      createJournalEntry,
      createAccount: createAccountingAccount,
      updateAccount: updateAccountingAccount,
      mergeAccounts: mergeAccountingAccounts,
      deleteAccount: deleteAccountingAccount,
      listAccounts: listAccountingAccounts,
      listJournalEntries: listLedgerEntries,
      generateTrialBalance,
      generateIncomeStatement,
      generateBalanceSheet,
      cleanupBadTransactions,
      rebuildJournalEntries,
      resetFinancialData: resetLedgerFinancialData,
    },
  };
}

export const base44 = createBase44Client();
export const db = base44;
export default base44;
