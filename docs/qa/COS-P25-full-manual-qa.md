# COS-P25 Full Manual QA Script

**Prompt ID:** COS-P25-FULL-MANUAL-QA-SCRIPT-AND-VERIFICATION  
**Branch:** master  
**Last commit:** ca338fb (COS-P25-CARD-DETAIL-FLIP)  
**Date:** 2026-05-23  
**Playwright suite:** 56/56 pass (specs 19–25)  
**TypeScript:** clean

---

## SECTION A — Setup / Test Environment

**Goal:** Confirm the app is running and both test users can access the dashboard.

1. Start the development server:
   ```
   npm run dev
   ```
   Wait until the terminal shows the server is ready (Turbopack ready message or similar).

2. Open a browser to `http://localhost:3000`.

3. Confirm the landing page loads without a blank screen and without console errors.  
   Open DevTools → Console. Confirm no red errors on page load.

4. Prepare two test accounts:
   - **User A (requester):** the account you will use to post requests.
   - **User B (helper/driver/participant):** a second account used to browse and respond.  
   Use separate browser profiles or incognito for User B.

5. Log in as User A. Navigate to `/dashboard`. Confirm:
   - Request input textarea is visible.
   - Existing request cards render (or feed shows empty state if no data).
   - No spinner stuck indefinitely.
   - No blocking modal prevents access to the input.

6. In a second browser profile, log in as User B. Navigate to `/dashboard`. Confirm:
   - Dashboard is usable.
   - No infinite redirect loop.

7. Confirm Supabase category support: create a `meal_meetup` request (see Section G). If the request posts without a database enum error, the enum is correct.

8. Clear any stale E2E test data if needed. The E2E suite uses `[E2E-*]` prefixed titles. Manual QA data can be identified by your own test titles and cleaned up via Supabase dashboard or the admin interface.

**Expected:**
- Both users reach `/dashboard` without errors.
- Request input is visible and interactive.
- No console errors blocking the page.

---

## SECTION B — Auth / Onboarding Basic Check

1. Open `http://localhost:3000` (landing page).

2. Click **Sign in** or **Get started**.

3. Enter User A credentials and complete sign-in.

4. Verify you land on `/dashboard` (not a broken redirect or 404).

5. Verify the onboarding welcome card (if shown) is a dismissible inline card, not a blocking modal that prevents typing in the request input.

6. Dismiss the onboarding card if shown. Confirm the request input textarea is accessible.

7. Click **Log out** (or navigate to the sign-out option if available).

8. Confirm you are redirected away from `/dashboard` (landing page or sign-in page).

9. Log in as User B. Repeat steps 3–5.

10. Confirm User B reaches `/dashboard` successfully.

**Expected:**
- Auth works for both users.
- Onboarding does not block request creation.
- No infinite loading spinners.
- No broken redirect after logout.

---

## SECTION C — Ride Request Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input textarea.

3. Type exactly:
   ```
   Need a ride to Target from my dorm tomorrow at 10
   ```

4. Click **Post Request** (or the submit button).

5. Wait for the confirm/details card to appear (up to 10 seconds).

6. If a **pickup location picker** appears:
   a. Type `Zachry Engineering Center` in the pickup input.
   b. Wait for suggestions to appear.
   c. Click the first suggestion.
   d. Confirm a location chip appears (location is locked in).

7. If a **dropoff location picker** appears:
   a. Type `Target` in the dropoff input.
   b. Wait for suggestions to appear.
   c. Click the first suggestion.
   d. Confirm a location chip appears.

8. Verify the time area shows a concrete selection. If time picker is shown:
   a. Click **Tomorrow**.
   b. Click **Specific time**.
   c. Select **10:00 AM**.
   d. Confirm the time summary updates to show `Tomorrow at 10:00 AM` or equivalent.

9. Verify the **Confirm** button is still **disabled** if payment has not been selected.

10. Locate the payment options. Verify the following appear:
    - **Split gas** (or equivalent ride payment option).
    Verify the following do **not** appear:
    - Everyone pays for themselves
    - I'll cover it / Host covers
    - Helper fee

11. Click **Split gas**.

12. Verify the payment summary updates to show `Split gas` or equivalent.

13. Verify the **Confirm** button is now **enabled**.

14. Click **Confirm** (or final post button).

15. Verify a success message appears:
    ```
    Request posted!
    ```
    or equivalent.

16. Locate the new ride card in the feed. Verify the **front card** shows:
    - Badge: **Rides**
    - Route: pickup location → Target
    - Time: Tomorrow at 10:00 AM (or equivalent)
    - Payment: Split gas
    - Seat count if shown

17. Click the **Details ▾** toggle on the card.

18. Verify the **detail panel** opens and shows:
    - Pickup location (Zachry Engineering Center or equivalent)
    - Dropoff location (Target)
    - Time row (🕐 with concrete time)
    - Payment row (💳 with Split gas)
    - Original request text if `description` is stored

19. Click **✕** (close button in detail panel) or click **Less ▴**.

20. Verify the detail panel closes.

21. Verify the front card still shows the time and payment after collapse.

**Negative checks:**
- Must not show `Meal & Social` wording anywhere on a ride card.
- Must not show `Everyone pays for themselves` in ride payment options.
- Must not show `Helper fee` unless explicitly applicable.
- Clicking the **Offer a ride** or **Request a seat** CTA must not accidentally expand or collapse the card.

---

## SECTION D — Ride Offer / Counter Flow

**Requires User A's ride request to be posted (from Section C).**

1. Keep User A's ride request visible on the dashboard.

2. In a second browser profile, log in as **User B**. Navigate to `/dashboard`.

3. Locate User A's ride request card. Verify the CTA button label is:
   - **Offer a ride** (if User A is a passenger) or **Request a seat** (if User A is a driver)  
   depending on the ride direction.

4. Click **Details ▾** on the card to expand it.

5. Verify the **request-card-primary-cta** button in the detail panel is visible with the same CTA label.

6. Click the CTA button (either in the footer or inside the detail panel).

7. Verify an **offer modal/dialog** appears.

8. Verify the modal title says **Offer a ride** (not "Offer to help").

9. Verify the textarea placeholder references driving or picking up (e.g., `I can pick you up` or similar).

10. In the message/price field, enter `8` (or the current offer amount field if shown).

11. Submit the offer.

12. Verify User B sees:
    ```
    Offer sent ✓
    ```
    or equivalent confirmation label on the card.

13. Switch back to **User A**. Navigate to `/dashboard` → **My Requests** tab.

14. Find the ride card. Verify it shows:
    ```
    1 pending offer
    ```
    or equivalent.

15. Click **View offers** on the card.

16. Verify the offer list shows User B's offer with the $8 amount.

17. Locate the **Counter** button (if supported). Click it.

18. Enter `10` as the counter amount.

19. Submit the counter.

20. Switch back to **User B**. Navigate to **My Offers** tab.

21. Find the offer card. Verify a counter label is visible:
    ```
    Counter from passenger
    ```
    or equivalent passenger-side wording.

22. Verify the counter amount `$10` is shown.

23. Verify **Accept counter** and **Decline counter** buttons are visible.

24. Click **Accept counter**.

25. Verify the final agreed price shows `$10`.

26. Verify no stale `$8` price overwrites the accepted `$10`.

**Negative checks:**
- User B must not see `You'll pay the helper` — that is requester perspective wording.
- User A must not see `You offered to drive` — that is helper perspective wording.
- Driver must not be able to accept their own offer.
- No double-accept or overbooking regression.

---

## SECTION E — Food Pickup Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input.

3. Type exactly:
   ```
   Anyone for Thai restaurant?
   ```

4. Click **Post Request**.

5. Wait for disambiguation choices to appear.

6. Click **Food pickup** (or the errand/pickup option).

7. Verify the confirm card now reflects a **food pickup / errand** flow — not "Meal & Social."

8. If a **store/location picker** appears:
   a. Type `Thai restaurant` or a specific restaurant name.
   b. Wait for suggestions.
   c. Select a result.

9. If a **task details** field appears:
   a. Enter: `Pick up prepaid Thai food order`

10. If time picker appears:
    a. Click **Tomorrow**.
    b. Click **Specific time**.
    c. Select **6:30 PM**.
    d. Verify time summary updates to `Tomorrow at 6:30 PM` or equivalent.

11. Verify the **Confirm** button is disabled before payment is selected.

12. Locate payment options. Verify the following appear:
    - `You'll reimburse actual cost` or `Reimburse cost` or equivalent reimbursement option.
    - `You'll pay a helper fee` or `Fixed amount` or equivalent.
    Verify the following do **not** appear:
    - Everyone pays for themselves
    - Split the bill
    - I'll cover it / Host covers

13. Select the reimbursement option.

14. Verify payment summary updates to use reimbursement/pickup wording.

15. Click **Confirm**.

16. Verify success message: `Request posted!`

17. Locate the new food pickup card. Verify **front card** shows:
    - Badge: **Errands** or **Food pickup**
    - Store or task reference
    - Concrete time (Tomorrow at 6:30 PM)
    - Payment/reimbursement summary

18. Click **Details ▾**.

19. Verify **detail panel** shows:
    - Errand type: `Food pickup`
    - Store: Thai restaurant name
    - Task: `Pick up prepaid Thai food order`
    - Time row (🕐 Tomorrow at 6:30 PM)
    - Payment row (💳 reimbursement wording)

20. Click **✕** to close details.

**Negative checks:**
- Must not show `Everyone pays for themselves`.
- Must not show `Split the bill`.
- Must not show `I'll cover it`.
- Must not say `Meal & Social`.
- Must not reference grocery list items like `milk and eggs`.

---

## SECTION F — Food Pickup Offer Flow

**Requires User A's food pickup request to be posted (from Section E).**

1. In User B's browser, navigate to `/dashboard`.

2. Locate User A's food pickup card.

3. Click **Details ▾** to expand it.

4. Verify the **detail panel** shows food pickup structured fields (store, task, reimbursement).

5. Verify the **primary CTA** button inside the detail panel says `I can help` or equivalent.

6. Click the CTA button.

7. Verify an offer modal appears.

8. Verify the modal placeholder references `pick` or picking up (e.g., `I can pick this up for you`).

9. If an amount field is shown, enter `5`.

10. Submit the offer.

11. Verify User B sees:
    ```
    Offer sent ✓
    ```

12. Switch back to **User A**. Navigate to **My Requests** tab.

13. Find the food pickup card. Verify it shows `1 pending offer` or equivalent.

14. Click **View offers**.

15. Verify the offer uses pickup-appropriate language (not `wants to join` or `offered to drive`).

16. Accept the offer.

17. Verify the accepted state shows correct price/terms.

**Negative checks:**
- Must not show `Everyone pays for themselves`.
- Must not show `wants to join`.
- Must not show `Meal & Social` wording.
- Must not show ride/driver wording.

---

## SECTION G — Meal & Social / Going Together Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input.

3. Type exactly:
   ```
   Anyone for Thai restaurant?
   ```

4. Click **Post Request**.

5. Wait for disambiguation choices to appear.

6. Click **Going together** (or the Meal & Social / social meetup option).

7. Verify the confirm card category label says `Meal & Social` or equivalent — not `Errands` or `Food pickup`.

8. If time picker appears:
   a. Click **Tomorrow**.
   b. Click **Specific time**.
   c. Select **6:00 PM**.
   d. Verify time summary updates to `Tomorrow at 6:00 PM` or equivalent.

9. Verify the **Confirm** button is disabled before cost plan is selected.

10. Locate payment/cost plan options. Verify the following appear:
    - `Everyone pays for themselves`
    - `Split the bill` (or equivalent group-split option)
    - `I'll cover it` or `Host covers` (if shown)
    Verify the following do **not** appear:
    - You'll reimburse actual cost
    - Helper fee
    - Split gas

