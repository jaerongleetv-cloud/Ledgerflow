"use client";

import { supabase } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Loader2, Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO, subMonths, isAfter } from "date-fns";
import CategoryBreakdown from "../components/CategoryBreakdown";
import FinancialStatements from "../components/FinancialStatements";

export default function Reports() {
  const [period, setPeriod] = useState("3m");

  const { data: allTransactions = [], isLoading, error } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .not("description", "ilike", "Parse this financial transaction%")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const transactions = useMemo(() => {
    const now = new Date();
    const months = period === "1m" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
    const cutoff = subMonths(now, months);
    return allTransactions.filter(
      (t) => t.transaction_date && isAfter(parseISO(t.transaction_date), cutoff)
    );
  }, [allTransactions, period]);

  const monthlyData = useMemo(() => {
    const byMonth = {};
    transactions.forEach((t) => {
      if (!t.transaction_date) return;
      const monthKey = format(parseISO(t.transaction_date), "MMM yyyy");
      if (!byMonth[monthKey]) byMonth[monthKey] = { month: monthKey, income: 0, expenses: 0, savings: 0 };
      if (t.type === "income") byMonth[monthKey].income += t.amount;
      else if (t.type === "expense") byMonth[monthKey].expenses += t.amount;
      else if (t.type === "savings") byMonth[monthKey].savings += t.amount;
    });
    return Object.values(byMonth);
  }, [transactions]);

  const totals = useMemo(() => {
    const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const savings = transactions.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0);
    const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(1) : 0;
    return { income, expenses, savings, savingsRate };
  }, [transactions]);

  const topCategories = useMemo(() => {
    const byCategory = {};
    transactions.filter((t) => t.type === "expense").forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });
    return Object.entries(byCategory)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

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
        <h1 className="text-2xl font-heading font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Financial overview</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
          <TabsTrigger value="statements" className="rounded-lg">Financial Statements</TabsTrigger>
        </TabsList>

        <TabsContent value="statements">
          <FinancialStatements />
        </TabsContent>

        <TabsContent value="overview">
          <div className="space-y-5">
          <div className="flex justify-end">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-28 h-9 rounded-xl text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1 Month</SelectItem>
                <SelectItem value="3m">3 Months</SelectItem>
                <SelectItem value="6m">6 Months</SelectItem>
                <SelectItem value="12m">1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Income" value={totals.income} color="text-emerald-600" />
        <SummaryCard label="Total Expenses" value={totals.expenses} color="text-red-500" />
        <SummaryCard label="Total Savings" value={totals.savings} color="text-blue-500" />
        <div className="bg-card rounded-2xl border border-border p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Savings Rate
          </span>
          <p className="text-xl font-heading font-bold text-foreground mt-2">
            {totals.savingsRate}%
          </p>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 font-heading">
          Monthly Overview
        </h3>
        {monthlyData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--popover-foreground))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [`$${value.toFixed(2)}`]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}
                />
                <Bar dataKey="income" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="savings" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryBreakdown transactions={transactions} />

        {/* Top Spending Categories */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 font-heading">
            Top Spending
          </h3>
          {topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No expenses yet</p>
          ) : (
            <div className="space-y-3">
              {topCategories.map((cat) => {
                const maxAmount = topCategories[0].amount;
                const pct = (cat.amount / maxAmount) * 100;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground capitalize">{cat.name}</span>
                      <span className="text-xs font-medium tabular-nums">
                        ${cat.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className={`text-xl font-heading font-bold mt-2 ${color}`}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}
