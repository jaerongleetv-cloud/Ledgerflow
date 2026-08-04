"use client";

import { db } from "@/api/base44Client";
import { useState } from "react";
import {
  Utensils, Car, Home, Zap, Film, ShoppingBag, Heart, GraduationCap,
  Briefcase, DollarSign, TrendingUp, Gift, PiggyBank, CreditCard, Plane, HelpCircle, Check, X
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const CATEGORY_CONFIG = {
  food: { icon: Utensils, color: "bg-orange-100 text-orange-600" },
  transport: { icon: Car, color: "bg-blue-100 text-blue-600" },
  rent: { icon: Home, color: "bg-purple-100 text-purple-600" },
  utilities: { icon: Zap, color: "bg-yellow-100 text-yellow-600" },
  entertainment: { icon: Film, color: "bg-pink-100 text-pink-600" },
  shopping: { icon: ShoppingBag, color: "bg-indigo-100 text-indigo-600" },
  health: { icon: Heart, color: "bg-red-100 text-red-600" },
  education: { icon: GraduationCap, color: "bg-teal-100 text-teal-600" },
  freelance: { icon: Briefcase, color: "bg-emerald-100 text-emerald-600" },
  salary: { icon: DollarSign, color: "bg-green-100 text-green-600" },
  investment: { icon: TrendingUp, color: "bg-cyan-100 text-cyan-600" },
  gift: { icon: Gift, color: "bg-rose-100 text-rose-600" },
  savings: { icon: PiggyBank, color: "bg-sky-100 text-sky-600" },
  subscriptions: { icon: CreditCard, color: "bg-violet-100 text-violet-600" },
  travel: { icon: Plane, color: "bg-amber-100 text-amber-600" },
  other: { icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG);
const TYPES = ["income", "expense", "savings"];

export default function TransactionItem({ transaction, onUpdated }) {
  const [editField, setEditField] = useState(null); // "description" | "amount" | "category" | "type" | "date"
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);

  const config = CATEGORY_CONFIG[transaction.category] || CATEGORY_CONFIG.other;
  const Icon = config.icon;

  const amountPrefix = transaction.type === "income" ? "+" : transaction.type === "savings" ? "→" : "-";
  const amountColor = transaction.type === "income" ? "text-emerald-600" : transaction.type === "savings" ? "text-blue-500" : "text-foreground";
  const dateStr = transaction.transaction_date ? format(parseISO(transaction.transaction_date), "MMM d") : "";

  const startEdit = (field, currentVal) => {
    setEditField(field);
    setEditVal(String(currentVal));
  };

  const cancelEdit = () => { setEditField(null); setEditVal(""); };

  const saveEdit = async () => {
    if (saving) return;
    let updateData = {};
    if (editField === "amount") {
      const amount = Number(editVal);
      if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be greater than zero");
      updateData.amount = amount;
    }
    else if (editField === "date") updateData.transaction_date = editVal;
    else updateData[editField] = editVal;
    if (editField === "description" && !editVal.trim()) return toast.error("Description is required");

    setSaving(true);
    try {
      await db.entities.Transaction.update(transaction.id, updateData);
      setEditField(null);
      onUpdated?.();
      toast.success("Transaction updated");
    } catch (error) {
      toast.error(error.message || "Could not update transaction");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const fieldClass = "bg-background border border-primary/40 rounded-md px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-full";

  return (
    <div className="flex items-center gap-3 py-3 px-1 group">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Description */}
        {editField === "description" ? (
          <div className="flex items-center gap-1">
            <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKeyDown}
              className={fieldClass} />
            <button onClick={saveEdit} disabled={saving} className="text-emerald-600 hover:text-emerald-700 flex-shrink-0"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <p className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors"
            onClick={() => startEdit("description", transaction.description)} title="Click to edit">
            {transaction.description}
          </p>
        )}

        {/* Category & Date row */}
        <div className="flex items-center gap-2 flex-wrap">
          {editField === "category" ? (
            <div className="flex items-center gap-1">
              <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKeyDown}
                className={`${fieldClass} w-auto`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={saveEdit} disabled={saving} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => startEdit("category", transaction.category)} title="Click to edit category">
              {transaction.category}
            </span>
          )}

          {editField === "date" ? (
            <div className="flex items-center gap-1">
              <input autoFocus type="date" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKeyDown}
                className={`${fieldClass} w-auto`} />
              <button onClick={saveEdit} disabled={saving} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : dateStr ? (
            <span className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => startEdit("date", transaction.transaction_date)} title="Click to edit date">
              · {dateStr}
            </span>
          ) : null}

          {editField === "type" ? (
            <div className="flex items-center gap-1">
              <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKeyDown}
                className={`${fieldClass} w-auto`}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={saveEdit} disabled={saving} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <span className={`text-xs cursor-pointer hover:text-primary transition-colors ${amountColor} opacity-70`}
              onClick={() => startEdit("type", transaction.type)} title="Click to edit type">
              · {transaction.type}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      {editField === "amount" ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input autoFocus type="number" step="0.01" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKeyDown}
            className={`${fieldClass} w-24`} />
          <button onClick={saveEdit} disabled={saving} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <p className={`text-sm font-semibold tabular-nums flex-shrink-0 cursor-pointer hover:opacity-70 transition-opacity ${amountColor}`}
          onClick={() => startEdit("amount", transaction.amount)} title="Click to edit amount">
          {amountPrefix}${transaction.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}
