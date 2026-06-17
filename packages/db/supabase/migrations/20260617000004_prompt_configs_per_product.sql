-- Phase 6: make prompts per-product (Ben: prompts must be per product). A row
-- with product_id = null is the shared DEFAULT (template); a row with product_id
-- set overrides that kind for that product. The worker resolves the routed
-- product's prompts, falling back to the default per kind. Backward-compatible:
-- with no per-product rows, every product resolves to today's global defaults.
alter table prompt_configs
  add column if not exists product_id uuid references products(id) on delete cascade;

-- Was unique(kind) (one prompt per kind, globally). Now unique per (product, kind)
-- so each product can hold its own copy of a kind alongside the default.
alter table prompt_configs drop constraint if exists prompt_configs_kind_key;
alter table prompt_configs
  add constraint prompt_configs_product_kind_key unique (product_id, kind);

create index if not exists prompt_configs_product_id_idx
  on prompt_configs (product_id);
