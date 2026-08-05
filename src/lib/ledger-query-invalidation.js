const LEDGER_QUERY_KEYS = [
  ["transactions"],
  ["journal-entries"],
  ["ledger-entries"],
  ["dashboard"],
  ["reports"],
  ["t-accounts"],
  ["financial-statements"],
  ["recurring"],
  ["assets"],
  ["liabilities"],
  ["net-worth"],
];

export async function invalidateLedgerQueries(queryClient) {
  await Promise.all(
    LEDGER_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}
