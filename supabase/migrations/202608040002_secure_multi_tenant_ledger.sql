begin;

do $$
declare
  missing_tables text[];
begin
  select array_agg(required_table order by required_table)
  into missing_tables
  from unnest(array[
    'accounts', 'categories', 'transactions', 'journal_entries',
    'assets', 'liabilities', 'category_account_mappings'
  ]) as required_table
  where to_regclass(format('public.%I', required_table)) is null;

  if missing_tables is not null then
    raise exception using
      message = format(
        'LedgerFlow security migration prerequisites are missing: %s',
        array_to_string(missing_tables, ', ')
      ),
      hint = 'Apply all earlier LedgerFlow migrations before 202608040002_secure_multi_tenant_ledger.sql.';
  end if;
end $$;

alter table public.accounts add column if not exists user_id uuid;
alter table public.categories add column if not exists user_id uuid;
alter table public.transactions add column if not exists user_id uuid;
alter table public.transactions add column if not exists transaction_class text;
alter table public.journal_entries add column if not exists user_id uuid;
alter table public.assets add column if not exists user_id uuid;
alter table public.liabilities add column if not exists user_id uuid;
alter table public.category_account_mappings add column if not exists user_id uuid;

do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'accounts', 'categories', 'transactions', 'journal_entries',
    'assets', 'liabilities', 'category_account_mappings'
  ] loop
    constraint_name := table_name || '_user_id_fkey';
    if not exists (
      select 1 from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        table_name,
        constraint_name
      );
    end if;
    execute format('alter table public.%I alter column user_id set default auth.uid()', table_name);
  end loop;
end $$;

-- Preserve a single-user installation automatically. Multi-user projects must
-- assign legacy NULL-owned rows explicitly before users can access them.
do $$
declare
  sole_user_id uuid;
begin
  if (select count(*) from auth.users) = 1 then
    select id into sole_user_id from auth.users limit 1;
    update public.accounts set user_id = sole_user_id where user_id is null;
    update public.categories set user_id = sole_user_id where user_id is null;
    update public.transactions set user_id = sole_user_id where user_id is null;
    update public.assets set user_id = sole_user_id where user_id is null;
    update public.liabilities set user_id = sole_user_id where user_id is null;
    update public.category_account_mappings set user_id = sole_user_id where user_id is null;
    update public.journal_entries j
    set user_id = t.user_id
    from public.transactions t
    where t.id = j.transaction_id and j.user_id is null;
    update public.journal_entries j
    set user_id = a.user_id
    from public.accounts a
    where a.id = j.account_id and j.user_id is null;
    update public.journal_entries set user_id = sole_user_id where user_id is null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'journal_entries_transaction_id_fkey'
      and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_transaction_id_fkey
      foreign key (transaction_id) references public.transactions(id) on delete cascade;
  end if;
end $$;

drop index if exists public.accounts_user_name_type_unique;
create unique index if not exists accounts_user_name_type_unique
  on public.accounts(user_id, lower(name), type)
  where user_id is not null;

drop index if exists public.category_account_mappings_unique;
create unique index if not exists category_account_mappings_unique
  on public.category_account_mappings(user_id, lower(category), transaction_type)
  where user_id is not null;

create unique index if not exists categories_user_name_unique
  on public.categories(user_id, lower(name))
  where user_id is not null;

do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'accounts', 'categories', 'transactions', 'journal_entries',
    'assets', 'liabilities', 'category_account_mappings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy_record in
      select policyname from pg_policies where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      table_name || '_delete_own', table_name
    );
  end loop;
end $$;

