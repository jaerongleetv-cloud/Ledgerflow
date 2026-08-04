"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import TransactionItem from "./TransactionItem";

export default function RecentTransactions({ transactions }) {
  const recent = [...transactions]
    .filter((t) => !/^Parse this financial transaction/i.test(t.description || ""))
    .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0, 5);

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground font-heading">
          Recent Transactions
        </h3>
        {transactions.length > 5 && (
          <Link
            href="/transactions"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No transactions yet. Try typing above!
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {recent.map((t) => (
            <TransactionItem key={t.id} transaction={t} />
          ))}
        </div>
      )}
    </div>
  );
}
