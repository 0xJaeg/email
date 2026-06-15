-- Phase A · Increment 3: insert the spam_filter + lookup_gate steps into the
-- global default flow and reposition the existing steps. New order:
-- spam_filter(1) -> classify(2) -> lookup_gate(3) -> enrich(4) -> decide(5) -> draft(6).
-- (Run once against a project already seeded with the original 4-step flow.)
update flow_steps set position = 2 where inbox_id is null and step_key = 'classify';
update flow_steps set position = 4 where inbox_id is null and step_key = 'enrich';
update flow_steps set position = 5 where inbox_id is null and step_key = 'decide';
update flow_steps set position = 6 where inbox_id is null and step_key = 'draft';

insert into flow_steps (inbox_id, step_key, position, title, description) values
  (null, 'spam_filter', 1, 'Spam filter', 'Cheap AI check — if the message is spam/junk/auto-reply, quarantine it and stop (no further processing, no API calls).'),
  (null, 'lookup_gate', 3, 'Order-lookup gate', 'Cheap AI decides whether this ticket needs an order/account lookup, so we do not hit platform APIs on every ticket.');