11. Click **Everyone pays for themselves**.

12. Verify the cost plan summary updates.

13. Verify the title/summary on the confirm card says:
    ```
    Thai restaurant meetup
    ```
    or equivalent — not `Thai food pickup` or `Unclear request`.

14. Click **Confirm**.

15. Verify success message: `Request posted!`

16. Locate the new meal & social card. Verify **front card** shows:
    - Badge: **Meal & Social** (or equivalent category label)
    - Title: `Thai restaurant meetup` or equivalent
    - Time: Tomorrow at 6:00 PM
    - Cost plan: `Everyone pays for themselves`

17. Click **Details ▾**.

18. Verify **detail panel** shows:
    - Original request text: `Anyone for Thai restaurant?` (if stored)
    - Category: Meal & Social
    - Time row (🕐 Tomorrow at 6:00 PM)
    - Cost plan (💳 Everyone pays for themselves)
    - Cuisine / meal type fields if structured data was populated

19. Click **✕** to close details.

**Negative checks:**
- Must not show `food pickup` wording.
- Must not show `Helper fee` or `You'll pay the helper`.
- Must not show `They'll pay you` or `You can earn`.
- Must not show counter button on this card type.
- Title must not say `Unclear request`.

---

## SECTION H — Meal Participant / Express Interest Flow

**Requires User A's Meal & Social post to be live (from Section G).**

1. In User B's browser, navigate to `/dashboard`.

2. Locate User A's Thai restaurant meetup card.

3. Verify the CTA button label says:
   ```
   I'm interested
   ```
   or `Express interest` — not `I can help` or `Offer a ride`.

4. Click **Details ▾** on the card.

5. Verify the detail panel **does not show** a price input field.

6. Verify the detail panel **does not show** a counter button.

7. Verify the **primary CTA** inside the detail panel says `I'm interested` or equivalent.

8. Click the CTA (either footer button or detail panel CTA).

9. Verify an interest modal appears with title **Express interest** — not `Offer to help`.

10. Verify the modal **does not have** a price/amount field.

11. Submit the interest expression (message only or just confirm).

12. Verify User B sees:
    ```
    Offer sent ✓
    ```
    or equivalent — no price/monetary confirmation language.

13. Switch back to **User A**. Navigate to **My Requests** tab.

14. Find the meetup card. Verify it shows `1 pending offer` or equivalent (participant count).

15. Verify the inline offer row shows **Accept** and **Decline** buttons.

16. Verify the inline offer row does **not** show a **Counter** button.

**Negative checks:**
- Must not show any helper fee or payment amount in the offer modal.
- Must not show `wants to drive` or pickup wording.
- Must not show `You'll pay the helper`.
- Counter button must be completely absent for meal_meetup.

---

## SECTION I — Moving Help Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input.

3. Type exactly:
   ```
   Need help moving out Saturday
   ```

4. Click **Post Request**.

5. Wait for the confirm card.

6. If a **pickup / from location picker** appears:
   a. Type `Dorm` or `Hullabaloo Hall`.
   b. Select a suggestion.
   c. Confirm location chip appears.

7. If a **dropoff / to location picker** appears (not required if move_type is furniture):
   a. Type `Apartment` or a nearby address.
   b. Select a suggestion.

8. If a helpers count field appears, select or enter:
   ```
   2 helpers
   ```

9. If a time picker appears:
   a. Click **Later** or **This weekend** or **Saturday**.
   b. Click **Time range**.
   c. Set start time: **2:00 PM**.
   d. Set end time: **4:00 PM**.
   e. Verify summary shows the time range.

10. Verify the **Confirm** button is disabled before payment is selected.

11. Locate payment options. Select:
    - **Fixed amount** or equivalent helper compensation option.

12. If an amount field appears, enter:
    ```
    20
    ```

13. Verify payment summary updates to show `$20` or equivalent.

14. Click **Confirm**.

15. Verify success message: `Request posted!`

16. Locate the new moving card. Verify **front card** shows:
    - Badge: **Moving**
    - Location (from address if shown)
    - Time: Saturday or time range (2:00 PM–4:00 PM)
    - Payment: $20 or equivalent
    - Helpers count if shown

17. Click **Details ▾**.

18. Verify **detail panel** shows:
    - Type: `Moving out` (or equivalent)
    - Helpers: `2 needed`
    - Access type (Stairs only / Elevator access) if set
    - Time row (🕐 with date/time range)
    - Payment row (💳 $20)
    - Location row (📍 from address) if pickup_location is stored

19. Click **✕** to close details.

**Negative checks:**
- Must not show `Meal & Social` wording.
- Must not show `food pickup` wording.
- Must not show `Everyone pays for themselves` or `Split the bill`.

---

## SECTION J — Moving Offer Flow

**Requires User A's moving request to be posted (from Section I).**

1. In User B's browser, navigate to `/dashboard`.

2. Locate User A's moving card.

3. Click **Details ▾**.

4. Verify the detail panel shows moving-specific fields (type, helpers, location).

5. Click the CTA: **I can help** or equivalent.

6. Verify an offer modal appears.

7. Verify the modal placeholder references moving or truck (e.g., `I can help move` or `I have a truck`).

8. Submit the offer.

9. Verify User B sees:
   ```
   Offer sent ✓
   ```

10. Switch back to **User A**. Navigate to **My Requests** tab.

11. Find the moving card. Verify `1 pending offer` or equivalent.

12. Click **View offers**. Verify the offer wording references moving help — not pickup, not social, not ride.

13. Counter or accept if desired. Verify final terms are correct.

**Negative checks:**
- Must not show ride/driver wording.
- Must not show `wants to join` or social wording.
- Must not show food pickup wording.

---

## SECTION K — Peer Help Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input.

3. Type exactly:
   ```
   Need help with calc tonight
   ```

4. Click **Post Request**.

5. Wait for the confirm card.

6. If a **subject** field appears:
   a. Type `Calculus` or select from available options.

7. If a **help type** field appears:
   a. Click **Homework help**.

8. If a **format** field appears:
   a. Click **In-person** or **Online**.

9. If a time picker appears:
   a. Click **Today** or **Tomorrow**.
   b. Click **Specific time**.
   c. Select **8:00 PM**.
   d. Confirm time summary updates.

10. Verify the **Confirm** button is disabled before payment is selected.

11. Locate payment options. Select:
    - **Hourly** or **Fixed amount** or equivalent.

12. If an amount field appears, enter:
    ```
    15
    ```

13. Verify payment summary updates to `$15/hr` or `$15` or equivalent.

14. Click **Confirm**.

15. Verify success message: `Request posted!`

16. Locate the new peer help card. Verify **front card** shows:
    - Badge: **Peer Help** or equivalent
    - Subject reference (Calc / Calculus)
    - Time: Tonight at 8:00 PM or equivalent
    - Payment: $15 or $15/hr

17. Click **Details ▾**.

18. Verify **detail panel** shows:
    - Subject: `Calculus`
    - Format: `Homework help`
    - Mode: `In-person` or `Virtual / online`
    - Sessions: `One-time`
    - Time row (🕐 8:00 PM)
    - Payment row (💳 $15 or $15/hr)

19. Click **✕** to close details.

**Negative checks:**
- Must not show food pickup wording.
- Must not show ride wording.
- Must not show `Meal & Social` cost-sharing wording.

---

## SECTION L — Peer Help Offer Flow

**Requires User A's peer help request to be posted (from Section K).**

1. In User B's browser, navigate to `/dashboard`.

2. Locate User A's peer help card.

3. Click **Details ▾**.

4. Verify detail panel shows: subject, format, mode, sessions, time, payment.

5. Click **I can help** CTA.

6. Verify offer modal appears.

7. Verify the modal placeholder references coursework, helping, or meeting (e.g., `I can help with calc` or `I'm available to meet`).

8. Submit the offer.

9. Verify User B sees:
   ```
   Offer sent ✓
   ```

10. Switch to **User A**. Navigate to **My Requests** tab.

11. Find the peer help card. Verify `1 pending offer`.

12. Click **View offers**. Verify wording is peer-help appropriate.

13. Accept or counter. Verify final terms.

**Negative checks:**
- Must not show food pickup wording.
- Must not show `wants to join` or social wording.
- Must not show driver/ride wording.

---

## SECTION M — Borrow Flow

**User A must be logged in.**

1. Navigate to `/dashboard`.

2. Click inside the request input.

3. Type exactly:
   ```
   Can I borrow a calculator?
   ```

4. Click **Post Request**.

5. Wait for the confirm card.

6. If an **item** field appears:
   a. Enter or confirm: `Calculator` or `TI-84`

7. If a **duration** field appears:
   a. Enter: `2 days`

8. If a **return expectation** field appears:
   a. Enter: `Return by Friday`

9. If a location/pickup field appears, fill it in if required.

10. Verify the **Confirm** button is enabled **without** requiring payment selection (borrow is time-gate-exempt and payment is optional).

11. If payment options are shown, they are optional — do not select one to verify the button remains enabled.

12. Click **Confirm**.

13. Verify success message: `Request posted!`

14. Locate the new borrow card. Verify **front card** shows:
    - Badge: **Borrow**
    - Item: `calculator` or `TI-84`
    - Duration or return expectation if shown

15. Click **Details ▾**.

16. Verify **detail panel** shows:
    - Item: `Calculator` or `TI-84`
    - Duration: `2 days`
    - Return: `Return by Friday`

17. Click **✕** to close details.

**Negative checks:**
- Borrow must not require time selection — confirm button should be enabled without time.
- Must not show food/ride/social wording.
- Must not show helper fee as required.

---

## SECTION N — Borrow Offer Flow

**Requires User A's borrow request to be posted (from Section M).**

1. In User B's browser, navigate to `/dashboard`.

2. Locate User A's borrow card.

3. Click **Details ▾**.

4. Verify detail panel shows: item, duration, return expectation.

5. Click **I can help** or **Lend this** CTA.

6. Verify an offer modal appears.

7. Submit the offer to lend.

8. Verify User B sees:
   ```
   Offer sent ✓
   ```

9. Switch to **User A**. Navigate to **My Requests** tab.

10. Find the borrow card. Verify `1 pending offer`.

11. Click **View offers**. Verify the offer language is appropriate for lending — not ride, not social.

12. Accept. Verify final state.

**Negative checks:**
- Must not show ride/driver wording.
- Must not show `wants to join` or social wording.
- Must not show food pickup wording.

---

## SECTION O — Location Picker Check

1. Start a **ride request**:
   - Type: `Need a ride to Target tomorrow`
   - Click **Post Request**.

2. When the location picker (pickup or dropoff) appears, type:
   ```
   Thai
   ```

3. Verify suggestions appear (Google Places / campus place results) within 5 seconds.

4. Select a suggestion.

5. Verify the location chip appears (the field locks in with the selected location).

6. Verify the form does **not** immediately post — workflow continues to time/payment/confirmation.

7. Clear the field and type:
   ```
   Mexican
   ```

8. Verify new suggestions appear.

9. Select a result. Confirm location chip appears.

10. Clear and type:
    ```
    Walmart
    ```

11. Select a result. Confirm location chip appears.

12. Proceed through payment and confirm normally.

**Expected:**
- Each location selection fills the slot correctly.
- No premature post after selecting a location.
- Workflow continues normally to time → payment → confirm.

---

## SECTION P — Time Picker Check

**Test 1: Today + past time is rejected.**

1. Start any request that shows the time picker (e.g., errand or moving).

2. Click **Today**.

3. Click **Specific time**.

4. Select a time that is in the past (e.g., `12:00 AM` if it is past midnight).

5. Verify an error appears:
   ```
   Please select a time in the future
   ```
   or equivalent, and the **Confirm** button remains disabled.

