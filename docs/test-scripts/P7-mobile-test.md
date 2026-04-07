# P7 — Mobile Officer Experience Test Script

**Device:** Your phone (iOS or Android), browser or PWA.  
**Account:** An officer/employee account on the Acme Security workspace.  
**Manager window:** Keep a laptop browser open as manager to verify server-side changes.

---

## Setup

1. Open the CoAIleague URL on your phone's browser.
2. Log in as an officer (not manager) account.
3. Allow location permissions when prompted — GPS clock-in requires them.
4. For best results, add the site to your home screen (Share → Add to Home Screen on iOS; "Install App" on Android) to get the near-PWA experience.

---

## Test 1 — GPS Clock-In

**Goal:** Officer clocks in with GPS coordinates recorded.

1. Navigate to **Time Tracking** (or the Clock In button on the home dashboard).
2. Tap **Clock In**.
3. If the browser asks for location permission, tap **Allow**.
4. You should see a confirmation: "Clocked in — GPS recorded" (or similar).
5. On the laptop manager window: navigate to **Workforce → Active Officers** and confirm the officer shows as clocked in with a location dot on the map (if GPS map is enabled).
6. Check the time entry in **Admin → Time Entries**: latitude and longitude fields should be populated.

**Pass:** Time entry created with lat/lng and officer shows active on manager dashboard.  
**Fail:** If location is denied, the system should still allow clock-in but mark GPS as unavailable (not block the action).

---

## Test 2 — GPS Clock-In Duplicate Prevention

**Goal:** Tapping Clock In twice does not create two time entries.

1. Clock in as in Test 1.
2. Navigate away, come back, and tap **Clock In** again.
3. The app should show "You are already clocked in" or disable the Clock In button.
4. Check time entries on the manager window — only one open entry should exist.

**Pass:** Only one open time entry, no duplicate created.

---

## Test 3 — Clock-Out

**Goal:** Officer clocks out and the time entry closes.

1. From the clocked-in state, tap **Clock Out**.
2. Confirm the screen shows total time worked (e.g., "Shift complete — 3h 24m").
3. On the manager window, the officer should disappear from the Active Officers list.
4. The time entry should now have both `clockInTime` and `clockOutTime` populated.

**Pass:** Time entry closed, duration calculated, no longer showing as active.

---

## Test 4 — Overnight Shift Handling

**Goal:** Clock-in before midnight, clock-out after midnight — single entry spans the day boundary correctly.

1. If testing live, clock in at 11:45 PM and out at 12:30 AM the next day.
2. If simulating, ask a manager to manually enter a time entry spanning midnight.
3. Check the time entry: `clockInTime` should be Day 1, `clockOutTime` should be Day 2.
4. Duration should be 45 minutes (not 23h 15m, not negative).
5. The entry should appear on the **correct** payroll period — whichever day the shift started.

**Pass:** Duration is correct, no negative or overflowed hours.

---

## Test 5 — View My Schedule (mobile)

**Goal:** Schedule page is usable on a phone-size screen.

1. Navigate to **My Schedule**.
2. Confirm shifts display in a vertical list (not a cramped horizontal calendar that doesn't scroll).
3. Tap a shift to see its details: site name, address, start/end time, post orders.
4. Pinch-zoom or scroll should work without layout breaking.

**Pass:** Schedule is readable and tappable on mobile screen width.

---

## Test 6 — Shift Notification (Real-Time)

**Goal:** When manager assigns a shift while you have the app open, it appears instantly.

1. Have the schedule page open on your phone.
2. On the laptop manager window, assign a new shift to this officer.
3. On the phone, the new shift should appear within 3 seconds via the WebSocket push.

**Pass:** Schedule updates without pulling down to refresh.

---

## Test 7 — Submit an Incident Report from Mobile

**Goal:** Officer can file a report from the field without needing a desktop.

1. Navigate to **Reports → New Incident Report** (or look for a "+" button on the field tab).
2. Fill in: type, description, location (type it or use current GPS location).
3. Optionally attach a photo (camera upload from phone).
4. Tap Submit.
5. On the manager window, the incident should appear in **RMS → Incidents** immediately.

**Pass:** Incident saved and visible to manager with no desktop required.

---

## Test 8 — Daily Activity Report (DAR)

**Goal:** Officer submits end-of-shift DAR from phone.

1. Navigate to **Reports → Daily Activity Report**.
2. Complete the required fields (patrol summary, events, status).
3. Tap Submit.
4. Manager window: confirm DAR appears in **RMS → Daily Reports** with the correct officer and date.

**Pass:** DAR submitted and visible to management.

---

## Test 9 — Panic Button (Safety)

**Goal:** Panic button triggers alert to all online managers instantly.

> **WARNING:** This will send a live alert. Coordinate with a manager in advance.

1. Navigate to the safety section (look for a shield icon or "SOS" button).
2. Hold the panic button for 3 seconds to trigger (accidental press protection).
3. On the manager window: a panic alert notification should appear immediately with the officer's name and last GPS location.
4. Manager acknowledges the alert and marks it resolved.
5. Confirm the officer's phone shows "Alert received — help is on the way" or similar.

**Pass:** Alert fires, manager sees it in real time, resolution flow works end to end.

---

## Test 10 — Low-Bandwidth Simulation

**Goal:** App is usable on a slow mobile connection (3G or throttled).

1. In Chrome mobile: Settings → Developer Tools (if available) or use a low-signal area.
2. Navigate between My Schedule, Clock In, and Reports.
3. Pages should load within 5 seconds even on a slow connection.
4. No JavaScript errors in console from failed API calls (they should retry or show loading states).

**Pass:** Core features (schedule, clock-in, reports) function on degraded connections.

---

## Checklist Summary

| # | Test | Pass / Fail | Notes |
|---|---|---|---|
| 1 | GPS Clock-In | | |
| 2 | Duplicate Prevention | | |
| 3 | Clock-Out + Duration | | |
| 4 | Overnight Shift | | |
| 5 | Mobile Schedule View | | |
| 6 | Real-Time Shift Push | | |
| 7 | Incident Report from Mobile | | |
| 8 | DAR Submission | | |
| 9 | Panic Button | | |
| 10 | Low-Bandwidth | | |

**8 of 10 passing (with panic pre-coordinated) = P7 complete.**
