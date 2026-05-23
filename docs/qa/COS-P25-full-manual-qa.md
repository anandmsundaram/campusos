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

*Generated for COS-P25-FULL-MANUAL-QA-SCRIPT-AND-VERIFICATION · 2026-05-23*  
*Section Y appended for COS-P25-CARD-FLIP-UX-REFINEMENT · 2026-05-23*