6. Change to a time in the future.

7. Verify the error clears and the time summary updates.

**Test 2: Time range — end must be after start.**

1. Start a new request with the time picker.

2. Click **Tomorrow** (or any future date bucket).

3. Click **Time range**.

4. Set start time: `4:00 PM`.

5. Set end time: `3:00 PM` (before start).

6. Verify an error appears:
   ```
   End time must be after start time
   ```
   or equivalent.

7. Change end time to `5:00 PM`.

8. Verify error clears. Time summary shows `4:00 PM – 5:00 PM`.

**Test 3: Date alone does not complete the time gate.**

1. Start a new request.

2. Click **Tomorrow** (date bucket only).

3. Do NOT click any time mode (Specific time / Time range / Flexible).

4. Verify the **Confirm** button remains **disabled** — date alone is insufficient.

**Test 4: Later + date + Flexible completes time gate.**

1. Click **Later**.

2. Verify a date input appears.

3. Select a date more than 2 days in the future.

4. Click **Flexible**.

5. Verify time summary says `[date] · Flexible` or equivalent.

6. Verify the **Confirm** button unlocks (assuming payment and other gates are met).

**Expected:**
- No date-only posting.
- Past time is rejected with a clear error.
- Time range end must be after start.
- "Later" requires explicit date AND mode selection.
- Final card shows a concrete time label.

---

## SECTION Q — Payment UI Check

**Test 1: Food pickup — reimbursement options.**

1. Start a food pickup request (see Section E steps 1–11).

2. Reach the payment options.

3. Verify each option renders as a clickable button with visible text.

4. Click each option one at a time.

5. Verify the **selected state** changes visually (highlighted border, background, or ring).

6. If `Reimburse cost + helper fee` is selected and an amount field appears:
   a. Enter `0`.
   b. Verify the **Confirm** button can be enabled (if all other gates are met).
   c. Change the amount to `5`.
   d. Verify the payment summary updates to show `$5`.

**Test 2: Meal meetup — social-only options.**

1. Start a meal meetup request (see Section G steps 1–11).

2. Reach the cost plan options.

3. Verify only these options appear:
   - Everyone pays for themselves
   - Split the bill (or equivalent)
   - I'll cover it / Host covers (if shown)

4. Verify the following do **not** appear:
   - Reimburse cost
   - Helper fee
   - Split gas
   - Discuss in chat (if specific to rides)

**Test 3: Ride — ride-only options.**

1. Start a ride request (see Section C steps 1–11).

2. Reach the payment options.

3. Verify only ride-appropriate options appear:
   - Split gas
   - Fixed price per seat
   - Discuss in chat
   - Free (if offered)

4. Verify the following do **not** appear:
   - Everyone pays for themselves
   - Reimburse cost
   - Helper fee

**Expected:**
- Payment options are fully visible, clickable, and labeled correctly.
- Selected state is obvious.
- Summary updates immediately on selection.
- No cross-subflow options bleed through.

---

## SECTION R — Card Detail Flip / Expand Check

**Create or use existing cards from Sections C, E, G, I, K, M — one from each category:**
- Ride
- Food pickup (Errands)
- Meal & Social (meal_meetup)
- Moving
- Peer Help
- Borrow

**For each card, perform the following steps:**

1. Locate the card in the feed.

2. Verify the **front card** shows the minimum required:
   - Category badge
   - Title or route
   - Time (🕐) if applicable
   - Payment (💳) if applicable
   - Key quantity (seats, helpers) if applicable
   - Requester name/avatar if shown

3. Click **Details ▾** (the `request-card-toggle` button).

4. Verify the **detail panel** (`request-card-details`) opens.

5. Verify a **✕ close button** (`request-card-detail-close`) is visible in the top-right of the detail panel.

6. Verify:
   - If `description` (original text) is stored, the `request-card-original-text` element shows it in quotes.
   - Time row (`request-card-time`) shows the time if applicable.
   - Payment row (`request-card-payment`) shows payment info if applicable.
   - Location row (`request-card-location`) shows pickup/dropoff if applicable.

7. Verify category-specific structured fields:
   - **Ride:** luggage, meetup point, stops if available
   - **Food pickup:** type (Food pickup), store name, task details
   - **Meal & Social:** cuisine, meal type, group size if set
   - **Moving:** move type, helpers count, access type, heavy items flag
   - **Peer Help:** subject, help format, in-person/virtual, one-time/recurring
   - **Borrow:** item name, duration, return condition

8. If not the requester's own card: verify the **primary CTA button** (`request-card-primary-cta`) appears inside the detail panel with the correct label.

9. Click the CTA inside the detail panel. Verify:
   - The offer/interest modal opens.
   - The card does **not** accidentally collapse.

10. Dismiss the modal (Escape or Cancel).

11. Click **✕** to close the detail panel.

12. Verify the front card still shows its original time and payment.

13. Click **Details ▾** again. Verify it reopens (toggle works bidirectionally).

14. Click **Less ▴**. Verify it collapses.

**Keyboard accessibility check (one card):**

1. Tab to the **Details ▾** toggle button.

2. Verify `aria-expanded="false"` is set (inspect element or use DevTools → Accessibility panel).

3. Press **Space** to toggle.

4. Verify detail panel opens and `aria-expanded="true"` is set.

5. Press **Enter** to toggle again.

6. Verify detail panel closes and `aria-expanded="false"` is restored.

**Expected:**
- Details open and close reliably for all 6 category types.
- Front card content remains visible during expand.
- CTA works from inside the detail panel.
- CTA click does not accidentally collapse the panel.
- `aria-expanded` reflects state accurately.

---

## SECTION S — Report / Safety Flow

1. Open any request card that is **not your own**.

2. Click **Details ▾** to expand.

3. Look for a **Report** link in the card footer (bottom area, small text).

4. Click **Report**.

5. Verify no console crash.

6. If a reason selector appears, choose a reason (e.g., spam, inappropriate).

7. Submit the report.

8. Verify a confirmation message appears (e.g., "Reported" or success state).

9. Verify the detail panel is still open (or closes gracefully — no crash).

10. Return to the dashboard. Verify the card still renders normally.

11. If an admin report queue exists at `/admin` or equivalent, navigate there (log in as admin if required) and verify the report appears.

12. Submit a second report on the same item (if flow allows). Verify no crash or duplicate error.

**Expected:**
- Report flow completes without crash.
- Card detail panel does not break after reporting.
- User can navigate back to dashboard normally.

---

## SECTION T — Legal Pages

1. Navigate to `http://localhost:3000` (landing page).

2. Locate the **Terms** link (usually in the footer).

3. Click **Terms**.

4. Verify the Terms page loads (not a 404, not a blank page).

5. Verify the page contains peer-to-peer service language — not traditional marketplace/employment language.

6. Go back to the landing page.

7. Click **Privacy**.

8. Verify the Privacy page loads.

9. Go back to the landing page.

10. Click **Guidelines** or **Safety** if available.

11. Verify the page loads.

12. Repeat steps 2–11 using a **mobile viewport** (DevTools → Toggle device, or a real phone).

13. Verify links are tappable at mobile size (not too small or overlapping).

**Expected:**
- No broken legal links.
- Pages load without error.
- Peer-to-peer positioning is preserved in content.
- Mobile links are usable.

---

## SECTION U — Notifications Basic Check

1. As **User A**, create a new request (any category).

2. As **User B**, respond (offer, express interest, etc.).

3. As **User A**, check for a notification indicator (bell icon, badge, or notification area).

4. Verify a notification appears, OR — if the notification system is in foundation/passive state — verify no console crash occurs.

5. As **User A**, accept or counter User B's response.

6. As **User B**, check for a notification indicating the acceptance or counter.

7. Verify the notification (if present) links to the correct offer or request.

8. Verify the page does not crash when navigating to the notification.

**Expected:**
- Notification system does not break the app.
- If notifications are visible, they reference the correct request.
- No broken links from notifications.

---

## SECTION V — Admin / Analytics Basic Check

1. Navigate to the admin or analytics dashboard if one exists (e.g., `/admin`, `/analytics`, or a linked page from the dashboard).

2. Verify the page loads without error.

3. Verify basic metrics or event logs are visible (request count, offer count, or recent events).

4. In a separate tab, create a new request as User A.

5. Return to the admin/analytics page and refresh.

6. Verify no crash on refresh.

7. If event logs are visible, verify the new request created an event record.

8. If a report was submitted in Section S, verify it appears in the admin report queue.

**Expected:**
- Admin/analytics loads without crash.
- Metrics render.
- Submission of a new request does not break analytics.
- Report queue works if implemented.

---

## SECTION W — Mobile QA

**Use DevTools → Toggle device toolbar (or a real mobile device). Viewport: 390×844 (iPhone 14 equivalent) or similar.**

1. Open `/dashboard` in the mobile viewport.

2. Verify:
   - The request input textarea is visible and tappable.
   - No horizontal overflow (scroll left/right should not reveal content cut off).
   - Feed cards render without truncation issues.

3. Create a **Meal & Social** request (Section G steps 3–15 condensed):
   - Type: `Anyone for sushi?`
   - Choose Going together.
   - Select time.
   - Select cost plan.
   - Confirm.

4. Verify success and find the new card in the feed.

5. Create a **Food pickup** request (Section E steps 3–15 condensed):
   - Type: `Pick up my Chipotle order`
   - Choose Food pickup.
   - Fill store and task.
   - Select time and payment.
   - Confirm.

6. Find both cards. For each:
   a. Tap **Details ▾**.
   b. Verify the detail panel opens fully (not clipped, not overflowing beyond screen width).
   c. Verify text is readable (not too small or misaligned).
   d. Tap **✕** to close.

7. Tap a payment option during request creation. Verify:
   - Button is large enough to tap reliably.
   - Selected state is visible without zooming.

8. Open the time picker during a request. Verify:
   - Date bucket buttons are tappable.
   - Time mode buttons are tappable.
   - No keyboard overlaps or hides the time input.

9. In an expanded card, tap the **primary CTA** inside the detail panel. Verify:
   - The offer modal opens.
   - The input field is not blocked by the mobile keyboard.

10. Scroll the feed. Verify smooth scrolling and no layout breaks.

11. Verify **no horizontal overflow** on any screen (request input, cards, detail panels, modals).

**Expected:**
- All interactive elements are tappable at mobile size.
- Detail panel text is readable without zooming.
- No invisible buttons or truncated payment options.
- No keyboard obscures required inputs.

---

## SECTION X — Final Smoke Flow

**This is a sequential end-to-end check across three category flows.**

**Flow 1: Ride**

1. As User A, post a ride request (Section C abbreviated: `Need a ride to Target tomorrow at 2 PM`, fill location, select Split gas, confirm).
2. As User B, offer to drive ($10).
3. As User A, accept the offer.
4. Verify the card shows **Accepted** or agreed price state.
5. Refresh the page (`Ctrl+R`).
6. Verify the ride card still shows the correct category, route, time, payment, and accepted state after refresh.

**Flow 2: Meal & Social**

1. As User A, post a meal & social request (Section G abbreviated: `Anyone for sushi tonight?`, choose Going together, select Everyone pays for themselves, confirm).
2. As User B, express interest.
3. Verify:
   - No counter button appears on the meal card inline offer row.
   - No monetary language appears in the offer.
4. Verify the card still shows `Meal & Social` category and correct cost plan after refresh.

**Flow 3: Food Pickup**

1. As User A, post a food pickup request (Section E abbreviated: `Pick up my Chipotle`, choose Food pickup, fill store and task, select reimbursement, confirm).
2. As User B, offer to pick it up.
3. Verify the offer modal placeholder mentions `pick`.
4. Verify the accepted state (if accepted) shows correct reimbursement terms.
5. Refresh the page.
6. Verify the card still shows correct category, store, time, and payment.

