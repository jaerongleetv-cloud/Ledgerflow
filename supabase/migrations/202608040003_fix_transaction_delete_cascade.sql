begin;

do $$
begin
  if to_regclass('public.transactions') is null or
     to_regclass('public.journal_entries') is null then
    raise exception 'LedgerFlow delete migration requires public.transactions and public.journal_entries';
  end if;
end $$;

do $$
declare
  delete_triggers text;
begin
  select string_agg(format('%I.%I', event_object_table, trigger_name), ', ' order by event_object_table, trigger_name)
  into delete_triggers
  from information_schema.triggers
  where event_object_schema = 'public'
    and event_object_table in ('transactions', 'journal_entries')
    and event_manipulation = 'DELETE';

  if delete_triggers is not null then
    raise exception 'Unexpected DELETE trigger(s) must be reviewed before applying this migration: %', delete_triggers;
  end if;
end $$;

alter table public.journal_entries
  drop constraint if exists journal_entries_transaction_id_fkey;

alter table public.journal_entries
  add constraint journal_entries_transaction_id_fkey
  foreign key (transaction_id)
  references public.transactions(id)
  on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_transaction_id_fkey'
      and conrelid = 'public.journal_entries'::regclass
      and confrelid = 'public.transactions'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ) then
    raise exception 'journal_entries.transaction_id must reference transactions.id with ON DELETE CASCADE';
  end if;
end $$;

alter table public.transactions enable row level security;

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own
  on public.transactions
  for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.ledger_delete_transaction(p_transaction_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_transaction_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.transactions
  where id = p_transaction_id
    and user_id = current_user_id
  returning id into deleted_transaction_id;

  if deleted_transaction_id is null then
    raise exception 'Transaction not found or not owned by current user' using errcode = 'P0002';
  end if;

  return deleted_transaction_id;
end;
$$;

create or replace function public.ledger_clear_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.transactions
  where user_id = current_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.ledger_delete_transaction(bigint) from public, anon;
revoke execute on function public.ledger_clear_transactions() from public, anon;
grant execute on function public.ledger_delete_transaction(bigint) to authenticated;
grant execute on function public.ledger_clear_transactions() to authenticated;

notify pgrst, 'reload schema';

commit;
