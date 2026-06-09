-- Phase 7c: encrypted per-product API credentials (ClickBank/JVZoo keys).
-- Ciphertext only — AES-256-GCM via the app's CREDENTIALS_ENC_KEY. RLS is
-- enabled with NO select policy on purpose: the browser/authenticated client
-- can never read the ciphertext; only the secret-key server reads + decrypts it.
create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  platform text not null,            -- 'clickbank' | 'jvzoo'
  label text not null,
  ciphertext text not null,
  last4 text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integration_credentials_product_id_idx on integration_credentials (product_id);

alter table integration_credentials enable row level security;
-- (No select policy — deny-all to the browser; the doorman server reads it.)
