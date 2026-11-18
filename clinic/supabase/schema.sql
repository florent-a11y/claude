-- Database for the clinic storefront. Run once in Supabase > SQL Editor (safe to run again).
-- The app talks to these tables only from the server with the service-role key; row-level security is on
-- with no policies, so the public (anon) key can read or write nothing.

create table if not exists clinic_orders (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null,
  email text not null,
  phone text not null,
  total_idr bigint not null,
  paid boolean not null default false,
  -- The full order, including the health questionnaire (sensitive personal data).
  payload jsonb not null
);
create index if not exists clinic_orders_created_idx on clinic_orders (created_at desc);
create index if not exists clinic_orders_status_idx on clinic_orders (status);
create index if not exists clinic_orders_intent_idx on clinic_orders ((payload->>'airwallexIntentId'));
alter table clinic_orders enable row level security;

create table if not exists clinic_leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  payload jsonb not null
);
create index if not exists clinic_leads_created_idx on clinic_leads (created_at desc);
alter table clinic_leads enable row level security;

-- Private bucket for bank-transfer proofs (served to the console through short-lived signed links).
insert into storage.buckets (id, name, public) values ('clinic-proofs', 'clinic-proofs', false)
on conflict (id) do nothing;
