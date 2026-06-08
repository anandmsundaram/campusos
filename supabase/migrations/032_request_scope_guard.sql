-- 032_request_scope_guard.sql
-- DB-level BEFORE INSERT trigger that blocks out-of-scope requests.
-- Client and API layers run the same deterministic checks first; this is
-- defense-in-depth so API bypass cannot create prohibited records.

create or replace function public.enforce_request_scope()
returns trigger
language plpgsql
as $$
declare
  hay text := lower(coalesce(new.description, '') || ' ' || coalesce(new.title, ''));
begin
  -- 1. Academic cheating — hard block
  if hay ~* '\m(do|write|complete|finish|submit)\s+(my|the)\s+(homework|assignment|essay|paper|exam|test|quiz)\M'
     or hay ~* '\mcheat\s+on\s+(my|the)\M'
     or hay ~* '\mtake\s+my\s+(exam|test|quiz|midterm|final)\M'
     or hay ~* '\m(homework|exam|test|assignment)\s+answers?\M' then
    raise exception 'OUT_OF_SCOPE'
      using hint = 'Academic cheating assistance is not available on CampusOS.';
  end if;

  -- 2. Illegal / regulated purchases — hard block
  if hay ~* '\m(buy|get|purchase|pick\s+up|grab|order|score|procure)\M'
     and hay ~* '\m(alcohol|beer|wine|vodka|liquor|spirits|booze|whiskey|tequila|rum|drugs|weed|marijuana|cannabis|vape|vapes|vaping|cigarettes?|tobacco|cocaine|heroin|meth|weapon|weapons|firearm|firearms|ammunition|ammo)\M' then
    raise exception 'OUT_OF_SCOPE'
      using hint = 'Purchasing regulated or illegal items is not available on CampusOS.';
  end if;

  -- 3. Dating / social — skip if practical service keyword present
  if hay ~* '\m(ride|rides|errand|errands|pick\s*up|pickup|grocer|moving|carry|deliver|borrow)\M' then
    return new;
  end if;

  if hay ~* '\mget\s+a\s+date\M'
     or hay ~* '\mfind\s+(me\s+)?a?\s*date\M'
     or hay ~* '\mbe\s+(my|a)\s+date\M'
     or hay ~* '\mdating\s+advice\M'
     or hay ~* '\m(relationship|love|romantic)\s+advice\M'
     or hay ~* '\mhook\s*up\M'
     or hay ~* '\mfind\s+(me\s+)?a\s+(girl|boy)(friend)?\M' then
    raise exception 'OUT_OF_SCOPE'
      using hint = 'Dating and social matching are not available in the current beta.';
  end if;

  return new;
end;
$$;

drop trigger if exists request_scope_guard on public.requests;

create trigger request_scope_guard
  before insert on public.requests
  for each row
  execute function public.enforce_request_scope();
