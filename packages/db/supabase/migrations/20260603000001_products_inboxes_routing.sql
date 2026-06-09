-- Multi-product / multi-inbox foundation (Phase 2).
-- Adds products + inboxes, links threads to a product + inbox, and backfills a
-- default product so existing threads keep working. The webhook resolves the
-- incoming Agent Mail inbox_id to a product+inbox; unknown inboxes fall back to
-- the default product (and are audited) so inbound email is never dropped.

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  platform text not null,            -- 'clickbank' | 'jvzoo'
  adapter_key text,                  -- which coded ProductAdapter handles this product
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_slug_idx on products (slug);

create table inboxes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  agent_mail_inbox_id text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inboxes_product_id_idx on inboxes (product_id);

alter table threads
  add column product_id uuid references products(id) on delete set null,
  add column inbox_id uuid references inboxes(id) on delete set null;
create index threads_product_id_idx on threads (product_id);
create index threads_inbox_id_idx on threads (inbox_id);

-- Backfill a default product and attach existing threads to it. Seed the real
-- inbox(es) separately, e.g.:
--   insert into inboxes (product_id, agent_mail_inbox_id, address)
--   values ((select id from products where slug = 'default'),
--           '<your AGENT_MAIL_INBOX_ID>', 'support@yourdomain.com');
insert into products (name, slug, platform, adapter_key)
  values ('Default', 'default', 'clickbank', 'mock');

update threads
  set product_id = (select id from products where slug = 'default')
  where product_id is null;

-- RLS parity with the other dashboard tables. Service-role reads bypass RLS;
-- these gate the browser/authenticated client and ready an admin UI.
alter table products enable row level security;
alter table inboxes enable row level security;
create policy "authenticated read products" on products for select to authenticated using (true);
create policy "authenticated read inboxes" on inboxes for select to authenticated using (true);