**Open all three cards and check detail panels:**

1. Click **Details ▾** on the ride card.
2. Verify ride-specific detail fields.
3. Close.
4. Click **Details ▾** on the meal & social card.
5. Verify meal-specific detail fields (cuisine, cost plan).
6. Close.
7. Click **Details ▾** on the food pickup card.
8. Verify food-pickup-specific detail fields (store, task, reimbursement).
9. Close.

**Expected:**
- Core marketplace works end-to-end for all three category types.
- Data persists correctly after page refresh.
- No stale or cross-category wording appears.
- Detail panels open and close reliably for all cards.
- No broken state after sequential accept/counter operations.

---

## Quick Reference: Key Negative Checks by Category

| Category | Must NOT show |
|---|---|
| Ride | Everyone pays for themselves · Split the bill · Meal & Social · Helper fee |
| Food pickup | Everyone pays for themselves · Split the bill · Meal & Social · wants to join |
| Meal & Social | Helper fee · Reimburse cost · Split gas · pickup wording · counter button · You'll pay the helper |
| Moving | Meal & Social · food pickup · Everyone pays for themselves |
| Peer Help | Food pickup · ride wording · Meal & Social cost-sharing |
| Borrow | Helper fee (required) · time gate (required) · food/ride/social wording |

---

## Known Limitations (Non-Blocking for Beta)

- **Report queue UI:** The report flow (Section S) creates a DB record but a full admin report queue UI may not be fully built. Non-blocking.
- **Notification delivery:** Push notifications (Section U) are foundation-only. Real-time in-app notification rendering may be partial. Non-blocking.
- **Admin analytics page** (Section V): May be internal/partial. Non-blocking if user-facing flows are stable.
- **Mobile keyboard overlap:** On some mobile devices, the time picker or amount input may be partially obscured by the software keyboard. Scroll behavior should allow the user to reach inputs.

---

---

## SECTION Y — Card Flip UX Refinement (COS-P25-CARD-FLIP-UX-REFINEMENT)

**Goal:** Verify the enhanced expand/collapse UX: single-card-open enforcement, click-outside dismissal, front-face click-to-open, smooth animation, visual highlight, and mobile interaction.

### Y.1 — Only One Card Open at a Time

1. As User B on `/dashboard`, ensure at least two request cards are visible in the feed.
2. Click **Details ▾** (or anywhere in the front face) on the first card.
3. Confirm the first card expands (detail panel slides open with animation).
4. Without closing the first card, click **Details ▾** on a second card.
5. Confirm the **first card collapses** and the **second card expands** simultaneously.
6. Confirm only one card is ever open at a time — no two detail panels visible together.

**Negative check:** Opening card B must not leave card A partially open (partial max-height or lingering opacity).

---

### Y.2 — Click Outside Closes Card

