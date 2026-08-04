begin;

create extension if not exists pgcrypto;

alter table public.accounts
  add column if not exists opening_balance numeric(14,2) not null default 0,
  add column if not exists description text,
  add column if not exists user_id uuid;

update public.accounts
set type = case lower(coalesce(type, ''))
  when 'income' then 'Revenue'
  when 'drawings' then 'Equity'
  when 'asset' then 'Asset'
  when 'liability' then 'Liability'
  when 'equity' then 'Equity'
  when 'revenue' then 'Revenue'
  when 'expense' then 'Expense'
  else 'Expense'
end;

alter table public.journal_entries
  add column if not exists account_id uuid,
  add column if not exists description text,
  add column if not exists entry_date date,
  add column if not exists line_no smallint,
  add column if not exists posting_key text;

update public.journal_entries
set entry_date = coalesce(entry_date, created_at::date)
where entry_date is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'journal_entries_account_id_fkey'
      and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_account_id_fkey
      foreign key (account_id) references public.accounts(id) on update cascade;
  end if;
end $$;

-- Canonical names keep categories and the chart of accounts separate.
update public.accounts
set name = case lower(trim(name))
  when 'credit card' then 'Credit Card Payable'
  when 'owner capital' then 'Owner''s Equity'
  when 'salary' then 'Salary Revenue'
  when 'freelance' then 'Freelance Revenue'
  when 'food' then 'Food Expense'
  when 'transport' then 'Transportation Expense'
  when 'subscription' then 'Subscription Expense'
  when 'subscriptions' then 'Subscription Expense'
  when 'utilities' then 'Utilities Expense'
  when 'expense' then 'Other Expense'
  when 'income' then 'Other Revenue'
  when 'other' then case when type = 'Revenue' then 'Other Revenue' else 'Other Expense' end
  else trim(name)
end;

-- Merge duplicate account rows before enforcing uniqueness.
with ranked as (
  select id,
         first_value(id) over (
           partition by coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type
           order by created_at nulls last, id
         ) as keeper_id,
         row_number() over (
           partition by coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type
           order by created_at nulls last, id
         ) as row_number
  from public.accounts
)
update public.transactions t
set account_id = ranked.keeper_id
from ranked
where ranked.row_number > 1 and t.account_id = ranked.id;

with ranked as (
  select id,
         first_value(id) over (
           partition by coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type
           order by created_at nulls last, id
         ) as keeper_id,
         row_number() over (
           partition by coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type
           order by created_at nulls last, id
         ) as row_number
  from public.accounts
)
update public.journal_entries j
set account_id = ranked.keeper_id
from ranked
where ranked.row_number > 1 and j.account_id = ranked.id;

with ranked as (
  select id,
         row_number() over (
           partition by coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type
           order by created_at nulls last, id
         ) as row_number
  from public.accounts
)
delete from public.accounts a using ranked
where ranked.row_number > 1 and a.id = ranked.id;

create unique index if not exists accounts_user_name_type_unique
  on public.accounts (
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name),
    type
  );

create unique index if not exists journal_entries_transaction_line_unique
  on public.journal_entries(transaction_id, line_no)
  where transaction_id is not null and line_no is not null;

create unique index if not exists journal_entries_posting_line_unique
  on public.journal_entries(posting_key, line_no)
  where posting_key is not null and line_no is not null;

