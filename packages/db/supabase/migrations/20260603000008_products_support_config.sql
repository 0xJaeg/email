-- Per-product support facts (real login/reset/dashboard URLs + platform) so the
-- reply model grounds answers in each product's ACTUAL links instead of
-- inventing placeholders. Editable per product; empty {} = no facts (the reply
-- then gives steps in words without a fabricated URL).
alter table products
  add column support_config jsonb not null default '{}'::jsonb;
