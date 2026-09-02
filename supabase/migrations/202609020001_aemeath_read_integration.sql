begin;

do $$
begin
  if to_regclass('public.transactions') is null or
     to_regclass('public.accounts') is null then
    raise exception 'Aemeath integration requires public.transactions and public.accounts';
  end if;
end $$;

alter table public.transactions
  add column if not exists updated_at timestamptz;

update public.transactions
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table public.transactions
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.set_transaction_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_transaction_updated_at();

create index if not exists transactions_user_change_feed_idx
  on public.transactions(user_id, updated_at, id);

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (trim(name) <> ''),
  scope text not null check (trim(scope) <> ''),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create index if not exists integration_tokens_user_id_idx
  on public.integration_tokens(user_id);

alter table public.integration_tokens enable row level security;
revoke all on table public.integration_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.integration_tokens to service_role;

create or replace function public.aemeath_fetch_transactions(
  p_user_id uuid,
  p_after_updated_at timestamptz default null,
  p_after_id bigint default null,
  p_limit integer default 500
)
returns table (
  transaction_id text,
  account_id uuid,
  occurred_on date,
  description text,
  amount text,
  currency text,
  category text,
  ledgerflow_type text,
  transaction_class text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    transaction.id::text,
    transaction.account_id,
    coalesce(transaction.transaction_date, transaction.date, transaction.created_at::date),
    transaction.description,
    transaction.amount::text,
    account.currency,
    nullif(trim(transaction.category), ''),
    transaction.type,
    transaction.transaction_class,
    transaction.updated_at
  from public.transactions transaction
  left join public.accounts account
    on account.id = transaction.account_id
   and account.user_id = transaction.user_id
  where transaction.user_id = p_user_id
    and (
      p_after_updated_at is null
      or (transaction.updated_at, transaction.id) > (p_after_updated_at, p_after_id)
    )
  order by transaction.updated_at, transaction.id
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;

revoke execute on function public.aemeath_fetch_transactions(uuid, timestamptz, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.aemeath_fetch_transactions(uuid, timestamptz, bigint, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
