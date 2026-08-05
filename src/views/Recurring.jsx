"use client";

import { db } from "@/api/base44Client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Plus, Loader2, Trash2, TrendingUp, TrendingDown, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = ["food","transport","rent","utilities","entertainment","shopping","health","education","freelance","salary","investment","subscriptions","other"];
const FREQUENCIES = ["daily","weekly","biweekly","monthly","quarterly","annually"];
const FREQ_LABELS = { daily:"Daily", weekly:"Weekly", biweekly:"Bi-Weekly", monthly:"Monthly", quarterly:"Quarterly", annually:"Annually" };

// Monthly equivalent multipliers
const FREQ_MONTHLY = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1/3, annually: 1/12 };

function formatLabel(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function RecurringForm({ onSave, onClose }) {
  const [form, setForm] = useState({
    name: "", amount: "", type: "expense", category: "rent",
    frequency: "monthly", next_date: "", notes: "", is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, amount: parseFloat(form.amount), is_active: true });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Could not save recurring item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
          placeholder="e.g. Netflix, Rent, Salary"
          className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
            <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Amount ($)</label>
          <input required type="number" min="0" step="0.01" value={form.amount}
            onChange={e => setForm({...form, amount: e.target.value})}
            placeholder="0.00"
            className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
            <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Frequency</label>
          <Select value={form.frequency} onValueChange={v => setForm({...form, frequency: v})}>
            <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Next Date (optional)</label>
        <input type="date" value={form.next_date} onChange={e => setForm({...form, next_date: e.target.value})}
          className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>
      <div className="flex gap-2 pt-2">
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" className="flex-1 rounded-xl" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      </div>
    </form>
  );
}

function RecurringCard({ item, onDelete, onToggle }) {
  const isIncome = item.type === "income";
  const monthlyEquiv = item.amount * (FREQ_MONTHLY[item.frequency] || 1);

  return (
    <div className="flex items-center gap-3 py-3 px-1 group">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isIncome ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-red-100 text-red-500 dark:bg-red-950/50 dark:text-red-400"} ${!item.is_active ? "opacity-40" : ""}`}>
        {isIncome ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      </div>
      <div className={`flex-1 min-w-0 ${!item.is_active ? "opacity-50" : ""}`}>
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatLabel(item.category)} · {FREQ_LABELS[item.frequency]}
          {item.frequency !== "monthly" && (
            <span className="text-muted-foreground/60"> (≈${monthlyEquiv.toFixed(0)}/mo)</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-semibold tabular-nums ${isIncome ? "text-emerald-600" : "text-red-500"} ${!item.is_active ? "opacity-50" : ""}`}>
          {isIncome ? "+" : "-"}${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onToggle(item)}>
          {item.is_active
            ? <ToggleRight className="h-4 w-4 text-emerald-500" />
            : <ToggleLeft className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Recurring() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["recurring"],
    queryFn: () => db.entities.RecurringTransaction.list("-created_date"),
  });

  const active = items.filter(i => i.is_active);
  const monthlyIncome = active.filter(i => i.type === "income").reduce((s, i) => s + i.amount * (FREQ_MONTHLY[i.frequency] || 1), 0);
  const monthlyExpenses = active.filter(i => i.type === "expense").reduce((s, i) => s + i.amount * (FREQ_MONTHLY[i.frequency] || 1), 0);
  const monthlyNet = monthlyIncome - monthlyExpenses;

  const handleSave = async (data) => {
    await db.entities.RecurringTransaction.create(data);
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    toast.success("Recurring item added");
  };
  const handleDelete = async (id) => {
    try { await db.entities.RecurringTransaction.delete(id); queryClient.invalidateQueries({ queryKey: ["recurring"] }); toast.success("Removed"); }
    catch (deleteError) { toast.error(deleteError.message || "Could not remove item"); }
  };
  const handleToggle = async (item) => {
    try { await db.entities.RecurringTransaction.update(item.id, { is_active: !item.is_active }); queryClient.invalidateQueries({ queryKey: ["recurring"] }); }
    catch (toggleError) { toast.error(toggleError.message || "Could not update item"); }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-red-600">{error.message}</div>;

  const incomeItems = items.filter(i => i.type === "income");
  const expenseItems = items.filter(i => i.type === "expense");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:ml-24 lg:ml-28 space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Recurring</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Fixed income & expenses</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Add Recurring Item</DialogTitle></DialogHeader>
          <RecurringForm onSave={handleSave} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-2xl border border-border/50 p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly In</span>
          <p className="text-xl font-heading font-bold text-emerald-600 mt-2">
            ${monthlyIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-2xl border border-border/50 p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly Out</span>
          <p className="text-xl font-heading font-bold text-red-500 mt-2">
            ${monthlyExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className={`bg-gradient-to-br ${monthlyNet >= 0 ? "from-blue-500/10 to-blue-500/5" : "from-orange-500/10 to-orange-500/5"} rounded-2xl border border-border/50 p-4`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Net / Month</span>
          <p className={`text-xl font-heading font-bold mt-2 ${monthlyNet >= 0 ? "text-blue-600" : "text-orange-500"}`}>
            {monthlyNet < 0 ? "-" : "+"}${Math.abs(monthlyNet).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Income */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground font-heading flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Fixed Income
          </h3>
          <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Income
          </Button>
        </div>
        {incomeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recurring income added yet</p>
        ) : (
          <div className="divide-y divide-border/50">
            {incomeItems.map(item => (
              <RecurringCard key={item.id} item={item} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground font-heading flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" /> Fixed Expenses
          </h3>
          <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Expense
          </Button>
        </div>
        {expenseItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recurring expenses added yet</p>
        ) : (
          <div className="divide-y divide-border/50">
            {expenseItems.map(item => (
              <RecurringCard key={item.id} item={item} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
