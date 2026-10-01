-- ILA Office storage. Each collection is a document table: the application reads and writes `data` (jsonb)
-- through lib/db.ts; `entity_id` is denormalised for indexing and row-level policies later on.
-- Run in the Supabase SQL editor. The service-role key is used server-side only; RLS blocks anon access.

create or replace function public.ila_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','entities','contacts','companies','deals','services','quotes','projects','vendors','renewals','activities','tasks',
    'accounts','journal_entries','periods','bank_accounts','bank_transactions','invoices','bills','payments','fixed_assets',
    'employees','payroll_runs','withholding_slips','vat_transactions','tax_obligations','import_batches','counters','settings'
  ] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      entity_id text,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', t);
    execute format('create index if not exists %I on public.%I (entity_id)', t || '_entity_idx', t);
    execute format('create index if not exists %I on public.%I using gin (data jsonb_path_ops)', t || '_data_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ila_touch()', t || '_touch', t);
  end loop;
end $$;

-- Hot paths.
create index if not exists journal_entries_period_idx on public.journal_entries ((data->>'period'));
create index if not exists tax_obligations_period_idx on public.tax_obligations ((data->>'period'));
create index if not exists users_email_idx on public.users ((lower(data->>'email')));
create index if not exists bank_transactions_hash_idx on public.bank_transactions ((data->>'hash'));

-- Optional: private bucket for attachments (invoices, bukti potong PDFs, bank statements).
insert into storage.buckets (id, name, public, file_size_limit)
values ('ila-office', 'ila-office', false, 16777216)
on conflict (id) do nothing;
