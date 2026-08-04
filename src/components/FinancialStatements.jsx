"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  BalanceSheet,
  IncomeStatement,
  TrialBalance,
  TAccountLedger,
} from "@/components/AccountingLedger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function FinancialStatements() {
  const [reportType, setReportType] = useState("income_statement");
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const dateLabel = `${format(parseISO(dateFrom), "MMM d, yyyy")} - ${format(parseISO(dateTo), "MMM d, yyyy")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 border bg-card p-4">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Report Type</label>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income_statement">Income Statement</SelectItem>
              <SelectItem value="balance_sheet">Balance Sheet</SelectItem>
              <SelectItem value="trial_balance">Trial Balance</SelectItem>
              <SelectItem value="t_account">T-Account Ledger</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><label className="mb-1 block text-xs font-medium text-muted-foreground">From</label><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-9 border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
        <div><label className="mb-1 block text-xs font-medium text-muted-foreground">To</label><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-9 border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
      </div>

      {reportType === "income_statement" && <IncomeStatement dateFrom={dateFrom} dateTo={dateTo} dateLabel={dateLabel} />}
      {reportType === "balance_sheet" && <BalanceSheet dateTo={dateTo} dateLabel={format(parseISO(dateTo), "MMMM d, yyyy")} />}
      {reportType === "trial_balance" && <TrialBalance dateFrom={dateFrom} dateTo={dateTo} dateLabel={dateLabel} />}
      {reportType === "t_account" && <TAccountLedger dateFrom={dateFrom} dateTo={dateTo} dateLabel={dateLabel} />}
    </div>
  );
}
