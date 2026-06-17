-- Phase 4: per-product multi-platform API config. `scope` splits least-privilege
-- view (order lookup) keys from refund keys; `platform_order` defines the order
-- the view keys are tried in (JVZoo -> ClickBank -> Digistore) until a purchase
-- is found. Digistore is allowed via the existing text `platform` column (no
-- enum), so no constraint change is needed.
alter table integration_credentials
  add column if not exists scope text not null default 'view',
  add column if not exists platform_order int not null default 0;
