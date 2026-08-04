"use client";

import { db } from "@/api/base44Client";
import { useState } from "react";
import { Check, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Spent $12 on lunch",
  "Earned $500 freelance",
  "Saved $200 this month",
  "Paid $50 for gas",
  "Got $3000 salary",
];

const TYPES = ["income", "expense", "savings"];
const CATEGORIES = [
  "food",
  "transport",
  "rent",
  "utilities",
  "entertainment",
  "shopping",
  "health",
  "education",
  "freelance",
  "salary",
  "investment",
  "gift",
  "savings",
  "subscriptions",
  "travel",
  "other",
];
const RECURRING_TYPES = ["normal", "monthly", "weekly", "yearly"];

function normalizeParsedTransaction(inputText, parsed) {
  return {
    original_text: inputText,
    amount: Number(parsed?.amount || 0),
    type: TYPES.includes(parsed?.type) ? parsed.type : "expense",
    category: parsed?.category || "other",
    description: parsed?.description || "Transaction",
    transaction_date: parsed?.transaction_date || new Date().toISOString().split("T")[0],
    account: parsed?.account || (parsed?.type === "income" ? "Bank Account" : "Cash"),
    recurring_type: parsed?.recurring_type || "normal",
    transaction_class: parsed?.transaction_class || null,
    tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
    is_deductible: Boolean(parsed?.is_deductible),
  };
}

export default function QuickInput({ onTransactionAdded }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedTransaction, setParsedTransaction] = useState(null);

  const updateParsedField = (field, value) => {
    setParsedTransaction((current) => ({ ...current, [field]: value }));
  };

  const parseForConfirmation = async (inputText) => {
    const trimmed = inputText.trim();
    if (!trimmed || loading || saving) return;

    setLoading(true);
    try {
      const parsed = await db.integrations.Core.InvokeLLM({
        prompt: trimmed,
        response_json_schema: {
          type: "object",
          properties: {
            amount: { type: "number" },
            type: { type: "string", enum: TYPES },
            category: { type: "string" },
            description: { type: "string" },
            transaction_date: { type: "string" },
            account: { type: "string" },
            recurring_type: { type: "string" },
            transaction_class: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
            is_deductible: { type: "boolean" },
            unsupported_reason: { type: ["string", "null"] },
          },
          required: [
            "amount",
            "type",
            "category",
            "description",
            "transaction_date",
            "account",
            "recurring_type",
          ],
        },
      });

      if (parsed?.unsupported_reason) {
        throw new Error(parsed.unsupported_reason);
      }

      setParsedTransaction(normalizeParsedTransaction(trimmed, parsed));
    } catch (error) {
      console.error("AI parse failed:", error);
      toast.error(error?.message || "Could not parse that transaction");
    } finally {
      setLoading(false);
    }
  };

  const saveParsedTransaction = async () => {
    if (!parsedTransaction || saving) return;

    setSaving(true);
    try {
      const saved = await db.entities.Transaction.create({
        ...parsedTransaction,
        amount: Number(parsedTransaction.amount || 0),
      });

      setText("");
      setParsedTransaction(null);
      toast.success(
        `${saved.type === "income" ? "+" : "-"}$${Number(saved.amount || 0).toFixed(2)} ${saved.description}`
      );
      onTransactionAdded?.();
    } catch (error) {
      console.error("Transaction save failed:", error);
      toast.error(error?.message || "Could not save transaction");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    parseForConfirmation(text);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Type something like "Spent $12 on lunch"'
          className="w-full h-14 pl-5 pr-14 rounded-2xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-body text-sm"
          disabled={loading || saving}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || loading || saving}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => parseForConfirmation(s)}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all whitespace-nowrap flex-shrink-0 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {s}
          </button>
        ))}
      </div>

      <Dialog open={Boolean(parsedTransaction)} onOpenChange={(open) => !open && setParsedTransaction(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm transaction</DialogTitle>
          </DialogHeader>

          {parsedTransaction && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-amount">Amount</Label>
                  <Input
                    id="quick-amount"
                    type="number"
                    step="0.01"
                    value={parsedTransaction.amount}
                    onChange={(e) => updateParsedField("amount", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={parsedTransaction.type}
                    onValueChange={(value) => updateParsedField("type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={parsedTransaction.category}
                    onValueChange={(value) => updateParsedField("category", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="quick-date">Date</Label>
                  <Input
                    id="quick-date"
                    type="date"
                    value={parsedTransaction.transaction_date}
                    onChange={(e) => updateParsedField("transaction_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-description">Description</Label>
                <Input
                  id="quick-description"
                  value={parsedTransaction.description}
                  onChange={(e) => updateParsedField("description", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-account">Account</Label>
                  <Input
                    id="quick-account"
                    value={parsedTransaction.account}
                    onChange={(e) => updateParsedField("account", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Recurring type</Label>
                  <Select
                    value={parsedTransaction.recurring_type}
                    onValueChange={(value) => updateParsedField("recurring_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRING_TYPES.map((recurringType) => (
                        <SelectItem key={recurringType} value={recurringType}>
                          {recurringType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setParsedTransaction(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveParsedTransaction} disabled={saving || !parsedTransaction?.amount}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
