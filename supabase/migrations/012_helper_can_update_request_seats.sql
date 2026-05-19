-- Allow a helper who has an offer on a request to update seats_filled and status.
-- Needed so that when a helper accepts a counter-offer, they can decrement available seats.
create policy "requests: helper with offer can update seats and status"
  on public.requests for update
  to authenticated
  using (
    exists (
      select 1 from public.request_offers
      where request_offers.request_id = requests.id
        and request_offers.helper_id = auth.uid()
    )
  )
  with check (true);