insert into public.accounts (name, type, category, description)
values
  ('Cash', 'Asset', 'cash', 'Cash on hand'),
  ('Bank Account', 'Asset', 'bank_account', 'General bank account'),
  ('Chequing Account', 'Asset', 'checking_account', 'Primary chequing account'),
  ('Checking Account', 'Asset', 'checking_account', 'Primary checking account'),
  ('Savings Account', 'Asset', 'savings_account', 'Savings and reserves'),
  ('Vehicle', 'Asset', 'vehicle', 'Vehicles owned'),
  ('Phone Equipment', 'Asset', 'phone_equipment', 'Phones and related equipment'),
  ('Equipment', 'Asset', 'equipment', 'Business equipment'),
  ('Investment', 'Asset', 'investment', 'Investments'),
  ('Credit Card Payable', 'Liability', 'credit_card', 'Credit card balance payable'),
  ('Car Loan', 'Liability', 'car_loan', 'Vehicle financing'),
  ('Phone Financing', 'Liability', 'phone_financing', 'Phone financing payable'),
  ('Loan', 'Liability', 'loan', 'General loan payable'),
  ('Owner''s Equity', 'Equity', 'owner_equity', 'Owner contributions and opening balance offset'),
  ('Salary Revenue', 'Revenue', 'salary', 'Employment income'),
  ('Freelance Revenue', 'Revenue', 'freelance', 'Freelance income'),
  ('Other Revenue', 'Revenue', 'other', 'Unmapped revenue'),
  ('Food Expense', 'Expense', 'food', 'Food and dining'),
  ('Phone Expense', 'Expense', 'phone', 'Phone service and usage'),
  ('Transportation Expense', 'Expense', 'transport', 'Transportation costs'),
  ('Subscription Expense', 'Expense', 'subscriptions', 'Recurring subscriptions'),
  ('Rent Expense', 'Expense', 'rent', 'Rent and lease costs'),
  ('Utilities Expense', 'Expense', 'utilities', 'Utilities'),
  ('Other Expense', 'Expense', 'other', 'Unmapped expenses')
on conflict do nothing;

create table if not exists public.category_account_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  category text not null,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'savings')),
  account_id uuid not null references public.accounts(id) on update cascade on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists category_account_mappings_unique
  on public.category_account_mappings (
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(category),
    transaction_type
  );

insert into public.category_account_mappings (category, transaction_type, account_id)
select mapping.category, mapping.transaction_type, a.id
from (values
  ('food', 'expense', 'Food Expense'),
  ('transport', 'expense', 'Transportation Expense'),
  ('transportation', 'expense', 'Transportation Expense'),
  ('subscriptions', 'expense', 'Subscription Expense'),
  ('subscription', 'expense', 'Subscription Expense'),
  ('rent', 'expense', 'Rent Expense'),
  ('utilities', 'expense', 'Utilities Expense'),
  ('phone', 'expense', 'Phone Expense'),
  ('vehicle', 'expense', 'Vehicle'),
  ('phone_equipment', 'expense', 'Phone Equipment'),
  ('salary', 'income', 'Salary Revenue'),
  ('freelance', 'income', 'Freelance Revenue'),
  ('other', 'expense', 'Other Expense'),
  ('other', 'income', 'Other Revenue'),
  ('savings', 'savings', 'Savings Account')
) as mapping(category, transaction_type, account_name)
join public.accounts a on a.name = mapping.account_name and a.user_id is null
on conflict do nothing;

create or replace function public.ledger_account_for_transaction(
  p_category text,
  p_type text,
  p_description text default null
) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_category text := lower(coalesce(nullif(trim(p_category), ''), 'other'));
  v_account_id uuid;
begin
  if v_category = 'other' then
    if lower(coalesce(p_description, '')) ~ '(lunch|food|grocery|coffee|restaurant|starbucks)' then v_category := 'food';
    elsif lower(coalesce(p_description, '')) ~ '(gas|fuel|uber|taxi|train|bus)' then v_category := 'transport';
    elsif lower(coalesce(p_description, '')) ~ '(netflix|spotify|subscription|stream)' then v_category := 'subscriptions';
    elsif lower(coalesce(p_description, '')) ~ '(freelance|contract|gig)' and p_type = 'income' then v_category := 'freelance';
    end if;
  end if;

  select m.account_id into v_account_id
  from public.category_account_mappings m
  where lower(m.category) = v_category
    and m.transaction_type = p_type
    and (m.user_id = auth.uid() or m.user_id is null)
  order by (m.user_id is not null) desc
  limit 1;

  if v_account_id is null then
    select id into v_account_id from public.accounts
    where name = case when p_type = 'income' then 'Other Revenue' else 'Other Expense' end
      and user_id is null
    limit 1;
  end if;

  return v_account_id;
