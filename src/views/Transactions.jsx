"use client";

import { supabase } from "@/lib/supabase";
import { db } from "@/api/base44Client";
import { invalidateLedgerQueries } from "@/lib/ledger-query-invalidation";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Search, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TransactionItem from "../components/TransactionItem";
import QuickInput from "../components/QuickInput";
import { toast } from "sonner";

export default function Transactions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);

  const { data: transactions = [], isLoading, error: queryError } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch =
        !search ||
        t.description?.toLowerCase().includes(search.toLowerCase()) ||
        t.original_text?.toLowerCase().includes(search.toLowerCase()) ||
        t.category?.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || t.type === typeFilter;
      const matchCategory = categoryFilter === "all" || t.category === categoryFilter;
      return matchSearch && matchType && matchCategory;
    });
  }, [transactions, search, typeFilter, categoryFilter]);

  const categories = useMemo(() => {
    const cats = [...new Set(transactions.map((t) => t.category).filter(Boolean))];
    return cats.sort();
  }, [transactions]);

  const handleTransactionAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const handleDelete = async (id) => {
    if (deletingId || !window.confirm("Delete this transaction and its journal posting?")) return;
    setDeletingId(id);
    try {
      await db.entities.Transaction.delete(id);
      await invalidateLedgerQueries(queryClient);
      toast.success("Transaction deleted");
    } catch (error) {
      console.error("[LedgerFlow] Transaction page delete failed", {
        transactionId: id,
        code: error?.code || null,
        message: error?.message || null,
        details: error?.details || null,
        hint: error?.hint || null,
        httpStatus: error?.httpStatus ?? error?.status ?? null,
      });
      toast.error(error?.message || "Could not delete the transaction and its journal posting");
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (queryError) return <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-red-600">{queryError.message}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:ml-24 lg:ml-28 space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Transactions
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {transactions.length} total transactions
        </p>
      </div>

      <QuickInput onTransactionAdded={handleTransactionAdded} />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-10 rounded-xl">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 h-10 rounded-xl">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            {search || typeFilter !== "all" || categoryFilter !== "all"
              ? "No matching transactions found"
              : "No transactions yet"}
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center px-4 group hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <TransactionItem transaction={t} onUpdated={handleTransactionAdded} />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(t.id)}
                  disabled={Boolean(deletingId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
