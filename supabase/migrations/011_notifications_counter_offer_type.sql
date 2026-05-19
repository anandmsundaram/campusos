-- Add counter_offer to the notifications type check constraint
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'offer_received',
    'offer_accepted',
    'offer_rejected',
    'counter_offer',
    'new_message',
    'task_completed'
  ));
