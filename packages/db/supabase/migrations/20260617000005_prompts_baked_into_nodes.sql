-- Per-node prompts: bake the shared prompt_configs content into each prompt-driven
-- node's ai_prompt so the flow is self-contained. The worker prepends the
-- hard-coded HEADER / REPLY_HEADER framing (see apps/worker/src/lib/instructions.ts).
-- prompt_configs is intentionally KEPT here — it's dropped post-deploy together with
-- flow_steps, because the currently-deployed worker still reads it.

-- classify: full classifier body (all kinds, sorted) = instructions.classifier minus HEADER.
update flow_nodes
set ai_prompt = (
  select string_agg('# ' || kind || E'\n\n' || content, E'\n\n---\n\n' order by kind)
  from prompt_configs where product_id is null and is_active
)
where inbox_id is null and node_key = 'classify';

-- reply nodes: prepend the reply body (tone, policy_refund, policy_faq; customer-facing
-- trim; in REPLY_KINDS order) to each node's existing branch guidance.
update flow_nodes n
set ai_prompt = (
  select string_agg(
    '# ' || kind || E'\n\n' ||
      regexp_replace(content, E'\n#+ *What the classifier should remember.*$', '', 'is'),
    E'\n\n---\n\n'
    order by case kind when 'tone' then 1 when 'policy_refund' then 2 when 'policy_faq' then 3 end
  )
  from prompt_configs
  where product_id is null and is_active and kind in ('tone', 'policy_refund', 'policy_faq')
) || E'\n\n---\n\n' || coalesce(n.ai_prompt, '')
where n.inbox_id is null
  and n.node_key in ('reply_sales', 'reply_login', 'reply_no_order', 'reply_general', 'reply_unsubscribe', 'reply_refund');

-- spam_filter: bake the built-in default prompt so it's visible/editable in the flow.
update flow_nodes
set ai_prompt = 'You are a spam filter for a product support inbox. Mark is_spam=true ONLY for clear junk: bulk marketing, phishing, automated bounce/out-of-office notices, or unrelated solicitations. A real customer question — even angry, vague, or off-topic — is NOT spam.'
where inbox_id is null and node_key = 'spam_filter' and coalesce(ai_prompt, '') = '';
