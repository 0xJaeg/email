-- Atomically set a classify node's categories + replace its outgoing branch
-- edges, so the classifier enum (config.categories) and the routing edges can
-- never drift. Each element of p_categories is
--   { key, label, description, target_node_id }.
create or replace function set_classify_categories(
  p_node_id uuid,
  p_categories jsonb
) returns void
language plpgsql
as $$
declare
  v_inbox_id uuid;
begin
  select inbox_id into v_inbox_id from flow_nodes where id = p_node_id;

  -- Store key/label/description on the node (target_node_id lives on the edge).
  update flow_nodes
  set config = jsonb_set(
        coalesce(config, '{}'::jsonb),
        '{categories}',
        (
          select coalesce(
            jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object(
                'key', c->>'key',
                'label', c->>'label',
                'description', c->>'description'
              ))
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(p_categories) as c
        )
      ),
      updated_at = now()
  where id = p_node_id;

  -- Replace the node's outgoing branch edges to match the categories exactly.
  delete from flow_edges where from_node_id = p_node_id;

  insert into flow_edges (from_node_id, to_node_id, outcome, position, inbox_id)
  select
    p_node_id,
    (c.elem->>'target_node_id')::uuid,
    c.elem->>'key',
    (c.ord - 1)::int,
    v_inbox_id
  from jsonb_array_elements(p_categories) with ordinality as c(elem, ord);
end;
$$;

-- Doorman: only the secret-key server (which gates on requireAdmin) may call
-- this — never the browser's anon/authenticated roles.
revoke execute on function set_classify_categories(uuid, jsonb) from public;
revoke execute on function set_classify_categories(uuid, jsonb) from anon, authenticated;
