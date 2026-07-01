-- Remove the orphaned old refund path (refund_ladder → reply_refund), bypassed
-- by 20260701000003's reshape (order_lookup_refund[found] now routes to
-- refund_problem_gate). Nothing routes into refund_ladder anymore, so these are
-- dead nodes cluttering the /flows canvas. The refund_ladder node TYPE stays
-- registered in code for other trees / a future offer ladder.
delete from flow_edges
where inbox_id is null
  and (
    from_node_id in (
      select id from flow_nodes
      where inbox_id is null and node_key in ('refund_ladder', 'reply_refund')
    )
    or to_node_id in (
      select id from flow_nodes
      where inbox_id is null and node_key in ('refund_ladder', 'reply_refund')
    )
  );

delete from flow_nodes
where inbox_id is null and node_key in ('refund_ladder', 'reply_refund');
