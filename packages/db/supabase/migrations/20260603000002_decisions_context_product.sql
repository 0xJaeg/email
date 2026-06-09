-- Phase 4: decisions gain product attribution + enrichment context.
-- product_id denormalizes the thread's product (deferred from Phase 2) for
-- per-product reporting; context holds the order-lookup + access-check results
-- the agent gathered before drafting the reply.
alter table decisions
  add column product_id uuid references products(id) on delete set null,
  add column context jsonb;
create index decisions_product_id_idx on decisions (product_id);
