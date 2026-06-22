-- One key per (product, platform, scope) slot, so the per-product key editor on
-- the product page can upsert by that identity (onConflict). Safe to add:
-- integration_credentials currently has no rows, let alone duplicate slots.
create unique index integration_credentials_product_platform_scope_idx
  on integration_credentials (product_id, platform, scope);
