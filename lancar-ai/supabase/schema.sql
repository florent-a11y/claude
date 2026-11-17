-- Lancar AI: enquiries from the contact form and the readiness quiz.
-- Run once in the Supabase SQL editor. The site writes with the service role key; nothing else can read or write.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new',
  source text not null check (source in ('contact', 'quiz')),
  locale text not null check (locale in ('id', 'en')),
  name text not null,
  business text not null,
  whatsapp text not null,
  email text not null default '',
  location text not null,
  sector text not null,
  team text not null,
  message text not null default '',
  quiz jsonb
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Row level security with no policies: the anon and authenticated roles get nothing; the service role bypasses RLS.
alter table public.leads enable row level security;
