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

-- Reminder list ("waitlist"): travelers arriving in more than 72 hours; we email them when the window opens.
create table if not exists public.reminders (
  id uuid primary key,
  email text not null,
  arrival_date date not null,
  travelers integer not null default 1 check (travelers between 1 and 10),
  nationality text,
  product_interest text not null default 'arrival_card' check (product_interest in ('arrival_card','evoa','bundle')),
  locale text not null default 'en',
  source text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  notified_early_at timestamptz,
  unsubscribed_at timestamptz,
  converted_order_id uuid,
  token text not null unique,
  -- Ad attribution (utm, gclid, fbclid, cookies, ip, user agent) captured at sign-up; see docs/tracking.md.
  attribution jsonb
);
create index if not exists reminders_arrival_date_idx on public.reminders (arrival_date);
-- Migration if the table already exists without the column:
-- alter table public.reminders add column if not exists attribution jsonb;
-- One row per person and arrival date; the API looks up the existing row and updates it (upsert).
create unique index if not exists reminders_email_date_uidx on public.reminders (lower(email), arrival_date);

-- Private bucket for e-VOA documents (passport scan, photo). Served to ops via short signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

alter table public.orders enable row level security;
alter table public.news_items enable row level security;
alter table public.reminders enable row level security;
-- No policies for anon/authenticated: only the service role (server) can read/write.

-- PDP Law retention (data minimisation), one nightly pg_cron job (Supabase > Database > Extensions > pg_cron):
--   * orders: hard-delete passport data (whole row incl. payload, attribution ip/user agent) 30 days after arrival;
--     orders that never got a payment or arrival (abandoned checkouts) go 30 days after creation;
--   * documents: uploaded passport scans/photos in the private bucket, 45 days after upload (uploads happen up to
--     ~30 days before an arrival and the order row is gone 30 days after it, so nothing is kept longer than the order);
--   * reminders: email + arrival date + attribution, 60 days after the arrival date they were set for.
-- select cron.schedule('purge-personal-data', '0 3 * * *', $$
--   delete from public.orders
--   where (payload->'travel'->>'arrivalDate')::date < now() - interval '30 days'
--      or (status in ('pending_payment','cancelled') and created_at < now() - interval '30 days');
--   delete from storage.objects where bucket_id = 'documents' and created_at < now() - interval '45 days';
--   delete from public.reminders where arrival_date < now() - interval '60 days';
-- $$);

-- Migration if the table already exists with the old status list:
-- alter table public.orders drop constraint orders_status_check;
-- alter table public.orders add constraint orders_status_check
--   check (status in ('pending_payment','paid','acknowledged','in_progress','submitted','delivered','refunded','cancelled'));
