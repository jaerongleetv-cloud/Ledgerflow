"use client";

import { supabase } from "@/lib/supabase";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Loader2 } from "lucide-react";
import QuickInput from "../components/QuickInput";
import BalanceCards from "../components/BalanceCards";
import SpendingChart from "../components/SpendingChart";
import CategoryBreakdown from "../components/CategoryBreakdown";
import AiInsights from "../components/AiInsights";
import RecentTransactions from "../components/RecentTransactions";

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .not("description", "ilike", "Parse this financial transaction%")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const handleTransactionAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) return <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-red-600">{error.message}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:ml-24 lg:ml-28 space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your financial snapshot
        </p>
      </div>

      <QuickInput onTransactionAdded={handleTransactionAdded} />

      <BalanceCards transactions={transactions} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SpendingChart transactions={transactions} />
        <CategoryBreakdown transactions={transactions} />
      </div>

      <AiInsights transactions={transactions} />

      <RecentTransactions transactions={transactions} />
    </div>
  );
}
