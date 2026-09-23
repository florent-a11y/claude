-- Run in Supabase SQL editor. Service-role key is used server-side only; RLS blocks anon access.
create table if not exists public.orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null check (status in ('pending_payment','paid','in_progress','delivered','refunded','cancelled')),
  amount_cents integer not null,
  currency text not null default 'USD',
  airwallex_intent_id text unique,
  paid_at timestamptz,
  delivered_at timestamptz,
  ops_notes text,
  email text not null,
  phone text not null,
  payload jsonb not null
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_email_idx on public.orders (email);

create table if not exists public.news_items (
  id text primary key,
  source text not null,
  title text not null,
  url text not null,
  summary text not null default '',
  published_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.news_items enable row level security;
-- No policies for anon/authenticated: only the service role (server) can read/write.

-- PDP Law retention: hard-delete passport data 30 days after the arrival date.
-- Schedule with pg_cron (Supabase > Database > Extensions > pg_cron):
-- select cron.schedule('purge-orders', '0 3 * * *', $$
--   delete from public.orders
--   where (payload->'travel'->>'arrivalDate')::date < now() - interval '30 days';
-- $$);
