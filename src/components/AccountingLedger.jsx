"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, Loader2, MoreHorizontal, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const GROUP_LABELS = {
  Asset: "ASSETS",
  Liability: "LIABILITIES",
  Equity: "EQUITY",
  Revenue: "REVENUE",
  Expense: "EXPENSES",
};

const TYPE_STYLES = {
  Asset: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  Liability: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
  Equity: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100",
  Revenue: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100",
  Expense: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
};

const EMPTY_ACCOUNT = { name: "", type: "Asset", opening_balance: "0", description: "" };
const money = (amount) => `$${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function normalizeAccountType(rawType) {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (normalized === "income") return "revenue";
  return ["asset", "liability", "equity", "revenue", "expense"].includes(normalized)
    ? normalized
    : "unknown";
}

function balanceForType(type, debit, credit) {
  if (["asset", "expense"].includes(type)) return debit - credit;
  if (["liability", "equity", "revenue"].includes(type)) return credit - debit;
  return debit - credit;
}

export function calculateBalanceSheet(accounts, entries) {
  const totalsByAccount = new Map();
  for (const entry of entries || []) {
    const key = entry.account_id || `legacy:${entry.account_name || entry.account || "Uncategorized Account"}`;
    const totals = totalsByAccount.get(key) || { debit: 0, credit: 0 };
    totals.debit += Number(entry.debit || 0);
    totals.credit += Number(entry.credit || 0);
    totalsByAccount.set(key, totals);
  }

  const rows = (accounts || []).map((account) => {
    const totals = totalsByAccount.get(account.id) || { debit: 0, credit: 0 };
    const normalizedType = normalizeAccountType(account.type);
    const isRetainedEarnings = normalizedType === "equity" && /retained earnings/i.test(account.name || "");
    const section = isRetainedEarnings
      ? "Retained Earnings"
      : ({ asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Excluded - Revenue", expense: "Excluded - Expense" }[normalizedType] || "Unclassified");
    return {
      id: account.id,
      name: account.name || "Uncategorized Account",
      rawType: account.type,
      normalizedType,
      debit: totals.debit,
      credit: totals.credit,
      balance: balanceForType(normalizedType, totals.debit, totals.credit),
      section,
      isRetainedEarnings,
    };
  });

  for (const entry of entries || []) {
    if (entry.account_id && rows.some((row) => row.id === entry.account_id)) continue;
    const key = entry.account_id || `legacy:${entry.account_name || entry.account || "Uncategorized Account"}`;
    if (rows.some((row) => row.id === key)) continue;
    const totals = totalsByAccount.get(key) || { debit: 0, credit: 0 };
    const normalizedType = normalizeAccountType(entry.account_type);
    rows.push({
      id: key,
      name: entry.account_name || entry.account || "Uncategorized Account",
      rawType: entry.account_type || "Unknown",
      normalizedType,
      debit: totals.debit,
      credit: totals.credit,
      balance: balanceForType(normalizedType, totals.debit, totals.credit),
      section: ({ asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Excluded - Revenue", expense: "Excluded - Expense" }[normalizedType] || "Unclassified"),
      isRetainedEarnings: false,
    });
  }

  const assets = rows.filter((row) => row.normalizedType === "asset").sort((a, b) => a.name.localeCompare(b.name));
  const liabilities = rows.filter((row) => row.normalizedType === "liability").sort((a, b) => a.name.localeCompare(b.name));
  const equity = rows.filter((row) => row.normalizedType === "equity" && !row.isRetainedEarnings).sort((a, b) => a.name.localeCompare(b.name));
  const openingRetainedEarnings = rows.filter((row) => row.isRetainedEarnings).reduce((sum, row) => sum + row.balance, 0);
  const cumulativeRevenue = rows.filter((row) => row.normalizedType === "revenue").reduce((sum, row) => sum + row.balance, 0);
  const cumulativeExpenses = rows.filter((row) => row.normalizedType === "expense").reduce((sum, row) => sum + row.balance, 0);
  const retainedEarnings = openingRetainedEarnings + cumulativeRevenue - cumulativeExpenses;
  const totalAssets = assets.reduce((sum, row) => sum + row.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + row.balance, 0);
  const contributedEquity = equity.reduce((sum, row) => sum + row.balance, 0);
  const totalEquity = contributedEquity + retainedEarnings;

  return {
    rows,
    assets,
    liabilities,
    equity,
    openingRetainedEarnings,
    cumulativeRevenue,
    cumulativeExpenses,
    retainedEarnings,
    totalAssets,
    totalLiabilities,
    contributedEquity,
    totalEquity,
    equationDifference: totalAssets - totalLiabilities - totalEquity,
  };
}

function printWindow(title, html) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:36px;font-size:12px}h1{font-size:22px;margin-bottom:2px}
    table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}
    th:nth-child(n+3),td:nth-child(n+3){text-align:right}.t-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
    .t-card{border:1px solid #bbb;padding:12px}.t-inner{display:grid;grid-template-columns:1fr 1fr}.t-side{padding:0 8px}.t-side+div{border-left:1px solid #bbb}
    button,[data-actions]{display:none!important}
  </style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function useLedger(dateFrom, dateTo) {
  const entriesQuery = useQuery({
    queryKey: ["ledger-entries", dateFrom, dateTo],
    queryFn: () => db.accounting.listJournalEntries({ from: dateFrom, to: dateTo }),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounting-accounts"],
    queryFn: () => db.accounting.listAccounts(),
  });
  return { entriesQuery, accountsQuery };
}

function LedgerState({ query }) {
  if (query.isLoading) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading ledger</div>;
  }
  if (query.error) {
    return <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{query.error.message}</div>;
  }
  return null;
}

export function BalanceSheet({ dateTo, dateLabel }) {
  const printRef = useRef(null);
  const { entriesQuery, accountsQuery } = useLedger(undefined, dateTo);
  const statement = useMemo(
    () => calculateBalanceSheet(accountsQuery.data || [], entriesQuery.data || []),
    [accountsQuery.data, entriesQuery.data]
  );

  useEffect(() => {
    if (entriesQuery.isLoading || accountsQuery.isLoading || entriesQuery.error || accountsQuery.error) return;
    console.groupCollapsed(`[LedgerFlow] Balance Sheet diagnostics as of ${dateTo}`);
    console.table(statement.rows.map((row) => ({
      account: row.name,
      raw_account_type: row.rawType,
      normalized_account_type: row.normalizedType,
      debit_total: Number(row.debit.toFixed(2)),
      credit_total: Number(row.credit.toFixed(2)),
      calculated_balance: Number(row.balance.toFixed(2)),
      balance_sheet_section: row.section,
    })));
    console.log({
      total_assets: Number(statement.totalAssets.toFixed(2)),
      total_liabilities: Number(statement.totalLiabilities.toFixed(2)),
      contributed_equity: Number(statement.contributedEquity.toFixed(2)),
      opening_retained_earnings: Number(statement.openingRetainedEarnings.toFixed(2)),
      cumulative_revenue: Number(statement.cumulativeRevenue.toFixed(2)),
      cumulative_expenses: Number(statement.cumulativeExpenses.toFixed(2)),
      retained_earnings: Number(statement.retainedEarnings.toFixed(2)),
      total_equity: Number(statement.totalEquity.toFixed(2)),
      equation_difference: Number(statement.equationDifference.toFixed(2)),
    });
    console.groupEnd();
  }, [accountsQuery.error, accountsQuery.isLoading, dateTo, entriesQuery.error, entriesQuery.isLoading, statement]);

  const renderAccounts = (items) => items.length === 0
    ? <p className="py-3 text-xs text-muted-foreground">No accounts</p>
    : items.map((account) => (
      <div key={account.id} className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
        <span>{account.name || "Uncategorized Account"}</span>
        <span className="tabular-nums font-medium">{money(account.balance)}</span>
      </div>
    ));

  const loadingQuery = entriesQuery.error ? entriesQuery : accountsQuery.error ? accountsQuery : entriesQuery.isLoading ? entriesQuery : accountsQuery;
  const difference = Math.abs(statement.equationDifference);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => printWindow("Balance Sheet", printRef.current?.innerHTML || "")}>
          <Printer className="mr-2 h-4 w-4" />Print
        </Button>
      </div>
      <LedgerState query={loadingQuery} />
      {!entriesQuery.isLoading && !accountsQuery.isLoading && !entriesQuery.error && !accountsQuery.error && (
        <div ref={printRef}>
          <h1 className="text-xl font-bold">Balance Sheet</h1>
          <p className="mb-5 text-xs text-muted-foreground">As of {dateLabel}</p>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <section>
              <h2 className="border-b-2 pb-2 text-xs font-bold tracking-wide">ASSETS</h2>
              {renderAccounts(statement.assets)}
              <div className="mt-2 flex justify-between border-t-2 py-2 font-bold">
                <span>TOTAL ASSETS</span><span className="tabular-nums text-emerald-700">{money(statement.totalAssets)}</span>
              </div>
            </section>

            <div className="space-y-7">
              <section>
                <h2 className="border-b-2 pb-2 text-xs font-bold tracking-wide">LIABILITIES</h2>
                {renderAccounts(statement.liabilities)}
                <div className="mt-2 flex justify-between border-t-2 py-2 font-semibold">
                  <span>Total Liabilities</span><span className="tabular-nums text-red-600">{money(statement.totalLiabilities)}</span>
                </div>
              </section>

              <section>
                <h2 className="border-b-2 pb-2 text-xs font-bold tracking-wide">EQUITY</h2>
                {renderAccounts(statement.equity)}
                <div className="flex items-center justify-between border-b py-2 text-sm">
                  <span>Retained Earnings</span><span className="tabular-nums font-medium">{money(statement.retainedEarnings)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t-2 py-2 font-semibold">
                  <span>Total Equity</span><span className="tabular-nums text-blue-700">{money(statement.totalEquity)}</span>
                </div>
              </section>

              <div className="flex justify-between border-t-2 py-2 font-bold">
                <span>TOTAL LIABILITIES + EQUITY</span>
                <span className="tabular-nums">{money(statement.totalLiabilities + statement.totalEquity)}</span>
              </div>
            </div>
          </div>

          <p className={`mt-4 text-xs font-medium ${difference < 0.01 ? "text-emerald-600" : "text-orange-600"}`}>
            {difference < 0.01 ? "Assets equal liabilities plus equity" : `Accounting equation difference: ${money(difference)}`}
          </p>
        </div>
      )}
    </div>
  );
}

export function IncomeStatement({ dateFrom, dateTo, dateLabel }) {
  const printRef = useRef(null);
  const { entriesQuery } = useLedger(dateFrom, dateTo);
  const statement = useMemo(() => {
    const grouped = new Map();
    for (const entry of entriesQuery.data || []) {
      const type = normalizeAccountType(entry.account_type);
      if (!["revenue", "expense"].includes(type)) continue;
      const key = entry.account_id || `${entry.account_name}:${type}`;
      const row = grouped.get(key) || { id: key, name: entry.account_name || "Uncategorized Account", type, debit: 0, credit: 0 };
      row.debit += Number(entry.debit || 0);
      row.credit += Number(entry.credit || 0);
      grouped.set(key, row);
    }
    const rows = [...grouped.values()].map((row) => ({
      ...row,
      balance: row.type === "revenue" ? row.credit - row.debit : row.debit - row.credit,
    }));
    const revenue = rows.filter((row) => row.type === "revenue").sort((a, b) => a.name.localeCompare(b.name));
    const expenses = rows.filter((row) => row.type === "expense").sort((a, b) => a.name.localeCompare(b.name));
    const totalRevenue = revenue.reduce((sum, row) => sum + row.balance, 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.balance, 0);
    return { revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
  }, [entriesQuery.data]);

  const renderSection = (rows, totalLabel, total, color) => (
    <section className="mb-6">
      {rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No activity in this period</p> : rows.map((row) => (
        <div key={row.id} className="flex justify-between border-b py-2 text-sm"><span>{row.name}</span><span className="tabular-nums">{money(row.balance)}</span></div>
      ))}
      <div className="mt-2 flex justify-between border-t-2 py-2 font-bold"><span>{totalLabel}</span><span className={`tabular-nums ${color}`}>{money(total)}</span></div>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => printWindow("Income Statement", printRef.current?.innerHTML || "")}><Printer className="mr-2 h-4 w-4" />Print</Button></div>
      <LedgerState query={entriesQuery} />
      {!entriesQuery.isLoading && !entriesQuery.error && (
        <div ref={printRef}>
          <h1 className="text-xl font-bold">Income Statement</h1><p className="mb-5 text-xs text-muted-foreground">{dateLabel}</p>
          <h2 className="border-b-2 pb-2 text-xs font-bold tracking-wide">REVENUE</h2>
          {renderSection(statement.revenue, "Total Revenue", statement.totalRevenue, "text-emerald-700")}
          <h2 className="border-b-2 pb-2 text-xs font-bold tracking-wide">EXPENSES</h2>
          {renderSection(statement.expenses, "Total Expenses", statement.totalExpenses, "text-red-600")}
          <div className="flex justify-between border-y-2 py-3 text-base font-bold"><span>NET INCOME / (LOSS)</span><span className={`tabular-nums ${statement.netIncome >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(statement.netIncome)}</span></div>
        </div>
      )}
    </div>
  );
}

