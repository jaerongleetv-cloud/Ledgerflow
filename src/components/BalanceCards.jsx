import { TrendingUp, TrendingDown, PiggyBank, Wallet } from "lucide-react";
import { motion } from "framer-motion";

export default function BalanceCards({ transactions }) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const savings = transactions
    .filter((t) => t.type === "savings")
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expenses - savings;

  const cards = [
    {
      label: "Balance",
      amount: balance,
      icon: Wallet,
      color: "from-primary/10 to-primary/5",
      textColor: "text-foreground",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Income",
      amount: income,
      icon: TrendingUp,
      color: "from-emerald-500/10 to-emerald-500/5",
      textColor: "text-emerald-600",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
    },
    {
      label: "Expenses",
      amount: expenses,
      icon: TrendingDown,
      color: "from-red-500/10 to-red-500/5",
      textColor: "text-red-500",
      iconBg: "bg-red-500/10",
      iconColor: "text-red-500",
    },
    {
      label: "Savings",
      amount: savings,
      icon: PiggyBank,
      color: "from-blue-500/10 to-blue-500/5",
      textColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`bg-gradient-to-br ${card.color} rounded-2xl p-4 border border-border/50`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {card.label}
            </span>
            <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
              <card.icon className={`h-3.5 w-3.5 ${card.iconColor}`} />
            </div>
          </div>
          <p className={`text-xl font-heading font-bold ${card.textColor}`}>
            {card.label === "Balance" && balance < 0 ? "-" : ""}$
            {Math.abs(card.amount).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </motion.div>
      ))}
    </div>
  );
}