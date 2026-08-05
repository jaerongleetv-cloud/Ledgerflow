"use client";

import { db } from "@/api/base44Client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/AuthContext";
import { invalidateLedgerQueries } from "@/lib/ledger-query-invalidation";

import { Trash2, AlertTriangle, RotateCcw, LogOut, Pencil, Plus, Check, X, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORY_TYPES = ["expense", "income", "savings"];
const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const ENTITIES = [
  { key: "transactions", label: "Transactions", entity: "Transaction" },
  { key: "assets", label: "Assets", entity: "Asset" },
  { key: "liabilities", label: "Liabilities", entity: "Liability" },
  { key: "recurring", label: "Recurring Transactions", entity: "RecurringTransaction" },
];

export default function Settings() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [themeMounted, setThemeMounted] = useState(false);
  const [confirming, setConfirming] = useState(null); // entity key or "all"
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState("expense");
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => setThemeMounted(true), []);

  const { data: categories = [], isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ["categories"],
    queryFn: () => db.entities.Category.list("name", 200),
  });

  const saveCategory = async (event) => {
    event.preventDefault();
    const name = categoryName.trim().toLowerCase();
    if (!name || loading) return;
    setLoading(true);
    try {
      if (editingCategory) await db.entities.Category.update(editingCategory.id, { name, type: categoryType });
      else await db.entities.Category.create({ name, type: categoryType });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryName("");
      setCategoryType("expense");
      setEditingCategory(null);
      toast.success(editingCategory ? "Category updated" : "Category added");
    } catch (error) {
      toast.error(error.message || "Could not save category");
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (category) => {
    setLoading(true);
    try {
      await db.entities.Category.delete(category.id);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
    } catch (error) {
      toast.error(error.message || "Category is still used by a transaction");
    } finally {
      setLoading(false);
    }
  };

  const deleteAll = async (entityName, queryKey) => {
    if (entityName === "Transaction") {
      await db.entities.Transaction.clearAll();
      await invalidateLedgerQueries(queryClient);
      return;
    }
    const records = await db.entities[entityName].list("", 1000);
    await Promise.all(records.map(r => db.entities[entityName].delete(r.id)));
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  };

  const handleReset = async (target) => {
    if (loading) return;
    if (target === "all" && resetConfirmation !== "RESET") {
      toast.error("Type RESET to confirm the financial reset");
      return;
    }
    setLoading(true);
    try {
      if (target === "all") {
        const deleted = await db.accounting.resetFinancialData();
        await invalidateLedgerQueries(queryClient);
        toast.success(`Financial data reset: ${deleted?.transactions || 0} transactions cleared`);
      } else {
        const entity = ENTITIES.find(e => e.key === target);
        await deleteAll(entity.entity, entity.key);
        toast.success(`${entity.label} cleared`);
      }
      setConfirming(null);
      setResetConfirmation("");
    } catch (error) {
      console.error("[LedgerFlow] Reset request failed", {
        target,
        transactionId: target === "all" || target === "transactions" ? "all-owned-transactions" : null,
        code: error?.code || null,
        message: error?.message || null,
        details: error?.details || null,
        hint: error?.hint || null,
        httpStatus: error?.httpStatus ?? error?.status ?? null,
      });
      toast.error(error?.message || "Could not clear data");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await logout();
      queryClient.clear();
      router.replace("/login");
    } catch (error) {
      toast.error(error.message || "Could not sign out");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:ml-24 lg:ml-28 space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your data</p>
      </div>

      <section className="flex items-center justify-between gap-4 border bg-card p-5">
        <div><h2 className="text-sm font-semibold">Appearance</h2><p className="text-xs text-muted-foreground">Choose how LedgerFlow looks on this device.</p></div>
        <Select value={themeMounted ? theme : "system"} onValueChange={setTheme} disabled={!themeMounted}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <SelectItem key={value} value={value}><span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="border bg-card p-5">
        <div className="mb-4"><h2 className="text-sm font-semibold">Categories</h2><p className="text-xs text-muted-foreground">Transaction labels remain separate from accounting accounts.</p></div>
        <form onSubmit={saveCategory} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]">
          <input required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="h-9 min-w-0 flex-1 border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <Select value={categoryType} onValueChange={setCategoryType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORY_TYPES.map((type) => <SelectItem key={type} value={type}><span className="capitalize">{type}</span></SelectItem>)}</SelectContent>
          </Select>
          {editingCategory && <Button type="button" size="icon" variant="outline" title="Cancel edit" onClick={() => { setEditingCategory(null); setCategoryName(""); setCategoryType("expense"); }}><X className="h-4 w-4" /></Button>}
          <Button type="submit" size="sm" disabled={loading || !categoryName.trim()}>{editingCategory ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{editingCategory ? "Save" : "Add"}</Button>
        </form>
        {categoriesLoading && <p className="text-sm text-muted-foreground">Loading categories...</p>}
        {categoriesError && <p role="alert" className="text-sm text-red-600">{categoriesError.message}</p>}
        {!categoriesLoading && !categoriesError && categories.length === 0 && <p className="py-3 text-sm text-muted-foreground">No categories yet</p>}
        <div className="divide-y">{categories.map((category) => <div key={category.id} className="flex items-center justify-between py-2"><div><span className="text-sm capitalize">{category.name}</span><span className="ml-2 text-xs capitalize text-muted-foreground">{category.type}</span></div><div className="flex"><Button size="icon" variant="ghost" title="Edit category" disabled={loading} onClick={() => { setEditingCategory(category); setCategoryName(category.name); setCategoryType(category.type || "expense"); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Delete category" disabled={loading} onClick={() => deleteCategory(category)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></div>)}</div>
      </section>

      <section className="flex items-center justify-between border bg-card p-5">
        <div><h2 className="text-sm font-semibold">Signed in</h2><p className="text-xs text-muted-foreground">{user?.email}</p></div>
        <Button variant="outline" onClick={signOut} disabled={loading}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
      </section>

      {/* Danger Zone */}
      <div className="bg-card rounded-2xl border border-destructive/30 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
        </div>
        <p className="text-xs text-muted-foreground">These actions are irreversible. All deleted data cannot be recovered.</p>

        {/* Individual resets */}
        <div className="space-y-2">
          {ENTITIES.map(e => (
            <div key={e.key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <span className="text-sm text-foreground">{e.label}</span>
              {confirming === e.key ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => setConfirming(null)} disabled={loading}>Cancel</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs rounded-lg" onClick={() => handleReset(e.key)} disabled={loading}>
                    {loading ? "Deleting..." : "Confirm"}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg text-destructive hover:bg-destructive/10 gap-1"
                  onClick={() => setConfirming(e.key)}>
                  <Trash2 className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Global reset */}
        <div className="pt-2">
          {confirming === "all" ? (
            <div className="flex flex-col items-stretch gap-3 border border-destructive/20 bg-destructive/5 p-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-medium text-destructive">Deletes your transactions and journal postings, recurring items, assets, and liabilities. Accounts and categories remain.</p>
                <input aria-label="Type RESET to confirm" autoComplete="off" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} placeholder="Type RESET" className="h-9 w-full border border-destructive/40 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/20" disabled={loading} />
              </div>
              <Button size="sm" variant="outline" className="h-9 flex-shrink-0" onClick={() => { setConfirming(null); setResetConfirmation(""); }} disabled={loading}>Cancel</Button>
              <Button size="sm" variant="destructive" className="h-9 flex-shrink-0" onClick={() => handleReset("all")} disabled={loading || resetConfirmation !== "RESET"}>
                {loading ? "Resetting..." : "Reset All"}
              </Button>
            </div>
          ) : (
            <Button variant="destructive" className="w-full rounded-xl gap-2" onClick={() => { setConfirming("all"); setResetConfirmation(""); }} disabled={loading}>
              <RotateCcw className="h-4 w-4" /> Reset All Financial Data
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