export function TrialBalance({ dateFrom, dateTo, dateLabel }) {
  const { entriesQuery } = useLedger(dateFrom, dateTo);
  const rows = useMemo(() => {
    const grouped = new Map();
    for (const entry of entriesQuery.data || []) {
      const name = entry.account_name || "Uncategorized Account";
      const key = entry.account_id || `${name}:${entry.account_type || "Expense"}`;
      const current = grouped.get(key) || { name, type: entry.account_type || "Expense", debit: 0, credit: 0 };
      current.debit += Number(entry.debit || 0);
      current.credit += Number(entry.credit || 0);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) || a.name.localeCompare(b.name));
  }, [entriesQuery.data]);

  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const contentId = "trial-balance-print";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => printWindow("Trial Balance", document.getElementById(contentId)?.innerHTML || "")}>
          <Printer className="mr-2 h-4 w-4" />Print
        </Button>
      </div>
      <LedgerState query={entriesQuery} />
      {!entriesQuery.isLoading && !entriesQuery.error && (
        <div id={contentId}>
          <h1 className="text-xl font-bold">Trial Balance</h1>
          <p className="mb-5 text-xs text-muted-foreground">{dateLabel}</p>
          <div className="overflow-x-auto border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-left">Account</th><th className="p-3 text-left">Type</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No journal entries in this period</td></tr>}
                {rows.map((row) => (
                  <tr key={`${row.name}:${row.type}`} className="border-t">
                    <td className="p-3">{row.name || "Uncategorized Account"}</td><td className="p-3">{row.type}</td>
                    <td className="p-3 text-right tabular-nums">{row.debit ? money(row.debit) : "-"}</td>
                    <td className="p-3 text-right tabular-nums">{row.credit ? money(row.credit) : "-"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/40 font-bold"><td colSpan={2} className="p-3">Totals</td><td className="p-3 text-right">{money(totalDebit)}</td><td className="p-3 text-right">{money(totalCredit)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className={`mt-2 text-xs font-medium ${difference < 0.01 ? "text-emerald-600" : "text-orange-600"}`}>
            {difference < 0.01 ? "Debits equal credits" : `Out of balance by ${money(difference)}`}
          </p>
        </div>
      )}
    </div>
  );
}

function AccountDialog({ open, onOpenChange, account, onSaved }) {
  const [form, setForm] = useState(account || EMPTY_ACCOUNT);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(account?.id);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (isEditing) {
        await db.accounting.updateAccount(account.id, { name: form.name.trim(), type: form.type, description: form.description.trim() || null });
      } else {
        await db.accounting.createAccount(form);
      }
      toast.success(isEditing ? "Account updated" : "Account created");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEditing ? "Edit account" : "Add account"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="account-name">Account name</Label><Input id="account-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Account type</Label><Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
          {!isEditing && <div><Label htmlFor="opening-balance">Opening balance</Label><Input id="opening-balance" min="0" step="0.01" type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>}
          <div><Label htmlFor="account-description">Description</Label><Textarea id="account-description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ account, accounts, open, onOpenChange, onSaved }) {
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const targets = accounts.filter((candidate) => candidate.id !== account?.id && candidate.type === account?.type);
  const merge = async () => {
    if (!targetId) return;
    setSaving(true);
    try {
      await db.accounting.mergeAccounts(account.id, targetId);
      toast.success("Accounts merged");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Merge {account?.name}</DialogTitle></DialogHeader>
        <div><Label>Move entries and transactions to</Label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger><SelectValue placeholder="Select target account" /></SelectTrigger><SelectContent>{targets.map((target) => <SelectItem key={target.id} value={target.id}>{target.name} ({target.type})</SelectItem>)}</SelectContent></Select></div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={merge} disabled={!targetId || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Merge</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TAccountLedger({ dateFrom, dateTo, dateLabel }) {
  const queryClient = useQueryClient();
  const { entriesQuery, accountsQuery } = useLedger(dateFrom, dateTo);
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);

  const grouped = useMemo(() => {
    const byId = new Map(accounts.map((account) => [account.id, { ...account, debits: [], credits: [] }]));
    for (const entry of entriesQuery.data || []) {
      const key = entry.account_id || `legacy:${entry.account_name || "Uncategorized Account"}`;
      if (!byId.has(key)) byId.set(key, { id: key, name: entry.account_name || "Uncategorized Account", type: entry.account_type || "Expense", debits: [], credits: [], legacy: true });
      const account = byId.get(key);
      const line = { date: entry.entry_date, description: entry.description || `Transaction ${entry.transaction_id || ""}`.trim(), amount: Number(entry.debit || entry.credit || 0) };
      if (Number(entry.debit || 0) > 0) account.debits.push(line);
      if (Number(entry.credit || 0) > 0) account.credits.push(line);
    }
    return Object.fromEntries(ACCOUNT_TYPES.map((type) => [type, [...byId.values()].filter((account) => account.type === type).sort((a, b) => a.name.localeCompare(b.name))]));
  }, [accounts, entriesQuery.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["accounting-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
  };
  const remove = async (account) => {
    if (!window.confirm(`Delete ${account.name}?`)) return;
    try {
      await db.accounting.deleteAccount(account.id);
      toast.success("Account deleted");
      refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };
  const contentId = "t-account-print";

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2" data-actions>
        <Button variant="outline" size="sm" onClick={() => printWindow("T-Account Ledger", document.getElementById(contentId)?.innerHTML || "")}><Printer className="mr-2 h-4 w-4" />Print</Button>
        <Button size="sm" onClick={() => { setSelected(null); setDialog("account"); }}><Plus className="mr-2 h-4 w-4" />Add Account</Button>
      </div>
      <LedgerState query={entriesQuery.error ? entriesQuery : accountsQuery} />
      {!entriesQuery.isLoading && !accountsQuery.isLoading && !entriesQuery.error && !accountsQuery.error && (
        <div id={contentId}>
          <h1 className="text-xl font-bold">T-Account Ledger</h1><p className="mb-5 text-xs text-muted-foreground">{dateLabel}</p>
          {ACCOUNT_TYPES.map((type) => grouped[type].length > 0 && (
            <section key={type} className="mb-7">
              <h2 className="mb-3 border-b pb-2 text-xs font-bold tracking-wide text-muted-foreground">{GROUP_LABELS[type]}</h2>
              <div className="t-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[type].map((account) => {
                  const debit = account.debits.reduce((sum, line) => sum + line.amount, 0);
                  const credit = account.credits.reduce((sum, line) => sum + line.amount, 0);
                  return (
                    <div className={`t-card relative border p-4 ${TYPE_STYLES[type]}`} key={account.id}>
                      {!account.legacy && <DropdownMenu><DropdownMenuTrigger asChild><Button data-actions title="Account actions" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setSelected(account); setDialog("account"); }}><Pencil className="mr-2 h-4 w-4" />Rename or change type</DropdownMenuItem><DropdownMenuItem onClick={() => { setSelected(account); setDialog("merge"); }}><GitMerge className="mr-2 h-4 w-4" />Merge</DropdownMenuItem><DropdownMenuItem className="text-red-600" onClick={() => remove(account)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
                      <h3 className="border-b-2 border-current/30 pb-2 pr-8 text-center text-sm font-semibold">{account.name || "Uncategorized Account"}</h3>
                      <div className="t-inner grid grid-cols-2">
                        {[{ label: "Debit", lines: account.debits, total: debit }, { label: "Credit", lines: account.credits, total: credit }].map((side) => <div key={side.label} className="t-side p-3 even:border-l even:border-current/20"><p className="mb-2 text-center text-xs font-bold uppercase">{side.label}</p>{side.lines.map((line, index) => <div className="flex justify-between gap-2 border-b border-current/10 py-1 text-xs" key={`${line.date}:${index}`}><span className="truncate">{line.description}</span><span className="tabular-nums">{money(line.amount)}</span></div>)}<div className="mt-2 flex justify-between border-t-2 border-current/30 pt-1 text-xs font-bold"><span>Total</span><span>{money(side.total)}</span></div></div>)}
                      </div>
                      <p className="border-t border-current/20 pt-2 text-center text-xs">Balance: <strong>{money(Math.abs(debit - credit))} {debit >= credit ? "Dr" : "Cr"}</strong></p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {dialog === "account" && <AccountDialog key={selected?.id || "new"} open account={selected} onOpenChange={(open) => !open && setDialog(null)} onSaved={refresh} />}
      {dialog === "merge" && <MergeDialog key={selected?.id} open account={selected} accounts={accounts} onOpenChange={(open) => !open && setDialog(null)} onSaved={refresh} />}
    </div>
  );
}
