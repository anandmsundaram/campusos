-- Backfill scheduled_time for old requests that stored vague relative labels
-- ("Today, flexible time", "Tomorrow at 3:00 PM", etc.) instead of timestamps.
-- Uses created_at as the reference anchor for "today"/"tomorrow".

-- Today → same calendar day as created_at, noon local (stored as UTC)
UPDATE public.requests
SET
  scheduled_time = (date_trunc('day', created_at AT TIME ZONE 'UTC') + interval '12 hours') AT TIME ZONE 'UTC',
  flexible_time  = (structured_data->>'deadline_text' ILIKE '%flexible%')
WHERE
  scheduled_time IS NULL
  AND structured_data IS NOT NULL
  AND structured_data->>'deadline_text' ILIKE 'today%';

-- Tomorrow → created_at + 1 day, noon
UPDATE public.requests
SET
  scheduled_time = (date_trunc('day', created_at AT TIME ZONE 'UTC') + interval '36 hours') AT TIME ZONE 'UTC',
  flexible_time  = (structured_data->>'deadline_text' ILIKE '%flexible%')
WHERE
  scheduled_time IS NULL
  AND structured_data IS NOT NULL
  AND structured_data->>'deadline_text' ILIKE 'tomorrow%';

-- Saturday → following Saturday from created_at, noon
UPDATE public.requests
SET
  scheduled_time = (
    date_trunc('day', created_at AT TIME ZONE 'UTC')
    + ((6 - EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int + 7) % 7
       + CASE WHEN EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int = 6 THEN 7 ELSE 0 END) * interval '1 day'
    + interval '12 hours'
  ) AT TIME ZONE 'UTC',
  flexible_time  = (structured_data->>'deadline_text' ILIKE '%flexible%')
WHERE
  scheduled_time IS NULL
  AND structured_data IS NOT NULL
  AND structured_data->>'deadline_text' ILIKE 'saturday%';

-- Sunday → following Sunday from created_at, noon
UPDATE public.requests
SET
  scheduled_time = (
    date_trunc('day', created_at AT TIME ZONE 'UTC')
    + ((7 - EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int) % 7
       + CASE WHEN EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int = 0 THEN 7 ELSE 0 END) * interval '1 day'
    + interval '12 hours'
  ) AT TIME ZONE 'UTC',
  flexible_time  = (structured_data->>'deadline_text' ILIKE '%flexible%')
WHERE
  scheduled_time IS NULL
  AND structured_data IS NOT NULL
  AND structured_data->>'deadline_text' ILIKE 'sunday%';
