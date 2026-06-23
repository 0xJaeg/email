-- Unsubscribe now actually removes the customer (Ben, 2026-06-19 review).
-- Previously classify[unsubscribe] → reply_unsubscribe just sent a FAQ-style
-- acknowledgement (decision send_faq_reply) and suppressed nobody. Flip the
-- node's decision to "unsubscribe", which DraftStep maps to a suppress_contact
-- proposal + the drafted confirmation. On approval, suppressContact adds them to
-- suppression_list AND pushes to the external email system (SUPPRESSION_WEBHOOK_URL)
-- — so we only tell them they are unsubscribed once the removal actually runs
-- (still draft-only in the worker; approval executes it).
--
-- The success / email-not-found / failed branching off a live unsubscribe API
-- stays pending that API (Ashish); the suppression + webhook push are wired now.
-- The node keeps its existing acknowledgement prompt.

update flow_nodes
set config = jsonb_build_object('decision', 'unsubscribe'),
    title = 'Unsubscribe',
    description = 'Propose removing the sender from mailings (suppress) and draft the confirmation. The suppression + reply execute on approval — we confirm removal before telling them they are unsubscribed.'
where inbox_id is null and node_key = 'reply_unsubscribe';