create or replace function public.ensure_user_chart()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  insert into public.accounts (name, type, category, description, user_id)
  values
    ('Cash', 'Asset', 'cash', 'Cash on hand', current_user_id),
    ('Bank Account', 'Asset', 'bank_account', 'General bank account', current_user_id),
    ('Chequing Account', 'Asset', 'checking_account', 'Primary chequing account', current_user_id),
    ('Checking Account', 'Asset', 'checking_account', 'Primary checking account', current_user_id),
    ('Savings Account', 'Asset', 'savings_account', 'Savings and reserves', current_user_id),
    ('Accounts Receivable', 'Asset', 'accounts_receivable', 'Amounts due from customers', current_user_id),
    ('Vehicle', 'Asset', 'vehicle', 'Vehicles owned', current_user_id),
    ('Phone Equipment', 'Asset', 'phone_equipment', 'Phones and related equipment', current_user_id),
    ('Equipment', 'Asset', 'equipment', 'Business equipment', current_user_id),
    ('Investment', 'Asset', 'investment', 'Investments', current_user_id),
    ('Credit Card Payable', 'Liability', 'credit_card', 'Credit card balance payable', current_user_id),
    ('Car Loan', 'Liability', 'car_loan', 'Vehicle financing', current_user_id),
    ('Phone Financing', 'Liability', 'phone_financing', 'Phone financing payable', current_user_id),
    ('Student Loan', 'Liability', 'student_loan', 'Student loan payable', current_user_id),
    ('Loan', 'Liability', 'loan', 'General loan payable', current_user_id),
    ('Owner''s Equity', 'Equity', 'owner_equity', 'Owner contributions', current_user_id),
    ('Retained Earnings', 'Equity', 'retained_earnings', 'Accumulated earnings before the current ledger period', current_user_id),
    ('Salary Revenue', 'Revenue', 'salary', 'Employment income', current_user_id),
    ('Freelance Revenue', 'Revenue', 'freelance', 'Freelance income', current_user_id),
    ('Other Revenue', 'Revenue', 'other', 'Unmapped revenue', current_user_id),
    ('Food Expense', 'Expense', 'food', 'Food and dining', current_user_id),
    ('Phone Expense', 'Expense', 'phone', 'Phone service and usage', current_user_id),
    ('Transportation Expense', 'Expense', 'transport', 'Transportation costs', current_user_id),
    ('Subscription Expense', 'Expense', 'subscriptions', 'Recurring subscriptions', current_user_id),
    ('Rent Expense', 'Expense', 'rent', 'Rent and lease costs', current_user_id),
    ('Utilities Expense', 'Expense', 'utilities', 'Utilities', current_user_id),
    ('Other Expense', 'Expense', 'other', 'Unmapped expenses', current_user_id)
  on conflict do nothing;

  insert into public.category_account_mappings (category, transaction_type, account_id, user_id)
  select mapping.category, mapping.transaction_type, a.id, current_user_id
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
  join public.accounts a on a.name = mapping.account_name and a.user_id = current_user_id
  on conflict do nothing;

  insert into public.categories (name, type, user_id)
  select category_seed.name, category_seed.type, current_user_id
  from (values
    ('food', 'expense'),
    ('transport', 'expense'),
    ('rent', 'expense'),
    ('utilities', 'expense'),
    ('entertainment', 'expense'),
    ('shopping', 'expense'),
    ('health', 'expense'),
    ('education', 'expense'),
    ('freelance', 'income'),
    ('salary', 'income'),
    ('investment', 'savings'),
    ('gift', 'expense'),
    ('savings', 'savings'),
    ('subscriptions', 'expense'),
    ('travel', 'expense'),
    ('other', 'expense')
  ) as category_seed(name, type)
  on conflict do nothing;
end;
$$;

do $$
declare
  existing_user_id uuid;
begin
  for existing_user_id in
    select distinct user_id from (
      select user_id from public.accounts where user_id is not null
      union all
      select user_id from public.transactions where user_id is not null
      union all
      select user_id from public.assets where user_id is not null
      union all
      select user_id from public.liabilities where user_id is not null
    ) owned_users
  loop
    perform set_config('request.jwt.claim.sub', existing_user_id::text, true);
    perform public.ensure_user_chart();
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

update public.transactions tx
set category_id = category.id
from public.categories category
where tx.user_id = category.user_id
  and lower(category.name) = lower(coalesce(tx.category, 'other'))
  and tx.category_id is null;

create or replace function public.ledger_account_for_transaction(
  p_category text,
  p_type text,
  p_description text default null
) returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_category text := lower(coalesce(nullif(trim(p_category), ''), 'other'));
  resolved_account_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_user_chart();

  if normalized_category = 'other' then
    if lower(coalesce(p_description, '')) ~ '(lunch|food|grocery|coffee|restaurant|starbucks)' then normalized_category := 'food';
    elsif lower(coalesce(p_description, '')) ~ '(gas|fuel|uber|taxi|train|bus)' then normalized_category := 'transport';
    elsif lower(coalesce(p_description, '')) ~ '(netflix|spotify|subscription|stream)' then normalized_category := 'subscriptions';
    elsif lower(coalesce(p_description, '')) ~ '(freelance|contract|gig)' and p_type = 'income' then normalized_category := 'freelance';
    end if;
  end if;

  select mapping.account_id into resolved_account_id
  from public.category_account_mappings mapping
  where mapping.user_id = current_user_id
    and lower(mapping.category) = normalized_category
    and mapping.transaction_type = p_type
  limit 1;

  if resolved_account_id is null then
    select id into resolved_account_id
    from public.accounts
    where user_id = current_user_id
      and name = case when p_type = 'income' then 'Other Revenue' else 'Other Expense' end
    limit 1;
  end if;
  return resolved_account_id;
end;
$$;

