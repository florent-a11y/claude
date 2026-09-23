-- Run in Supabase SQL editor. Service-role key is used server-side only; RLS blocks anon access.
create table if not exists public.orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null check (status in ('pending_payment','paid','acknowledged','in_progress','submitted','delivered','refunded','cancelled')),
  amount_cents integer not null,
  government_fee_cents integer not null default 0,
  product text not null default 'arrival_card' check (product in ('arrival_card','evoa','bundle')),
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

-- Private bucket for e-VOA documents (passport scan, photo). Served to ops via short signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

alter table public.orders enable row level security;
alter table public.news_items enable row level security;
-- No policies for anon/authenticated: only the service role (server) can read/write.

-- PDP Law retention: hard-delete passport data 30 days after the arrival date.
-- Schedule with pg_cron (Supabase > Database > Extensions > pg_cron):
-- select cron.schedule('purge-orders', '0 3 * * *', $$
--   delete from public.orders
--   where (payload->'travel'->>'arrivalDate')::date < now() - interval '30 days';
--   -- also purge uploaded documents older than 30 days:
--   delete from storage.objects where bucket_id = 'documents' and created_at < now() - interval '45 days';
-- $$);

-- Migration if the table already exists with the old status list:
-- alter table public.orders drop constraint orders_status_check;
-- alter table public.orders add constraint orders_status_check
--   check (status in ('pending_payment','paid','acknowledged','in_progress','submitted','delivered','refunded','cancelled'));
