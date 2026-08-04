begin;

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null check (trim(name) <> ''),
  amount numeric(14, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null default 'other' check (
    category in (
      'food', 'transport', 'rent', 'utilities', 'entertainment', 'shopping',
      'health', 'education', 'freelance', 'salary', 'investment',
      'subscriptions', 'other'
    )
  ),
  frequency text not null check (
    frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually')
  ),
  next_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index recurring_transactions_user_next_date_idx
  on public.recurring_transactions(user_id, next_date);

create index recurring_transactions_user_active_idx
  on public.recurring_transactions(user_id, is_active);

alter table public.recurring_transactions enable row level security;

create policy recurring_transactions_select_own
  on public.recurring_transactions
  for select to authenticated
  using (user_id = auth.uid());

create policy recurring_transactions_insert_own
  on public.recurring_transactions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy recurring_transactions_update_own
  on public.recurring_transactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy recurring_transactions_delete_own
  on public.recurring_transactions
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.recurring_transactions from public, anon;
grant select, insert, update, delete on table public.recurring_transactions to authenticated;

commit;