create or replace function public.post_transaction(p_transaction_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  tx public.transactions%rowtype;
  debit_account_id uuid;
  credit_account_id uuid;
  debit_name text;
  credit_name text;
  existing_count integer;
  existing_delta numeric;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_user_chart();
  select * into tx from public.transactions
  where id = p_transaction_id and user_id = current_user_id
  for update;
  if not found then raise exception 'Transaction not found or not owned by current user'; end if;
  if coalesce(tx.amount, 0) <= 0 then raise exception 'Transaction amount must be greater than zero'; end if;

  select count(*), coalesce(sum(debit), 0) - coalesce(sum(credit), 0)
  into existing_count, existing_delta
  from public.journal_entries
  where transaction_id = tx.id and user_id = current_user_id;
  if existing_count = 2 and abs(existing_delta) < 0.005 then return; end if;
  if existing_count > 0 then
    delete from public.journal_entries where transaction_id = tx.id and user_id = current_user_id;
  end if;

  if tx.transaction_class = 'expense_refund' then
    debit_account_id := tx.account_id;
    credit_account_id := public.ledger_account_for_transaction(tx.category, 'expense', tx.description);
  elsif tx.type = 'income' then
    debit_account_id := tx.account_id;
    credit_account_id := public.ledger_account_for_transaction(tx.category, 'income', tx.description);
  elsif tx.type = 'savings' then
    debit_account_id := public.ledger_account_for_transaction('savings', 'savings', tx.description);
    credit_account_id := tx.account_id;
  else
    debit_account_id := public.ledger_account_for_transaction(tx.category, 'expense', tx.description);
    credit_account_id := tx.account_id;
  end if;

  if debit_account_id is null or credit_account_id is null then
    raise exception 'Transaction could not resolve both accounting accounts';
  end if;
  if not exists (select 1 from public.accounts where id = debit_account_id and user_id = current_user_id) or
     not exists (select 1 from public.accounts where id = credit_account_id and user_id = current_user_id) then
    raise exception 'Transaction references an account not owned by current user';
  end if;

  select name into debit_name from public.accounts where id = debit_account_id;
  select name into credit_name from public.accounts where id = credit_account_id;
  insert into public.journal_entries
    (transaction_id, account_id, account, debit, credit, description, entry_date, line_no, created_at, user_id)
  values
    (tx.id, debit_account_id, debit_name, abs(tx.amount), 0, tx.description, coalesce(tx.transaction_date, tx.date, current_date), 1, coalesce(tx.transaction_date, tx.date, current_date)::timestamp, current_user_id),
    (tx.id, credit_account_id, credit_name, 0, abs(tx.amount), tx.description, coalesce(tx.transaction_date, tx.date, current_date), 2, coalesce(tx.transaction_date, tx.date, current_date)::timestamp, current_user_id);
end;
$$;

create or replace function public.prepare_transaction_account()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  perform public.ensure_user_chart();
  if new.account_id is null then
    select id into new.account_id
    from public.accounts
    where user_id = auth.uid() and name = 'Chequing Account'
    limit 1;
  end if;
  if not exists (select 1 from public.accounts where id = new.account_id and user_id = auth.uid()) then
    raise exception 'Payment account is not owned by current user';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories where id = new.category_id and user_id = auth.uid()
  ) then
    raise exception 'Category is not owned by current user';
  end if;
  return new;
end;
$$;

create or replace function public.prepare_journal_entry_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  if not exists (select 1 from public.accounts where id = new.account_id and user_id = auth.uid()) then
    raise exception 'Journal account is not owned by current user';
  end if;
  if new.transaction_id is not null and not exists (
    select 1 from public.transactions where id = new.transaction_id and user_id = auth.uid()
  ) then
    raise exception 'Journal transaction is not owned by current user';
  end if;
  return new;
end;
$$;

create or replace function public.prepare_category_mapping_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  if not exists (select 1 from public.accounts where id = new.account_id and user_id = auth.uid()) then
    raise exception 'Mapped account is not owned by current user';
  end if;
  return new;
end;
$$;

create or replace function public.repost_transaction_after_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.journal_entries
  where transaction_id = new.id and user_id = auth.uid();
  perform public.post_transaction(new.id);
  return new;
end;
$$;

drop trigger if exists transactions_prepare_account on public.transactions;
create trigger transactions_prepare_account
before insert or update of account_id, category_id on public.transactions
for each row execute function public.prepare_transaction_account();

drop trigger if exists journal_entries_prepare_owner on public.journal_entries;
create trigger journal_entries_prepare_owner
before insert or update of account_id, transaction_id on public.journal_entries
for each row execute function public.prepare_journal_entry_owner();

drop trigger if exists category_mappings_prepare_owner on public.category_account_mappings;
create trigger category_mappings_prepare_owner
before insert or update of account_id on public.category_account_mappings
for each row execute function public.prepare_category_mapping_owner();

drop trigger if exists transactions_repost_after_update on public.transactions;
create trigger transactions_repost_after_update
after update of amount, type, category, description, transaction_date, date, account_id, transaction_class
on public.transactions
for each row execute function public.repost_transaction_after_update();

