"use client";

import { db } from "@/api/base44Client";
import { useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AiInsights({ transactions }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    if (transactions.length === 0) return;
    setLoading(true);

    const summary = {
      total_income: transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      total_expenses: transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      total_savings: transactions.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0),
      categories: {},
      transaction_count: transactions.length,
    };

    transactions.filter((t) => t.type === "expense").forEach((t) => {
      summary.categories[t.category] = (summary.categories[t.category] || 0) + t.amount;
    });

    const result = await db.integrations.Core.InvokeLLM({
      prompt: `You are a friendly financial advisor. Analyze this financial data and provide 3 short, actionable insights.

Data: ${JSON.stringify(summary)}

Be specific with numbers. Keep each insight under 15 words. Be encouraging but honest. Use simple language.`,
      response_json_schema: {
        type: "object",
        properties: {
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                emoji: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
    });

    setInsights(result.insights);
    setLoading(false);
  };

  if (transactions.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground font-heading">AI Insights</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateInsights}
          disabled={loading}
          className="h-7 text-xs"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : insights ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            "Analyze"
          )}
        </Button>
      </div>

      {insights ? (
        <div className="space-y-2.5">
          {insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">{insight.emoji}</span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {insight.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tap &quot;Analyze&quot; to get personalized financial insights.
        </p>
      )}
    </div>
  );
}