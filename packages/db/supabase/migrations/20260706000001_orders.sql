-- Our own orders store, fed by direct platform webhooks (JVZoo + Digistore now;
-- ClickBank / others later). purchase_lookup queries THIS by email instead of
-- hitting the platform APIs per ticket — Ben's call (2026-07): own the purchase
-- signal so a customer's order is still visible even if a third-party pipeline
-- breaks. One row per platform order (unique platform + order_id); later
-- refund / chargeback / cancel events update that row's status.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  order_id text not null,
  email text not null,
  customer_name text,
  product_id text,
  product_name text,
  amount numeric,
  currency text,
  -- active | refunded | chargeback | cancelled — derived from the event type.
  status text not null default 'active',
  event_type text,
  purchased_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, order_id)
);

-- Lookup is by (normalized) email; status filters to real purchases.
create index if not exists orders_email_idx on orders (email);

-- Doorman RLS (same as the other tables): the secret-key server reads/writes
-- freely; the browser can read but not write.
alter table orders enable row level security;
create policy orders_select_authenticated on orders
  for select to authenticated using (true);
