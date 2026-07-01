-- Ben (2026-06-30): the classifier prompt referenced a "catch-all / escalation
-- category" — call it what it is, "other". Also drop the inquiry_type
-- instruction: inquiry_type is removed (enrichment is gated on explicit lookup
-- nodes now, not on a buyer-type guess).
update flow_nodes
set ai_prompt = '# Classifier

Classify the inbound email into exactly one of the categories listed in the message below — choose the single best fit by the sender''s underlying intent, not their tone or exact wording. Money-back intent is often softened ("this isn''t working", "how do I cancel") — judge by intent. If the email doesn''t clearly fit any listed category, choose the `other` category rather than forcing a guess.'
where inbox_id is null and node_key = 'classify';