end;
$$;

create or replace function public.post_transaction(p_transaction_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  tx public.transactions%rowtype;
  v_debit_account_id uuid;
  v_credit_account_id uuid;
  v_debit_name text;
  v_credit_name text;
  v_existing_count integer;
  v_existing_delta numeric;
begin
  select * into tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % does not exist', p_transaction_id; end if;
  if coalesce(tx.amount, 0) <= 0 then raise exception 'Transaction amount must be greater than zero'; end if;

  select count(*), coalesce(sum(debit), 0) - coalesce(sum(credit), 0)
  into v_existing_count, v_existing_delta
  from public.journal_entries where transaction_id = p_transaction_id;

  if v_existing_count = 2 and abs(v_existing_delta) < 0.005 then return; end if;
  if v_existing_count > 0 then delete from public.journal_entries where transaction_id = p_transaction_id; end if;

  if tx.type = 'income' then
    v_debit_account_id := tx.account_id;
    v_credit_account_id := public.ledger_account_for_transaction(tx.category, 'income', tx.description);
  elsif tx.type = 'savings' then
    v_debit_account_id := public.ledger_account_for_transaction('savings', 'savings', tx.description);
    v_credit_account_id := tx.account_id;
  else
    v_debit_account_id := public.ledger_account_for_transaction(tx.category, 'expense', tx.description);
    v_credit_account_id := tx.account_id;
  end if;

  if v_debit_account_id is null or v_credit_account_id is null then
    raise exception 'Transaction % could not resolve both accounting accounts', p_transaction_id;
  end if;

  select name into v_debit_name from public.accounts where id = v_debit_account_id;
  select name into v_credit_name from public.accounts where id = v_credit_account_id;

  insert into public.journal_entries
    (transaction_id, account_id, account, debit, credit, description, entry_date, line_no, created_at)
  values
    (tx.id, v_debit_account_id, v_debit_name, abs(tx.amount), 0, tx.description, coalesce(tx.transaction_date, tx.date, current_date), 1, coalesce(tx.transaction_date, tx.date, current_date)::timestamp),
    (tx.id, v_credit_account_id, v_credit_name, 0, abs(tx.amount), tx.description, coalesce(tx.transaction_date, tx.date, current_date), 2, coalesce(tx.transaction_date, tx.date, current_date)::timestamp);
end;
$$;

create or replace function public.ledger_create_account(
  p_name text,
  p_type text,
  p_opening_balance numeric default 0,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_equity_id uuid;
  v_key text;
begin
  if trim(coalesce(p_name, '')) = '' then raise exception 'Account name is required'; end if;
  if p_type not in ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') then raise exception 'Invalid account type'; end if;

  insert into public.accounts (name, type, category, opening_balance, description, user_id)
  values (trim(p_name), p_type, 'custom', abs(coalesce(p_opening_balance, 0)), nullif(trim(p_description), ''), auth.uid())
  returning id into v_account_id;

  if abs(coalesce(p_opening_balance, 0)) >= 0.005 then
    select id into v_equity_id from public.accounts where name = 'Owner''s Equity' and user_id is null limit 1;
    v_key := 'opening:' || v_account_id::text;
    if p_type in ('Asset', 'Expense') then
      insert into public.journal_entries (account_id, account, debit, credit, description, entry_date, line_no, posting_key)
      values (v_account_id, trim(p_name), abs(p_opening_balance), 0, 'Opening balance', current_date, 1, v_key),
             (v_equity_id, 'Owner''s Equity', 0, abs(p_opening_balance), 'Opening balance', current_date, 2, v_key);
    else
      insert into public.journal_entries (account_id, account, debit, credit, description, entry_date, line_no, posting_key)
      values (v_equity_id, 'Owner''s Equity', abs(p_opening_balance), 0, 'Opening balance', current_date, 1, v_key),
             (v_account_id, trim(p_name), 0, abs(p_opening_balance), 'Opening balance', current_date, 2, v_key);
    end if;
  end if;
  return v_account_id;
end;
$$;

create or replace function public.ledger_merge_accounts(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_source_id = p_target_id then raise exception 'Choose two different accounts'; end if;
  if not exists (select 1 from public.accounts where id = p_source_id) or
     not exists (select 1 from public.accounts where id = p_target_id) then
    raise exception 'Account not found';
  end if;
  update public.journal_entries set account_id = p_target_id where account_id = p_source_id;
  update public.transactions set account_id = p_target_id where account_id = p_source_id;
  update public.category_account_mappings set account_id = p_target_id where account_id = p_source_id
    and not exists (
      select 1 from public.category_account_mappings existing
      where existing.account_id = p_target_id
        and lower(existing.category) = lower(category_account_mappings.category)
        and existing.transaction_type = category_account_mappings.transaction_type
    );
  delete from public.category_account_mappings where account_id = p_source_id;
  delete from public.accounts where id = p_source_id;
end;
$$;

create or replace function public.ledger_delete_account(p_account_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.journal_entries where account_id = p_account_id) then
    raise exception 'This account has journal entries. Merge or reassign them before deleting it.';
  end if;
  if exists (select 1 from public.transactions where account_id = p_account_id) then
    raise exception 'This account is used by transactions. Reassign them before deleting it.';
  end if;
  delete from public.category_account_mappings where account_id = p_account_id;
  delete from public.accounts where id = p_account_id;
end;
$$;

-- Existing transactions without a payment account are assigned to chequing.
update public.transactions
set account_id = (select id from public.accounts where name = 'Chequing Account' and user_id is null limit 1)
where account_id is null;

-- Transaction-backed journal rows are derived data. Rebuild them to remove partial and duplicate postings.
delete from public.journal_entries where transaction_id is not null;

do $$
declare tx_id bigint;
begin
  for tx_id in select id from public.transactions order by id loop
    perform public.post_transaction(tx_id);
  end loop;
end $$;

create or replace function public.post_transaction_after_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.post_transaction(new.id);
  return new;
end;
$$;

drop trigger if exists transactions_post_to_ledger on public.transactions;
create trigger transactions_post_to_ledger
after insert on public.transactions
for each row execute function public.post_transaction_after_insert();

alter table public.accounts enable row level security;
alter table public.category_account_mappings enable row level security;

drop policy if exists ledger_accounts_read on public.accounts;
create policy ledger_accounts_read on public.accounts for select to anon, authenticated
using (user_id is null or user_id = auth.uid());
drop policy if exists ledger_accounts_write on public.accounts;
create policy ledger_accounts_write on public.accounts for all to anon, authenticated
using (user_id is null or user_id = auth.uid())
with check (user_id is null or user_id = auth.uid());

drop policy if exists ledger_mappings_read on public.category_account_mappings;
create policy ledger_mappings_read on public.category_account_mappings for select to anon, authenticated
using (user_id is null or user_id = auth.uid());
drop policy if exists ledger_mappings_write on public.category_account_mappings;
create policy ledger_mappings_write on public.category_account_mappings for all to anon, authenticated
using (user_id is null or user_id = auth.uid())
with check (user_id is null or user_id = auth.uid());

grant execute on function public.post_transaction(bigint) to anon, authenticated;
grant execute on function public.ledger_create_account(text, text, numeric, text) to anon, authenticated;
grant execute on function public.ledger_merge_accounts(uuid, uuid) to anon, authenticated;
grant execute on function public.ledger_delete_account(uuid) to anon, authenticated;

commit;
