-- Supabase schema additions for LedgerFlow accounting

-- assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  category text,
  value numeric,
  institution text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- liabilities table
CREATE TABLE IF NOT EXISTS liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  category text,
  balance numeric,
  institution text,
  interest_rate numeric,
  minimum_payment numeric,
  created_at timestamp with time zone DEFAULT now()
);

-- journal_entries table
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id),
  account_id uuid REFERENCES accounts(id),
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- recurring transaction accounting type
ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS recurring_type text DEFAULT 'normal';