1. Expand a card by clicking its **Details ▾** button.
2. Click somewhere on the page **outside** that card (e.g., the page header, an empty feed area, another card's *front face without expanding it*).
3. Confirm the expanded card collapses.
4. Confirm the card's front content (title, badges, CTA button) is still visible after collapse.

**Negative check:** Clicking inside the open card's detail panel must NOT close the card.

---

### Y.3 — Clicking Inside the Detail Panel Does Not Close

1. Expand a card.
2. Click on text content inside the detail panel (original description text, structured field labels, values).
3. Confirm the card remains open — the detail panel does not collapse.
4. Click the **✕ Close** button in the detail panel header.
5. Confirm the card collapses cleanly.

---

### Y.4 — Front-Face Click Opens the Card

1. Locate a collapsed card in the feed.
2. Click directly on the card's **title text**.
3. Confirm the card expands (detail panel slides open).
4. Collapse it by clicking the **Less ▴** toggle or **✕ Close**.
5. Click on the card's **summary text** (if visible).
6. Confirm it also expands.
7. Click on a **category badge** on the card.
8. Confirm it also expands.

**Negative check:** The cursor should show `pointer` (hand cursor) when hovering over the card front area.

---

### Y.5 — CTA Buttons Do Not Accidentally Expand

1. Locate a collapsed card for a request that User B has not yet offered on.
2. Click the **Offer / Help** CTA button (primary teal button at card bottom).
3. Confirm the **offer modal opens**.
4. Confirm the card's detail panel is **NOT open** (no detail panel visible while modal is shown).
5. Dismiss the modal (press Escape or click outside).
6. Confirm the card is still collapsed.

---

### Y.6 — Visual Highlight When Card Is Open

1. Note the card's border and background color when collapsed (dark background, subtle border).
2. Click to expand the card.
3. Confirm the card's border changes to blue (blue-500/25 tint) when expanded.
4. Confirm the background is slightly different (darker) than the collapsed state.
5. Collapse the card.
6. Confirm the card returns to its original border and background.

---

### Y.7 — Animation Smoothness

1. Click **Details ▾** to expand a card.
2. Observe that the detail panel **slides down smoothly** (max-height transition, not a jump or instant appear).
3. Observe that opacity transitions from transparent to opaque during the slide.
4. Click **Less ▴** or **✕ Close** to collapse.
5. Observe that the detail panel **slides back up** (reverse transition).
6. Confirm no layout jank or content flicker during either transition.

---

### Y.8 — Toggle Button State

1. On a collapsed card, locate the toggle button in the card footer.
2. Confirm it shows **"Details ▾"** and uses muted text color (slate-500).
3. Expand the card.
4. Confirm the button now shows **"Less ▴"** and uses blue text color.
5. Confirm the button has `aria-expanded="false"` when collapsed and `aria-expanded="true"` when expanded.
   (Check via DevTools → Elements → inspect the toggle button.)

---

### Y.9 — Keyboard Accessibility

1. Use **Tab** to navigate to a card's toggle button (or click it once to focus it).
2. Confirm the toggle button is focusable and shows a visible focus ring.
3. Press **Space** while the button is focused and collapsed.
4. Confirm the card expands.
5. Press **Space** again (button still focused).
6. Confirm the card collapses.
7. Press **Enter** to expand again.
8. Confirm the card expands.
9. Verify no other focus traps or unexpected behavior.

---

### Y.10 — Mobile Viewport (390×844)

1. Open DevTools → Device toolbar → set viewport to **iPhone 14 Pro** (390×844) or equivalent.
2. Reload `/dashboard`.
3. Confirm no horizontal scrollbar appears (no content overflows the viewport width).
4. Tap a card's front area to expand it.
5. Confirm the detail panel slides open and is fully readable.
6. Confirm the **✕ Close** button is visible and tappable within the detail panel header.
7. Confirm the **Offer / Help** CTA is still tappable at card bottom.
8. Tap outside the card (e.g., the page background) to close.
9. Confirm the card collapses.

**Negative check:** No text should overflow the card edges on mobile. No tappable element should be cut off.

---

### Y.11 — My Requests Tab

1. Switch to the **My Requests** tab.
2. Confirm the same expand/collapse behavior applies to the requester's own cards.
3. Expand one of your own cards.
4. Confirm the detail panel shows the original description text and structured fields.
5. Confirm the **Mark Complete** button (if visible) does not trigger expand when clicked.
6. Confirm the **View Offers** button (if visible) does not trigger expand when clicked.

**Negative check:** Clicking the **Mark Complete** or **View Offers** buttons must not open or close the detail panel.

---

### Y.12 — No Regression: Core Front-Card Content

1. With a card collapsed, confirm all of the following are visible:
   - Category badge (e.g., "Rides", "Peer Help")
   - Request title
   - Urgency or status badge
   - Time/schedule info (if applicable)
   - Payment/budget line (if applicable)
   - **Offer / Help** CTA button
2. Click to expand the card.
3. Confirm all of the above **remain visible** while expanded.
4. Collapse the card.
5. Confirm all of the above are still visible after collapse.

---

### Y.13 — Section Y Summary Checklist

Mark each item ✅ (pass) or ❌ (fail):

| Check | Result |
|---|---|
| Only one card open at a time | |
| Opening second card closes first | |
| Click outside collapses open card | |
| Click inside detail panel keeps card open | |
| Front-face click expands card | |
| CTA button does not expand card | |
| Visual border/bg highlight when expanded | |
| Smooth slide animation both ways | |
| Toggle shows "Details ▾" / "Less ▴" correctly | |
| aria-expanded reflects state | |
| Space / Enter keyboard toggle works | |
| No horizontal overflow on 390px mobile | |
| Close button visible on mobile | |
| My Requests: Mark Complete doesn't toggle card | |
| My Requests: View Offers doesn't toggle card | |
| Front-card content visible during and after expand | |

**All 16 checks must be ✅ for Section Y to pass.**

---

---

## SECTION Z — Front Card Information Hierarchy (COS-P25-FRONT-CARD-INFO-HIERARCHY-REDESIGN)

**Goal:** Verify that every request card front face shows the operationally important info (what, where, when, money, seats/helpers, role) immediately — without requiring the user to open details. Raw free-text must not dominate when structured data is available.

### Z.1 — Ride Card Scanability

1. Open `/dashboard`.
2. Create a ride request (or use an existing one): driver going from Zachry Engineering to Target, tomorrow, 2 seats, $5/seat.
3. Without opening the card, verify the front shows:
   - **Category badge:** Rides
   - **Route:** Zachry Engineering → Target (in the title or meta row)
   - **Time:** tomorrow reference (e.g., date or "Tomorrow")
   - **Payment:** $5 or $5/seat
   - **Seats:** "2 seats" or "2 of 2 seats left"
4. Open the detail panel.
5. Verify detail still shows location, time, payment, and original description.
6. Close.
7. Confirm front card is unchanged after close.

**Negative check:** Route, time, and payment must NOT require opening the detail panel to see.

---

### Z.2 — Thai Food Pickup Scanability

1. Create or find a food pickup errand: store = "Thai Palace", task = "Prepaid order #142", payment = "Reimburse actual cost".
2. Without opening the card, verify front shows:
   - **Category badge:** Errands (or Food pickup chip)
   - **Store:** Thai Palace
   - **Payment:** Reimburse actual cost (or "Reimburse")
3. Verify front does NOT show: "Everyone pays for themselves", "Split the bill", "Host covers".
4. Open details.
5. Verify original request and task details appear.
6. Close.

---

### Z.3 — Thai Restaurant Meetup Scanability

1. Post or seed a meal & social request for a Thai restaurant meetup with cost plan "Everyone pays for themselves".
2. Without opening the card, verify front shows:
   - **Category badge:** Meal & Social
   - **Title:** Thai restaurant meetup (or equivalent resolved title)
   - **Cost plan:** Everyone pays for themselves
3. Verify front does NOT show: "helper fee", "Reimburse", "Food pickup", "Unclear request".
4. Open details.
5. Verify original description appears there, not as the dominant front content.
6. Close.

---

### Z.4 — Moving Help Scanability

1. Post or seed a moving help request: 2 helpers, from Ion CS, $20.
2. Without opening the card, verify front shows:
   - **Category badge:** Moving Help
   - **Helpers count:** "2 helpers needed" (or similar chip)
   - **Payment:** $20 (or "$20 fixed")
   - **Location:** Ion CS or the from address if available
3. Open details.
4. Verify full structured details (move type, access type, helpers, payment) appear.
5. Close.

---

### Z.5 — Peer Help Scanability

1. Post or seed a peer help request: subject = Calc II, format = In person, payment = $15/hr.
2. Without opening the card, verify front shows:
   - **Category badge:** Peer Help
   - **Subject chip:** Calc II (📚)
   - **Format chip:** In person (💻)
   - **Payment:** $15 or $15/hr
3. Open details.
4. Verify session type, help format, and original description appear.
5. Close.

---

### Z.6 — Borrow Request Scanability

1. Post or seed a borrow request: item = TI-84 graphing calculator, duration = 2 days.
2. Without opening the card, verify front shows:
   - **Category badge:** Borrow
   - **Item chip:** TI-84 graphing calculator (📦)
   - **Duration chip:** 2 days (📅)
3. Open details.
4. Verify return condition and full borrow details appear.
5. Close.

---

### Z.7 — Offer State: Your Price Appears on Front Card

1. As User B, offer on an open request that has a price (e.g., $15 offered on a $20 request).
2. View the card as User B (in the All Open tab or after refresh).
3. Verify the front card shows:
   - **Role badge:** "Offered ✓" or equivalent status (yellow chip)
4. As User A, accept User B's offer.
5. As User B, refresh the page.
6. Verify the front card now shows:
   - **Role badge:** "✓ Accepted" (green chip)
   - **Final price chip:** "Final: $15" (or whatever the agreed price was) — visible without opening details.

**Negative check:** Final price must NOT be hidden only inside the detail panel.

---

### Z.8 — Meal/Social Cards: No Marketplace Pricing Language

1. Create or view a Meal & Social card.
2. As another user, express interest (click "I'm interested").
3. View the card as the other user.
4. Verify front card shows:
   - Interested status or "Offered ✓" indicator
5. Verify front card does NOT show:
   - "helper fee"
   - "Reimburse"
   - Counter amount (e.g., "Counter: $X")
   - "You offered $X" pricing chip

---

### Z.9 — Open Each Card and Verify Detail Side Still Works

1. For each card type (ride, meal, food pickup, moving, peer help, borrow):
   a. Open the detail panel.
   b. Verify original request text appears (in `request-card-original-text`).
   c. Verify structured detail fields are still present.
   d. Close the card.
   e. Confirm front card info is unchanged.

---

### Z.10 — Mobile Scanability (390×844)

1. Open DevTools → set viewport to 390×844.
2. Navigate to `/dashboard`.
3. For each visible card type, WITHOUT opening details, verify:
   - Title is readable.
   - Time chip (if present) is readable.
   - Payment chip is readable.
   - Subject/item/helpers chip (if applicable) is readable.
   - No horizontal overflow (no scrollbar appears).
4. Open one card.
5. Verify close button is visible and tappable.
6. Verify detail content is scrollable and readable on 390px.

---

### Z.11 — Raw Text Does Not Dominate

1. Find any request card that has both structured data AND a raw description.
2. Verify the card front does NOT show a multi-line raw paragraph as the main content.
3. Raw original text should be ABSENT from the front, or shown only as a single muted line (if no summary is available).
4. Verify the raw text IS visible inside the detail panel when opened.

---

### Z.12 — Section Z Summary Checklist

Mark each ✅ (pass) or ❌ (fail):

| Check | Result |
|---|---|
| Ride: route/time/payment/seats visible without opening details | |
| Food pickup: store/time/payment visible without opening details | |
| Meal meetup: title/time/cost plan visible without opening details | |
| Moving: helpers/location/payment visible without opening details | |
| Peer help: subject/format/payment visible without opening details | |
| Borrow: item/duration visible without opening details | |
| Role badge shows "My request" for requester | |
| Role badge shows "Offered ✓" for helper who offered | |
| Role badge shows "✓ Accepted" after offer acceptance | |
| Final agreed price shows on front card (not just in details) | |
| Meal/social front card has no marketplace pricing language | |
| No raw text paragraph dominating front card when structured data exists | |
| Detail panel still shows full structured info after front card changes | |
| No horizontal overflow on 390px mobile | |
| All category front cards readable on mobile without opening details | |

**All 15 checks must be ✅ for Section Z to pass.**

---

*Generated for COS-P25-FULL-MANUAL-QA-SCRIPT-AND-VERIFICATION · 2026-05-23*  
*Section Y appended for COS-P25-CARD-FLIP-UX-REFINEMENT · 2026-05-23*  
*Section Z appended for COS-P25-FRONT-CARD-INFO-HIERARCHY-REDESIGN · 2026-05-23*  
*Section AA appended for COS-P25-FIRST-LOGIN-TERMS-ACCEPTANCE-AND-QA-BYPASS · 2026-05-23*

---

## SECTION AA — First-login Terms Acceptance & QA Bypass

**Goal:** Confirm the terms gate blocks new users from marketplace actions, accepted users can proceed freely, and QA bypass flags work as documented.

**Prerequisite:** Two test accounts ready (User A = no prior acceptance, User B = has accepted). You may need to clear `terms_accepted` from `auth.users.user_metadata` via Supabase Dashboard → Authentication → Users → Edit User → delete the `terms_accepted` key from the JSON metadata.

---

### AA-1: New user sees terms modal on "Post request"

1. Sign in as User A (no prior acceptance).
2. Navigate to `/dashboard`.
3. Type any request in the text area and click **Post request**.
4. **Expect:** A modal titled "Before you continue" appears over the page.
5. Confirm the modal contains:
   - The text "CampusOS is a peer-to-peer coordination platform. Payments are handled directly between students during beta — CampusOS does not process or guarantee any payments."
   - A "Terms of Service" link (opens `/terms` in a new tab).
   - A "Privacy Policy" link (opens `/privacy` in a new tab).
   - A "Community Guidelines" link (opens `/guidelines` in a new tab).
   - A checkbox: "I agree to the Terms of Service, Privacy Policy, and Community Guidelines."
   - An **Accept & Continue** button (disabled until checkbox is checked).
   - A **Cancel** button.
6. Confirm the request did NOT submit (no parsing spinner, no confirm card).

| Check | Result |
|---|---|
| Modal appears immediately on Post request | |
| Title is "Before you continue" | |
| Beta payment disclaimer present | |
| Three links present (Terms / Privacy / Guidelines) | |
| Accept button disabled before checkbox | |
| Cancel button present | |
| Request did not submit | |

---

### AA-2: Dismiss without accepting shows blocked state

1. With the modal open (from AA-1), click **Cancel**.
2. **Expect:** The modal closes.
3. The "Please accept the Terms to post or respond." message is visible below the action buttons area of the modal (it is always visible — not a toast).
4. The request was not submitted.

| Check | Result |
|---|---|
| Modal closes on Cancel | |
| Request not submitted | |

---

### AA-3: Accepting terms allows posting to proceed

1. Open the terms modal again (Post request with User A).
2. Check the checkbox.
3. Click **Accept & Continue**.
4. **Expect:** The modal closes and the request is submitted normally (parsing spinner, then confirm card).
5. Reload the page and try posting again — the modal should NOT appear this time.

| Check | Result |
|---|---|
| Accept button enables after checkbox | |
| Modal closes after acceptance | |
| Request proceeds to confirm card | |
| Second post does not show modal | |

---

### AA-4: New user sees terms modal on "I can help" (offer path)

1. Sign in as User A (clear `terms_accepted` again if needed).
2. Navigate to `/dashboard`.
3. Find any open request from another user in the feed.
4. Click **I can help** (or **Request a seat** / **Express interest**).
5. **Expect:** Terms modal appears; offer modal does NOT open behind it.

| Check | Result |
|---|---|
| Terms modal appears on I can help | |
| Offer modal not shown behind terms | |

---

### AA-5: Accepting terms from offer path proceeds to offer modal

1. With the terms modal open from AA-4, check the checkbox and click **Accept & Continue**.
2. **Expect:** Terms modal closes; offer modal opens for the same request immediately.

| Check | Result |
|---|---|
| Offer modal opens after acceptance from offer path | |

---

### AA-6: Accepted user can post and offer without terms modal

1. Sign in as User B (has accepted terms, or use User A after AA-3).
2. Post a new request.
3. **Expect:** No terms modal; request goes directly to parsing.
4. Click **I can help** on another request.
5. **Expect:** Offer modal opens directly; no terms modal.

| Check | Result |
|---|---|
| Post request bypasses terms modal for accepted user | |
| I can help bypasses terms modal for accepted user | |

---

### AA-7: QA bypass user skips gate without accepting

**Requires:** Admin access to Supabase Dashboard → Authentication → Users → Edit User.

1. For a test user, add this JSON to their `user_metadata` in Supabase:
   ```json
   {
     "qa_bypass": {
       "bypass_terms_acceptance": true,
       "is_active": true,
       "expires_at": "2027-01-01T00:00:00.000Z",
       "reason": "manual QA tester"
     }
   }
   ```
2. Sign in as that user (do NOT set `terms_accepted`).
3. Post a request and click **I can help**.
4. **Expect:** No terms modal in either case.

| Check | Result |
|---|---|
| Post request bypasses terms modal for bypass user | |
| I can help bypasses terms modal for bypass user | |

---

### AA-8: Expired or inactive bypass does NOT skip gate

1. Change the `qa_bypass` for the same user to have `"is_active": false` (or `"expires_at"` in the past).
2. Reload and try posting.
3. **Expect:** Terms modal appears.

| Check | Result |
|---|---|
| Expired bypass shows terms modal | |
| Inactive bypass shows terms modal | |

---

### AA-9: Future SQL migration files are present (schema review)

1. Confirm these migration files exist in the repo (no need to apply them):
   - `supabase/migrations/026_terms_acceptance.sql`
   - `supabase/migrations/027_qa_bypass.sql`
2. Open `026_terms_acceptance.sql` and confirm it creates `user_terms_acceptances` with columns: `user_id`, `terms_version`, `privacy_version`, `guidelines_version`, `accepted_at`.
3. Open `027_qa_bypass.sql` and confirm it creates `qa_bypass_users` with `bypass_terms_acceptance`, `is_active`, `expires_at`, and the `get_my_bypass_flags()` RPC.

| Check | Result |
|---|---|
| Migration 026 file present and correct columns | |
| Migration 027 file present with RPC definition | |

---

**All 25 checks must be ✅ for Section AA to pass.**


---

## Section AC — First Login Guided Tour

**Feature:** COS-P25-FIRST-LOGIN-GUIDED-TOUR  
**Tour version:** `campusos-first-login-tour-v1`  
**Implementation:** `app/components/FirstLoginGate.tsx`, `app/components/FirstLoginTour.tsx`, `lib/tour.ts`

---

### AC-1: Terms gate precedes tour (new user flow)

1. Create a new test user with no terms acceptance and no tour state (or use an existing test user after calling `cleanupTermsAcceptance` and `clearTourState` on it).
2. Log in as that user.
3. Navigate to `/dashboard`.
4. **Expect:** Terms modal (`[data-testid="terms-modal"]`) appears automatically — NOT triggered by a post action.
5. **Expect:** Guided tour (`[data-testid="first-login-tour"]`) is NOT visible.
6. Check the checkbox (`[data-testid="terms-checkbox"]`).
7. Click **Accept & Continue** (`[data-testid="terms-accept-btn"]`).
8. **Expect:** Terms modal closes.
9. **Expect:** Guided tour appears immediately.
10. **Expect:** Step title contains "CampusOS helps students coordinate real campus help".

| Check | Result |
|---|---|
| Terms modal appears on dashboard load (proactive, not action-gated) | |
| Tour not visible before terms accepted | |
| Tour appears after terms accepted | |
| Step 1 title correct | |

---

### AC-2: Tour navigation (Next / Back / progress)

1. Set up a user with accepted terms and no tour state.
2. Log in and navigate to `/dashboard`.
3. Tour appears automatically.
4. **Expect:** Progress indicator shows "1 of 10".
5. **Expect:** Back button is NOT visible on step 1.
6. Click **Next**.
7. **Expect:** Step title is "Rides". Progress shows "2 of 10".
8. Click **Next**.
9. **Expect:** Step title is "Pickups & errands". Progress shows "3 of 10".
10. Click **Back**.
11. **Expect:** Step title returns to "Rides". Progress shows "2 of 10".

| Check | Result |
|---|---|
| Progress indicator shows "1 of 10" on first step | |
| Back button hidden on step 1 | |
| Next advances to Rides step | |
| Next advances to Pickups & errands step | |
| Back returns to Rides | |

---

### AC-3: Continue through all 10 steps

1. Continue from AC-2. Navigate through all remaining steps with **Next**.
2. Verify step titles appear in order:
   - Step 1: Welcome / CampusOS helps students…
   - Step 2: Rides
   - Step 3: Pickups & errands
   - Step 4: Moving help
   - Step 5: Peer help
   - Step 6: Borrow
   - Step 7: Meal & Social
   - Step 8: Clear details before posting
   - Step 9: Trust and safety
   - Step 10: You are ready
3. On step 10, **Expect:** **Start using CampusOS** button is visible (`[data-testid="tour-finish"]`) instead of Next.

| Check | Result |
|---|---|
| All 10 step titles present and correct | |
| Finish button visible on step 10 | |
| Next button absent on step 10 | |

---

### AC-4: Legal and positioning wording

During any tour session, verify:

1. Text contains: "peer-to-peer coordination"
2. Text contains: "Payments are external during beta"
3. Text contains: "Not a transportation provider" (or equivalent note on Rides step)
4. Text does NOT contain: "CampusOS provides rides"
5. Text does NOT contain: "CampusOS employs"
6. Text does NOT contain: "CampusOS processes payments"

| Check | Result |
|---|---|
| "peer-to-peer coordination" present | |
| "Payments are external during beta" present | |
| Forbidden wording absent | |

---

### AC-5: Skip stores state and suppresses tour

1. Set up a user with accepted terms and no tour state.
2. Log in and navigate to `/dashboard`. Tour appears.
3. Click **Skip tour**.
4. **Expect:** Tour closes immediately.
5. Check user_metadata in Supabase: `tour_state.skipped_at` must be non-null.
6. Refresh the page.
7. **Expect:** Tour does NOT reappear.
8. Log out and log back in.
9. Navigate to `/dashboard`.
10. **Expect:** Tour does NOT reappear.

| Check | Result |
|---|---|
| Tour closes on Skip | |
| `skipped_at` is set in user_metadata | |
| Tour absent on page refresh | |
| Tour absent after logout/login | |

---

### AC-6: Finish stores state and suppresses tour

1. Set up a fresh user with accepted terms and no tour state.
2. Log in and navigate to `/dashboard`. Tour appears.
3. Click through all 10 steps with Next.
4. On step 10, click **Start using CampusOS**.
5. **Expect:** Tour closes.
6. Check user_metadata: `tour_state.completed_at` must be non-null, `skipped_at` null.
7. Refresh the page.
8. **Expect:** Tour does NOT reappear.

| Check | Result |
|---|---|
| Tour closes on Finish | |
| `completed_at` is set, `skipped_at` null | |
| Tour absent on refresh | |

---

### AC-7: QA bypass suppresses tour

1. Insert a row in `qa_bypass_users` for the test user with `bypass_guided_tour = true`, `is_active = true`, `expires_at` in the future (or null).
   ```sql
   INSERT INTO public.qa_bypass_users (email, bypass_guided_tour, is_active, reason)
   VALUES ('testuser@example.com', true, true, 'AC-7 manual QA');
   ```
2. Ensure the user has accepted terms but has NO completed/skipped tour state.
3. Log in and navigate to `/dashboard`.
4. **Expect:** Tour does NOT appear.
5. **Expect:** Dashboard and request input are usable.

| Check | Result |
|---|---|
| Tour suppressed with active bypass_guided_tour | |
| Dashboard usable without tour | |

---

### AC-8: Expired or inactive bypass does NOT suppress tour

1. Change the `qa_bypass_users` row from AC-7 to have `expires_at` in the past (e.g., yesterday).
2. Clear the user's `tour_state` (or use a fresh user with no tour state).
3. Navigate to `/dashboard`.
4. **Expect:** Tour appears (expired bypass ignored).
5. Set `is_active = false` instead (and `expires_at` back to future).
6. Repeat navigation.
7. **Expect:** Tour appears (inactive bypass ignored).

| Check | Result |
|---|---|
| Expired bypass → tour appears | |
| Inactive bypass → tour appears | |

---

### AC-9: Tour does not block posting after completion/skip

1. Use a user with accepted terms and completed or skipped tour state.
2. Navigate to `/dashboard`.
3. **Expect:** Tour does NOT appear.
4. Type a request in the input: `Need a ride to Target from my dorm tomorrow at 10`
5. Click **Post request**.
6. **Expect:** Normal request flow starts (confirm card or workflow gate, no tour).
7. **Expect:** Tour does not reappear during posting.

| Check | Result |
|---|---|
| No tour modal during posting after completion | |
| Normal posting flow unaffected | |

---

### AC-10: Mobile layout

1. Open DevTools → device toolbar → set viewport to 390×844 (iPhone 14 equivalent).
2. Set up user with accepted terms, no tour state.
3. Navigate to `/dashboard`.
4. **Expect:** Tour appears.
5. **Expect:** No horizontal scroll bar.
6. **Expect:** Next, Back, and Skip buttons all visible and tappable.
7. Click through at least 3 steps.
8. **Expect:** Step body text is readable (no overflow).
9. Click Skip.
10. **Expect:** Tour closes, dashboard usable.

| Check | Result |
|---|---|
| Tour appears on mobile viewport | |
| No horizontal overflow | |
| All buttons visible/tappable | |
| Text readable | |
| Dashboard usable after skip | |

---

### AC-11: Migration file present (schema review)

1. Confirm the file exists: `supabase/migrations/029_user_onboarding_state.sql`
2. Open it and confirm it creates `user_onboarding_state` with columns: `user_id`, `tour_version`, `completed_at`, `skipped_at`, `last_seen_step`.
3. Confirm RLS policies for `SELECT`, `INSERT`, `UPDATE` are defined.

| Check | Result |
|---|---|
| Migration 029 file present with correct schema | |
| RLS policies defined | |

---

**All checks in AC-1 through AC-11 must be ✅ for Section AC to pass.**

---

## Section AD — Ride intent routing, seat inference, location gating, confirm-gate messaging

**Prompt IDs:** COS-P25-RIDE-INTENT-WALMART-LOCATION-SEATS-CONFIRM-HOTFIX · COS-P25-POST-WALMART-RIDE-HOTFIX-QA-AND-FIXES

---

### AD-1: "I need a ride to Walmart" routes to Rides

1. Go to `/dashboard`.
2. Submit: `I need a ride to Walmart along with my friend`
3. **Expect:** Confirm card appears with Category = **Rides** (not Errands).
4. **Expect:** Title contains "Walmart" or "ride"-related wording.
5. **Expect:** Errands category label is NOT shown.

| Check | Result |
|---|---|
| Category = Rides | |
| Title is ride-related | |
| Errands label absent | |

---

### AD-2: "along with my friend" infers 2 seats

1. Submit: `I need a ride to Walmart along with my friend`
2. **Expect:** Confirm card shows **Seats needed: 2**.

| Check | Result |
|---|---|
| "Seats needed" row visible | |
| Value is 2 | |

---

### AD-3: Confirm button disabled until both locations selected

1. Submit the Walmart ride request (no time selected).
2. **Expect:** Confirm button is disabled immediately.
3. Select only the pickup location.
4. **Expect:** Confirm button still disabled (dropoff missing).
5. Select the dropoff location.
6. **Expect:** Confirm button moves toward enabled once time and payment are also filled.

| Check | Result |
|---|---|
| Disabled before locations | |
| Disabled after only pickup | |

---

### AD-4: Confirm-gate message lists specific missing fields

1. Submit the Walmart ride request (no time, no locations, no payment).
2. **Expect:** Below the disabled Confirm button, the gate message lists specific items such as:
   - "Choose a time"
   - "Select a pickup location"
   - "Choose a specific Walmart dropoff"
   - "Choose a payment method"
3. **Expect:** The message does NOT read only: *"Add the missing details above to post"*

| Check | Result |
|---|---|
| Gate message not generic only | |
| Mentions time / pickup / dropoff / payment | |

---

### AD-5: Ride confirm card does not show errand questions

1. Submit: `I need a ride to Walmart along with my friend`
2. **Expect:** The confirm card does NOT show "What type of errand?" or "What should they pick up or do?"

| Check | Result |
|---|---|
| No errand_type question shown | |
| No task_details question shown | |

---

### AD-6: Category and title are consistent

1. Submit the Walmart ride request.
2. **Expect:** Both the Category row ("Rides") and the Title row describe a ride — no mismatch like "Errands" + "Ride to Walmart".

| Check | Result |
|---|---|
| Category and title both ride-related | |

---

### AD-7: Food pickup regression — routes to Errands

1. Submit: `Can someone pick up food from McDonald's?`
2. **Expect:** Confirm card shows Category = **Errands**.
3. **Expect:** A pickup location picker is shown (not ride route pickers).

| Check | Result |
|---|---|
| Category = Errands | |
| Location picker shows for errand | |

---

### AD-8: Grocery errand regression — routes to Errands

1. Submit: `Can someone grab milk from HEB?`
2. **Expect:** Confirm card shows Category = **Errands**.
3. **Expect:** Rides category label is NOT shown.

| Check | Result |
|---|---|
| Category = Errands | |
| Rides label absent | |

---

### AD-9: Full ride flow — confirm enables after all fields

1. Submit: `I need a ride to Walmart along with my friend`
2. Select **Today** + **Flexible** time.
3. Select a pickup location via LocationPicker.
4. Select a Walmart dropoff location via LocationPicker.
5. Select a payment method (e.g., Split gas).
6. **Expect:** Confirm button becomes enabled.
7. Confirm the post.
8. **Expect:** Post appears in the feed.

| Check | Result |
|---|---|
| Confirm enabled after all fields | |
| Post appears in feed | |

---

### AD-10: Restaurant ride — explicit ride intent beats restaurant heuristic

1. Submit: `Looking for a ride to Thai restaurant`
2. **Expect:** Confirm card shows Category = **Rides** (not Meal & Social or Errands).
3. **Expect:** Ride route pickers (pickup + dropoff) appear, NOT a social meetup UI.
4. **Expect:** Meal & Social category label is NOT shown.

| Check | Result |
|---|---|
| Category = Rides | |
| Pickup + dropoff pickers visible | |
| Meal & Social label absent | |

---

### AD-11: Edit/cancel/retry — deterministic, no state leak

1. Submit: `I need a ride to Walmart along with my friend`
2. **Expect:** Confirm card shows Rides, Seats needed: 2.
3. Click **Edit** to return to the textarea.
4. Submit the same text again.
5. **Expect:** Confirm card shows Rides again (not Errands), Seats needed: 2.
6. **Expect:** Confirm button is still disabled (prior payment/location selections do not leak).
7. **Expect:** No errand follow-up questions appear.

| Check | Result |
|---|---|
| Second submission still routes to Rides | |
| Seats needed: 2 on second submission | |
| Confirm disabled (no state leak from first) | |
| No errand questions | |

---

**All checks in AD-1 through AD-11 must be ✅ for Section AD to pass.**

---

## Section AE: Campus Scoping / Tenant Isolation

**Prompt ID:** COS-P25-CAMPUS-SCOPING-TENANT-ISOLATION  
**Migration:** 030_campus_scoping.sql  
**Spec:** e2e/tests/31-campus-scoping-tenant-isolation.spec.ts (10 tests)

---

### AE-1: TAMU feed isolation

1. Log in as a TAMU user.
2. Open the dashboard.
3. **Expect:** Campus badge shows "Texas A&M University".
4. **Expect:** Only TAMU requests appear in the "All Open" feed.
5. Confirm no UT Austin requests are visible.

| Check | Result |
|---|---|
| Campus badge shows Texas A&M University | |
| Feed contains TAMU requests | |
| No UT Austin requests visible | |

---

### AE-2: UT Austin feed isolation

1. Log in as a UT Austin user.
2. Open the dashboard.
3. **Expect:** Campus badge shows "University of Texas at Austin".
4. **Expect:** Only UT Austin requests appear in the feed.
5. Confirm no TAMU requests are visible.

| Check | Result |
|---|---|
| Campus badge shows UT Austin | |
| Feed contains UT Austin requests | |
| No TAMU requests visible | |

---

### AE-3: Cross-campus direct URL blocked

1. As a TAMU user, copy the request ID of a TAMU request from the feed.
2. Log in as a UT Austin user in a different browser/session.
3. Attempt to query that TAMU request ID directly (e.g., via DevTools → `supabase.from('requests').select().eq('id', tamuRequestId)`).
4. **Expect:** 0 rows returned. RLS filters the result.

| Check | Result |
|---|---|
| Cross-campus ID query returns 0 rows | |
| No request details leaked | |

---

### AE-4: Cross-campus offer blocked server-side

1. As a UT Austin user, obtain the ID of a TAMU request (e.g., through an admin or test setup).
2. Call `submit_offer_safe` with that request ID.
3. **Expect:** Response is `{ ok: false, error: "This request is not available at your campus" }`.

| Check | Result |
|---|---|
| submit_offer_safe returns ok=false | |
| Error message references campus | |

---

### AE-5: New request campus assignment — TAMU

1. Log in as a TAMU user.
2. Create a new request through the normal UI flow.
3. After posting, inspect the row in the DB (admin/SQL editor): `SELECT campus_id FROM requests WHERE title = '...'`.
4. **Expect:** `campus_id` matches the TAMU campus UUID.

| Check | Result |
|---|---|
| Request rows has campus_id = TAMU UUID | |
| campus_id was not set by client (trigger assigned it) | |

---

### AE-6: New request campus assignment — UT Austin

1. Log in as a UT Austin user.
2. Create a new request through the normal UI flow.
3. Inspect the DB row.
4. **Expect:** `campus_id` matches the UT Austin campus UUID.

| Check | Result |
|---|---|
| Request row has campus_id = UT Austin UUID | |

---

### AE-7: Spoofed campus_id is rejected by server trigger

1. As a TAMU user, open DevTools and run:
   `supabase.from('requests').insert({ requester_id: user.id, category: 'peer_help', title: 'spoof test', urgency: 'medium', campus_id: '<ut-austin-campus-id>' })`
2. **Expect:** The insert succeeds (trigger does not raise), but the saved row has `campus_id = TAMU UUID`.
3. The client-provided `campus_id` for UT Austin is silently overwritten by the BEFORE INSERT trigger.

| Check | Result |
|---|---|
| Insert succeeds (no hard error) | |
| Saved row has TAMU campus_id, not the spoofed UT Austin value | |

---

### AE-8: Existing request workflow still works

1. Log in as any valid user.
2. Create a peer help request through the normal UI flow (time, payment, post).
3. **Expect:** Request appears in the campus-scoped feed.
4. **Expect:** No regression in time/payment/location gates.

| Check | Result |
|---|---|
| Request creation succeeds end-to-end | |
| Request visible in campus feed | |
| No time/payment regression | |

---

**All checks in AE-1 through AE-8 must be ✅ for Section AE to pass.**

---

## Section AF — Admin RBAC and Ops Dashboard

**Feature:** DB-driven admin roles replace hardcoded email lists. `/dashboard/admin` is gated by `admin_role` on the `profiles` table (`'user'` | `'campus_admin'` | `'global_admin'`). Global admins see platform-wide data; campus admins see only their campus.

---

### AF-1: Non-admin access is blocked

1. Log in as a regular user (any account without admin rights).
2. Navigate directly to `/dashboard/admin`.
3. **Expect:** Immediately redirected to `/dashboard`.
4. **Expect:** Admin link does not appear in the sidebar.

| Check | Result |
|---|---|
| Redirect to /dashboard occurs | |
| Admin link absent from sidebar | |

---

### AF-2: Global admin access and role badge

1. Log in as a global admin (`anandmsundaram@gmail.com`, `campusosapp@gmail.com`, or `valsgum@gmail.com`).
2. Navigate to `/dashboard/admin`.
3. **Expect:** Page loads with "Admin Dashboard" heading.
4. **Expect:** "Global Admin" badge visible in the header.
5. **Expect:** "Platform-wide view — all campuses" subheading text.

| Check | Result |
|---|---|
| Page loads without redirect | |
| "Global Admin" badge visible | |
| Platform-wide subheading shown | |

---

### AF-3: Global admin — system health metrics

1. On `/dashboard/admin` as global admin.
2. **Expect:** Health metrics grid shows Total Users, Total Requests, Total Rides, Offers Made, Active Rides, Tasks Completed.
3. Each metric shows a non-negative integer.

| Check | Result |
|---|---|
| All 6 metric cards visible | |
| Values are non-negative integers | |

---

### AF-4: Global admin — campus filter

1. On `/dashboard/admin` as global admin.
2. **Expect:** Campus filter row appears with "All" and per-campus links.
3. Click a campus name (e.g., "Texas A&M").
4. **Expect:** URL changes to `?campus=<uuid>` and page reloads with "Filtered: Texas A&M" subheading.
5. Click "All".
6. **Expect:** URL returns to `/dashboard/admin` with no campus param.

| Check | Result |
|---|---|
| Campus filter row visible | |
| Clicking campus appends ?campus= | |
| Subheading updates to "Filtered: <campus>" | |
| Clicking All removes campus filter | |

---

### AF-5: Global admin — onboarding funnel and engagement

1. On `/dashboard/admin` as global admin.
2. **Expect:** "Onboarding Funnel" section visible with 4 steps (last 7 days).
3. **Expect:** "Engagement Events" section visible with 6 event counts.

| Check | Result |
|---|---|
| Funnel section visible | |
| Engagement section visible | |
| Step values are non-negative integers | |

---

### AF-6: Global admin — requests, users, audit, reports sections

1. On `/dashboard/admin` as global admin.
2. **Expect:** "Recent Requests" section with table columns: Category, Title, Status, Requester, Campus, When.
3. **Expect:** "Recent Users" section with table columns: Name, Role, Campus, Rating, Joined.
4. **Expect:** "Audit Log" section with table columns: Event, Actor, Request, When.
5. **Expect:** "Pending Reports" section visible (may show empty state if no reports).

| Check | Result |
|---|---|
| Recent Requests section visible | |
| Requests table has Campus column | |
| Recent Users section visible | |
| Users table has Campus column | |
| Audit Log section visible | |
| Pending Reports section visible | |

---

### AF-7: Campus admin access and role badge

1. In Supabase dashboard, set a test user's `admin_role` to `campus_admin`.
2. Log in as that user.
3. Navigate to `/dashboard/admin`.
4. **Expect:** Page loads without redirect.
5. **Expect:** "Campus Admin" badge visible.
6. **Expect:** Subheading says "Scoped to: <campus name>".

| Check | Result |
|---|---|
| Page loads without redirect | |
| "Campus Admin" badge visible | |
| Scoped subheading visible | |

---

### AF-8: Campus admin — no analytics funnel, no campus filter

1. On `/dashboard/admin` as campus admin.
2. **Expect:** Campus filter row is NOT visible.
3. **Expect:** "Onboarding Funnel" section is NOT visible (RLS blocks analytics_events).
4. **Expect:** "Engagement Events" section is NOT visible.
5. **Expect:** "Recent Requests", "Recent Users", "Audit Log", "Pending Reports" sections ARE visible.

| Check | Result |
|---|---|
| Campus filter absent | |
| Onboarding Funnel absent | |
| Engagement Events absent | |
| Recent Requests visible | |
| Recent Users visible | |
| Audit Log visible | |
| Pending Reports visible | |

---

### AF-9: Campus admin data isolation

1. On `/dashboard/admin` as campus admin.
2. **Expect:** Recent Requests shows only requests from the admin's campus.
3. **Expect:** Recent Users shows only users from the admin's campus.
4. **Expect:** No Campus column appears in Requests or Users tables (scoped, no need to disambiguate).

| Check | Result |
|---|---|
| Requests show only own campus | |
| Users show only own campus | |
| Campus column absent from tables | |

---

### AF-10: Admin link in sidebar

1. Log in as any admin (`campus_admin` or `global_admin`).
2. Navigate to `/dashboard`.
3. **Expect:** "Admin" link visible in the sidebar navigation.
4. Log in as a regular user.
5. **Expect:** "Admin" link NOT visible in the sidebar.

| Check | Result |
|---|---|
| Admin link visible for admin user | |
| Admin link absent for regular user | |

---

**All checks in AF-1 through AF-10 must be ✅ for Section AF to pass.**

---

## Section AG — Counter Visibility and Student App Shell Polish

Tests that each party in the counter-offer flow sees exactly the right CTAs and
status labels, that unrelated users cannot see private counter controls, and that
the app shell is free of duplicate action areas.

**Automated coverage:** `e2e/tests/33-counter-visibility-student-app-shell-polish.spec.ts` (11 tests)

---

### AG-1: Needs-action banner — pending offer (requester view)

1. Log in as User A. Create any open request.
2. Log in as User B on the same campus. Submit an offer on User A's request.
3. Log back in as User A and navigate to `/dashboard`.
4. **Expect:** A yellow/orange "needs your response" banner is visible above the tabs (`data-testid="needs-action-banner"`).
5. Accept or decline the offer.
6. **Expect:** Banner disappears.

| Check | Result |
|---|---|
| Banner appears when offer is pending | |
| Banner disappears after requester responds | |

---

### AG-2: Needs-action banner — counter pending (helper view)

1. Continue from AG-1 setup, or re-seed: User A has countered User B's offer.
2. Log in as User B (helper) and navigate to `/dashboard`.
3. **Expect:** The needs-action banner is visible — User B must respond to the counter.
4. **Expect:** Banner text references their offer needing response (not a generic message).

| Check | Result |
|---|---|
| Banner visible for helper after requester counters | |

---

### AG-3: Requester NOT shown banner while waiting for helper

1. User A counters User B's offer (offer status = `countered`).
2. Log back in as User A and navigate to `/dashboard`.
3. **Expect:** The needs-action banner is NOT visible — User A already acted (countered) and is now waiting.

| Check | Result |
|---|---|
| Banner absent for requester after they countered | |

---

### AG-4: Helper sees counter CTA in My Offers tab

1. With a `countered` offer in place (User A countered User B's offer):
2. Log in as User B. Go to `/dashboard` → My Offers tab.
3. **Expect:** The offer card shows the requester's counter amount highlighted in orange.
4. **Expect:** "Accept" (`accept-counter-btn`) and "Decline" (`decline-counter-btn`) buttons are visible.
5. **Expect:** No "I can help" CTA or unrelated actions appear on this card.

| Check | Result |
|---|---|
| Counter amount highlighted in orange | |
| Accept button visible | |
| Decline button visible | |
| No unrelated CTAs | |

---

### AG-5: Helper sees counter CTA on standalone My Offers page

1. Same `countered` offer setup.
2. Log in as User B. Navigate directly to `/dashboard/offers`.
3. **Expect:** The same orange counter section and Accept / Decline buttons appear.
4. **Expect:** Clicking "Accept counter" removes the CTA buttons and transitions the offer to accepted.

| Check | Result |
|---|---|
| Counter section visible at /dashboard/offers | |
| Accept/Decline buttons visible | |
| Clicking Accept removes CTA and shows accepted state | |

---

### AG-6: Requester sees "Counter sent ✓" (waiting state)

1. User A counters User B's offer.
2. Log in as User A. Go to `/dashboard` → My Requests tab.
3. **Expect:** The inline offer row shows "Counter sent ✓" (`data-testid="counter-sent-status"`).
4. **Expect:** No accept/decline buttons shown for User A on this row (they already acted).

| Check | Result |
|---|---|
| "Counter sent ✓" label visible | |
| No accept/decline buttons for requester | |

---

### AG-7: Unrelated user has no private counter CTAs

1. Log in as User C (same campus, unrelated to the offer).
2. Navigate to `/dashboard`.
3. **Expect:** User C cannot see `accept-counter-btn` or `decline-counter-btn` anywhere on the page.
4. **Expect:** User C can see the request in the open feed (it is open), but with no counter controls.

| Check | Result |
|---|---|
| No accept-counter-btn visible | |
| No decline-counter-btn visible | |
| Request card is visible in open feed | |

---

### AG-8: Cross-campus isolation

1. Log in as User C but set their campus to a different campus than the request's campus.
2. Navigate to `/dashboard`.
3. **Expect:** The request does not appear in User C's feed at all.

| Check | Result |
|---|---|
| Request absent from cross-campus feed | |

---

### AG-9: No duplicate request-posting CTA

1. Log in as any user. Navigate to `/dashboard`.
2. **Expect:** The request-posting textarea appears exactly once in the main content area.
3. **Expect:** The sidebar navigation does NOT contain a request-posting textarea or "Post" button.

| Check | Result |
|---|---|
| Textarea appears once in main content | |
| Sidebar has no duplicate "Post" CTA | |

---

### AG-10: Counter decline flow

1. With a `countered` offer in place.
2. Log in as User B (helper). Go to `/dashboard/offers` or My Offers tab.
3. Click "Decline".
4. **Expect:** The offer card transitions to a declined/rejected state.
5. **Expect:** User A (requester) receives a notification that the counter was declined.

| Check | Result |
|---|---|
| Offer shows rejected state after decline | |
| Requester notified of decline | |

---

**All checks in AG-1 through AG-10 must be ✅ for Section AG to pass.**

---

## SECTION AH — Request Scope Guardrails

**Prompt ID:** COS-P25-REQUEST-SCOPE-GUARDRAILS  
**Goal:** Confirm that out-of-scope requests are blocked at the client layer, the API layer, and the database layer. Practical campus-help requests pass through unaffected.

**Blocked message:** *"CampusOS is for practical campus help like rides, pickups, errands, moving, and quick paid favors. This request is outside the current beta scope."*

---

### AH-1: Dating request blocked

1. Log in as any user. Navigate to `/dashboard`.
2. Type `Can I get a date?` into the request textarea.
3. Click "Post request".
4. **Expect:** A red error banner appears immediately with the blocked message.
5. **Expect:** No confirm card or parser card appears.
6. **Expect:** No request record is created in the database.

| Check | Result |
|---|---|
| Error banner visible with scope-blocked message | |
| No confirm/disambiguation card shown | |
| No DB record created | |

---

### AH-2: Dating advice blocked

1. Type `I need dating advice` into the request textarea and submit.
2. **Expect:** Same blocked message. No confirm card.

| Check | Result |
|---|---|
| Error banner visible | |
| No confirm card | |

---

### AH-3: "Be my date" phrasing blocked

1. Type `I need someone to be my date tonight` and submit.
2. **Expect:** Blocked.

| Check | Result |
|---|---|
| Error banner visible | |

---

### AH-4: Ride with "date" destination — ALLOWED

1. Type `I need a ride to my date tonight` and submit.
2. **Expect:** NO scope-error banner appears.
3. **Expect:** Parser proceeds and shows the confirm card (or disambiguation card) as normal.

| Check | Result |
|---|---|
| No scope error shown | |
| Confirm/disambiguation card appears | |

---

### AH-5: Pickup for a date — ALLOWED

1. Type `Can someone pick up flowers for my date?` and submit.
2. **Expect:** NO scope-error banner. Parser proceeds normally.

| Check | Result |
|---|---|
| No scope error shown | |
| Confirm/disambiguation card appears | |

---

### AH-6: Homework cheating blocked

1. Type `Can someone do my homework?` and submit.
2. **Expect:** Blocked.

| Check | Result |
|---|---|
| Error banner visible | |

---

### AH-7: Alcohol purchase blocked

1. Type `Can someone buy alcohol for me?` and submit.
2. **Expect:** Blocked.

| Check | Result |
|---|---|
| Error banner visible | |

---

### AH-8: Vape purchase blocked

1. Type `Can someone buy a vape for me?` and submit.
2. **Expect:** Blocked.

| Check | Result |
|---|---|
| Error banner visible | |

---

### AH-9: Existing ride flow not regressed

1. Type a normal ride request (`Need a ride from campus to Houston Friday 9am`) and submit.
2. **Expect:** Parser proceeds, confirm card appears, request posts successfully.

| Check | Result |
|---|---|
| No scope error | |
| Confirm card appears | |
| Request posted successfully | |

---

### AH-10: Existing errand flow not regressed

1. Type `Can someone pick up my package from the mailroom?` and submit.
2. **Expect:** Parser proceeds normally, confirm card appears.

| Check | Result |
|---|---|
| No scope error | |
| Confirm card appears | |

---

### AH-11: API bypass returns 422

1. Using curl or Postman (or browser DevTools), POST directly to `/api/parse-request`:
   ```json
   { "text": "Can someone do my homework?" }
   ```
2. **Expect:** HTTP 422 response with `{ "error": "OUT_OF_SCOPE", "reason": "..." }`.

| Check | Result |
|---|---|
| 422 status returned | |
| Body contains error: "OUT_OF_SCOPE" | |

---

**All checks in AH-1 through AH-11 must be ✅ for Section AH to pass.**

---

## Section AI — User Blocking and Abuse Safety

Tests the full blocking lifecycle: blocking a user, blocked state in the UI,
managing blocked users at `/dashboard/blocked`, unblocking, server-side offer
guard, and admin safety event audit trail.

**Automated coverage:** `e2e/tests/36-user-blocking-abuse-safety.spec.ts` (15 tests)

---

### AI-1: Sidebar "Blocked Users" link

1. Log in as any verified student. Navigate to `/dashboard`.
2. **Expect:** "Blocked Users" entry is visible in the left sidebar navigation.
3. Click it.
4. **Expect:** Navigates to `/dashboard/blocked`.

| Check | Result |
|---|---|
| Link visible in sidebar | |
| Navigates to /dashboard/blocked | |

---

### AI-2: Empty blocked users page

1. Navigate to `/dashboard/blocked` as a user with no active blocks.
2. **Expect:** Page renders with heading "Blocked Users" and empty-state message "No blocked users".

| Check | Result |
|---|---|
| Heading visible | |
| Empty-state message shown | |

---

### AI-3: Block modal from request card

1. Navigate to `/dashboard` as a non-owner of any request.
2. Locate a request card from another user.
3. Click "Block" in the card footer.
4. **Expect:** BlockModal opens showing the user's display name and a reason dropdown.

| Check | Result |
|---|---|
| Block button visible for non-owner | |
| Modal opens on click | |
| Reason dropdown visible | |

---

### AI-4: Block requires a reason

1. Open the BlockModal (see AI-3).
2. **Expect:** "Block user" submit button is disabled.
3. Select a reason from the dropdown.
4. **Expect:** Submit button becomes enabled.

| Check | Result |
|---|---|
| Submit disabled without reason | |
| Submit enabled after reason selected | |

---

### AI-5: Successful block shows success state

1. Open BlockModal, select a reason, click "Block user".
2. **Expect:** Modal transitions to success state showing "User blocked" message and a "Done" button.
3. Click "Done".
4. **Expect:** Modal closes.

| Check | Result |
|---|---|
| Success state shown after submit | |
| "Done" button visible in success state | |
| Modal closes on "Done" | |

---

### AI-6: Block button hidden for already-blocked user

1. Block a user (see AI-5).
2. Navigate back to the request feed.
3. Locate another request from the same requester you just blocked.
4. **Expect:** No "Block" button appears in the card footer for that requester.

| Check | Result |
|---|---|
| Block button absent for blocked user | |

---

### AI-7: Blocked user appears in /dashboard/blocked

1. After blocking a user, navigate to `/dashboard/blocked`.
2. **Expect:** A row appears with the blocked user's name (or "Unknown user") and the reason.
3. An "Unblock" button is visible on the row.

| Check | Result |
|---|---|
| Row appears for blocked user | |
| Reason text shown | |
| Unblock button visible | |

---

### AI-8: Unblock flow — requires reason

1. On `/dashboard/blocked`, click "Unblock" on a blocked user row.
2. **Expect:** UnblockModal opens.
3. **Expect:** "Confirm unblock" button is disabled.
4. Select a reason.
5. **Expect:** Button becomes enabled.

| Check | Result |
|---|---|
| UnblockModal opens | |
| Submit disabled without reason | |
| Submit enabled after reason selected | |

---

### AI-9: Unblock removes user from blocked list

1. Complete the unblock flow (reason selected → "Confirm unblock" clicked).
2. **Expect:** Modal closes and the unblocked user's row disappears from the list.
3. **Expect:** If no other blocks, empty-state message reappears.

| Check | Result |
|---|---|
| Row removed after unblock | |
| Empty state shown if no blocks remain | |

---

### AI-10: Blocked helper offer shows "Blocked" label

1. As the requester, block a helper who has already submitted an offer on your request.
2. Navigate to "My Requests" tab.
3. Find your request and expand the offer section.
4. **Expect:** The blocked helper's offer row shows "Blocked" in italic text instead of Accept / Decline / Counter buttons.

| Check | Result |
|---|---|
| "Blocked" label replaces CTAs | |
| Accept/Decline/Counter absent for blocked helper | |

---

### AI-11: Server-side guard prevents blocked helper from offering

1. User A blocks User B.
2. As User B, navigate to the dashboard. User A's request is still visible in the feed.
3. Click "I can help" (or equivalent CTA) on User A's request.
4. Submit the offer form.
5. **Expect:** An error message appears: "You cannot offer on this request" (or similar blocked message).

| Check | Result |
|---|---|
| Request still visible to blocked helper | |
| Offer submission returns error | |
| Error text references being blocked | |

---

### AI-12: Admin safety events section is visible

1. Log in as a campus admin or global admin.
2. Navigate to `/dashboard/admin`.
3. **Expect:** "Safety events" section is visible on the page.

| Check | Result |
|---|---|
| Safety events section visible | |

---

### AI-13: Block event in admin safety events

1. Perform a block via the UI (see AI-5).
2. As an admin, navigate to `/dashboard/admin`.
3. Find the Safety Events section.
4. **Expect:** A "block" event row appears showing the actor, the target, and the reason.

| Check | Result |
|---|---|
| Block event row visible | |
| Event type badge shows "block" | |
| Actor and target names shown | |

---

### AI-14: Unblock event in admin safety events

1. Perform an unblock via the UI (see AI-9).
2. As an admin, navigate to `/dashboard/admin`.
3. Find the Safety Events section.
4. **Expect:** An "unblock" event row appears.

| Check | Result |
|---|---|
| Unblock event row visible | |
| Event type badge shows "unblock" | |

---

### AI-15: Campus admin sees only own campus safety events

1. Log in as a campus admin (e.g., TAMU admin).
2. Navigate to `/dashboard/admin`.
3. **Expect:** Safety Events only shows events from TAMU campus (not other campuses).
4. Log in as global admin.
5. **Expect:** Safety Events shows all events across all campuses.

| Check | Result |
|---|---|
| Campus admin scoped to own campus | |
| Global admin sees all campuses | |

---

**All checks in AI-1 through AI-15 must be ✅ for Section AI to pass.**
