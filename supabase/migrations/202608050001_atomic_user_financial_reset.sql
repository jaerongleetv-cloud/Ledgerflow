begin;

do $$
begin
  if to_regclass('public.transactions') is null or
     to_regclass('public.journal_entries') is null or
     to_regclass('public.recurring_transactions') is null or
     to_regclass('public.assets') is null or
     to_regclass('public.liabilities') is null then
    raise exception 'LedgerFlow reset migration requires transactions, journal_entries, recurring_transactions, assets, and liabilities';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_transaction_id_fkey'
      and conrelid = 'public.journal_entries'::regclass
      and confrelid = 'public.transactions'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ) then
    raise exception 'Apply 202608040003_fix_transaction_delete_cascade.sql before this migration';
  end if;
end $$;

create or replace function public.ledger_reset_financial_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  transaction_count integer;
  journal_count integer;
  recurring_count integer;
  asset_count integer;
  liability_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.journal_entries journal
    join public.transactions transaction on transaction.id = journal.transaction_id
    where transaction.user_id = current_user_id
      and journal.user_id is distinct from current_user_id
  ) then
    raise exception 'Reset aborted because a transaction has a journal ownership mismatch';
  end if;

  select count(*) into journal_count
  from public.journal_entries journal
  where journal.user_id = current_user_id
    and journal.transaction_id is not null
    and exists (
      select 1 from public.transactions transaction
      where transaction.id = journal.transaction_id
        and transaction.user_id = current_user_id
    );

  delete from public.transactions
  where user_id = current_user_id;
  get diagnostics transaction_count = row_count;

  delete from public.recurring_transactions
  where user_id = current_user_id;
  get diagnostics recurring_count = row_count;

  delete from public.assets
  where user_id = current_user_id;
  get diagnostics asset_count = row_count;

  delete from public.liabilities
  where user_id = current_user_id;
  get diagnostics liability_count = row_count;

  return jsonb_build_object(
    'transactions', transaction_count,
    'journal_entries', journal_count,
    'recurring_transactions', recurring_count,
    'assets', asset_count,
    'liabilities', liability_count
  );
end;
$$;

revoke execute on function public.ledger_reset_financial_data() from public, anon;
grant execute on function public.ledger_reset_financial_data() to authenticated;

notify pgrst, 'reload schema';

commit;