create or replace function public.ledger_create_account(
  p_name text,
  p_type text,
  p_opening_balance numeric default 0,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  account_id_value uuid;
  equity_id uuid;
  opening_key text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Account name is required'; end if;
  if p_type not in ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') then raise exception 'Invalid account type'; end if;
  perform public.ensure_user_chart();

  insert into public.accounts (name, type, category, opening_balance, description, user_id)
  values (trim(p_name), p_type, 'custom', abs(coalesce(p_opening_balance, 0)), nullif(trim(p_description), ''), current_user_id)
  returning id into account_id_value;

  if abs(coalesce(p_opening_balance, 0)) >= 0.005 then
    select id into equity_id from public.accounts
    where name = 'Owner''s Equity' and user_id = current_user_id limit 1;
    opening_key := 'opening:' || account_id_value::text;
    if p_type in ('Asset', 'Expense') then
      insert into public.journal_entries (account_id, account, debit, credit, description, entry_date, line_no, posting_key, user_id)
      values (account_id_value, trim(p_name), abs(p_opening_balance), 0, 'Opening balance', current_date, 1, opening_key, current_user_id),
             (equity_id, 'Owner''s Equity', 0, abs(p_opening_balance), 'Opening balance', current_date, 2, opening_key, current_user_id);
    else
      insert into public.journal_entries (account_id, account, debit, credit, description, entry_date, line_no, posting_key, user_id)
      values (equity_id, 'Owner''s Equity', abs(p_opening_balance), 0, 'Opening balance', current_date, 1, opening_key, current_user_id),
             (account_id_value, trim(p_name), 0, abs(p_opening_balance), 'Opening balance', current_date, 2, opening_key, current_user_id);
    end if;
  end if;
  return account_id_value;
end;
$$;

create or replace function public.ledger_merge_accounts(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_source_id = p_target_id then raise exception 'Choose two different accounts'; end if;
  if not exists (select 1 from public.accounts where id = p_source_id and user_id = current_user_id) or
     not exists (select 1 from public.accounts where id = p_target_id and user_id = current_user_id) then
    raise exception 'Account not found or not owned by current user';
  end if;
  if (select type from public.accounts where id = p_source_id) <>
     (select type from public.accounts where id = p_target_id) then
    raise exception 'Only accounts of the same type can be merged';
  end if;
  update public.journal_entries set account_id = p_target_id, account = (select name from public.accounts where id = p_target_id)
    where account_id = p_source_id and user_id = current_user_id;
  update public.transactions set account_id = p_target_id
    where account_id = p_source_id and user_id = current_user_id;
  update public.category_account_mappings mapping
  set account_id = p_target_id
  where mapping.account_id = p_source_id
    and mapping.user_id = current_user_id
    and not exists (
      select 1 from public.category_account_mappings existing
      where existing.user_id = current_user_id
        and existing.account_id = p_target_id
        and lower(existing.category) = lower(mapping.category)
        and existing.transaction_type = mapping.transaction_type
    );
  delete from public.category_account_mappings where account_id = p_source_id and user_id = current_user_id;
  delete from public.accounts where id = p_source_id and user_id = current_user_id;
end;
$$;

create or replace function public.ledger_delete_account(p_account_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id and user_id = current_user_id) then
    raise exception 'Account not found or not owned by current user';
  end if;
  if exists (select 1 from public.journal_entries where account_id = p_account_id and user_id = current_user_id) then
    raise exception 'This account has journal entries. Merge or reassign them before deleting it.';
  end if;
  if exists (select 1 from public.transactions where account_id = p_account_id and user_id = current_user_id) then
    raise exception 'This account is used by transactions. Reassign them before deleting it.';
  end if;
  delete from public.category_account_mappings where account_id = p_account_id and user_id = current_user_id;
  delete from public.accounts where id = p_account_id and user_id = current_user_id;
end;
$$;

revoke execute on function public.ensure_user_chart() from public, anon;
revoke execute on function public.ledger_account_for_transaction(text, text, text) from public, anon;
revoke execute on function public.post_transaction(bigint) from public, anon;
revoke execute on function public.ledger_create_account(text, text, numeric, text) from public, anon;
revoke execute on function public.ledger_merge_accounts(uuid, uuid) from public, anon;
revoke execute on function public.ledger_delete_account(uuid) from public, anon;

grant execute on function public.ensure_user_chart() to authenticated;
grant execute on function public.ledger_account_for_transaction(text, text, text) to authenticated;
grant execute on function public.post_transaction(bigint) to authenticated;
grant execute on function public.ledger_create_account(text, text, numeric, text) to authenticated;
grant execute on function public.ledger_merge_accounts(uuid, uuid) to authenticated;
grant execute on function public.ledger_delete_account(uuid) to authenticated;

commit;
