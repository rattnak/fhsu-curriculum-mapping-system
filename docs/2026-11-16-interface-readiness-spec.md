# Spec: Interface readiness before the Supabase migration

**Date:** 2026-11-16
**Scope:** `frontend/` only, plus two small API contracts it depends on. No schema changes.
**Companion doc:** [supabase-setup-guide.md](supabase-setup-guide.md) covers the database side.

## Why this comes before the migration

Today the API reads a local SQLite file, so every request returns in a few milliseconds and never fails. After the migration the same requests cross the network to a pooled Postgres instance. Three things change for the person using the app:

1. **Requests take visibly longer.** Tens to hundreds of milliseconds each, more on a cold connection. Anything that shows nothing while loading will look frozen.
2. **Requests can fail.** Pooler timeouts, dropped connections and restarts become normal events. Anything that swallows an error will look like a button that does nothing.
3. **It becomes the real system.** Demo shortcuts (prefilled usernames, test-account hints, silent role switching) must not reach production users.

The interface should already behave correctly under those conditions before the database is switched, so that any problem seen after the switch is a database problem and not a UI one.

## Status

| Part | State |
|---|---|
| A. Responsive layout | **Done** on 2026-11-16, see below |
| B. Reports redesign | **Done** on 2026-11-16, see below |
| C. Loading states | To do |
| D. Error handling and session expiry | To do, **blocks the migration** |
| E. Destructive actions and write feedback | To do |
| F. Large-data behaviour | To do |
| G. Production build hygiene | To do, **blocks the migration** |
| H. Verification pass | To do, run last |

Recommended order: D, G, C, E, F, H. D and G are the only parts where shipping without them causes user-visible breakage on day one.

---

## A. Responsive layout (done)

Checked at 375, 768 and 1280 px in dark theme with the admin demo account.

What was broken and is now fixed:

- **Details drawer on phones.** It was `min(380px, 90vw)`, leaving a 37 px strip of graph and pushing the Create button off-screen. At 640 px and below the drawer is now full-width and the Create button hides while it is open. `Graph.jsx` no longer hardcodes a 380 px drawer; `drawerWidth()` mirrors the CSS, so centering and Fit are correct at every width.
- **Graph touch input.** Panning could only start on empty canvas, and on a phone the node cards cover most of it. A drag may now start on a card (it becomes a pan after 6 px of movement, so taps still expand and select). Two-finger pinch zooms.
- **Reports filter bar.** The scope dropdown grew to the width of its longest option and overflowed at tablet width. It is now capped and truncates.
- **Coverage legend** overflowed at phone width. It now wraps.
- **Users page.** Inputs and selects were fixed at 150 px, truncating their own labels. On phones the invite and create-user forms stack full-width.
- **Login and invite cards** were a fixed 360 px. They now shrink with the screen.
- **Viewport height.** The app shell uses `100dvh` so mobile browser toolbars no longer cut off the bottom controls.
- **Touch ergonomics** (`pointer: coarse`): form controls are 16 px so iOS does not zoom the page on focus; icon buttons, toolbar buttons and menu items have larger hit areas.

Breakpoints in use: 900 px (report tabs go 2-up), 780 px (search bar drops to its own row), 640 px (phone layout, full-width drawer), 480 px and 360 px (top bar title and user name collapse). The 640 px value is duplicated as `DRAWER_FULL_BP` in `Graph.jsx`; change both together.

- **Window resizing.** The graph now follows the window: it re-centres and scales down to fit (never below 70%, where card text stops being readable), and on a phone it opens slightly zoomed out so the second column is visible. Once the user has panned or zoomed, a resize only nudges the graph back into view.
- **Narrow desktop windows and tablets (641 to 900 px).** The Create button hides while the drawer is open (it collided with the zoom toolbar), the highlight banner centres in the space beside the drawer, invite and create-user fields share the row width, and menus are capped to the window height.

## B. Reports redesign (done)

- The report picker is a row of four cards, each stating the question it answers. On phones it becomes a swipeable pill row.
- Scope selector and Print sit in the page header. Every report states which scope it is showing.
- **Coverage Matrix:** summary tiles (outcomes, courses, zero-coverage count), a callout naming uncovered outcomes, and a "Show gaps only" toggle. On phones the frozen outcome column narrows so more course columns are visible.
- **Rigidity Audit:** the three-row percentage table is replaced by a proportional Introduced / Reinforced / Mastered bar with counts. The per-course table shows course titles, a mix bar per row and a course filter.
- **Orphans / Dead-Ends:** two cards with counts, side by side on wide screens.
- **Module Structure:** course and module totals; activity columns stack on phones.
- Bug fixed: a failed report request used to leave its error on screen after the scope changed. The three API-backed reports now share one `useReport` hook that resets on scope change.

Print output is unchanged in content: tabs, filters and toggles are hidden, the print header is kept.

---

## C. Loading states

**Problem.** Every loading state is a line of grey text ("Loading…", "Loading curriculum…"). With a local database it flashes by. With a remote one it will sit there, and in several places nothing is shown at all.

| # | Requirement | Where |
|---|---|---|
| C1 | Replace text placeholders with skeletons that match the final layout: tile and table skeletons for reports, card rows for Access, Approvals and Users, a block skeleton for the drawer body. | `Reports.jsx`, `AccessView.jsx`, `ApprovalsView.jsx`, `UsersView.jsx`, `Sidebar.jsx` |
| C2 | Do not show a skeleton for the first 150 ms of a request, so fast responses do not flicker. | shared hook |
| C3 | When the drawer switches to another node, keep the previous node's content dimmed until the new one arrives instead of blanking the panel. | `Sidebar.jsx` |
| C4 | Global search shows a "Searching…" row while a query is in flight. Today the dropdown simply does not open until results arrive. | `GlobalSearch` in `App.jsx` |
| C5 | Every button that triggers a write shows a busy label and is disabled until the request settles. Most already do. Missing: revoke invite, revoke grant, action-item status toggle. | `UsersView.jsx`, `Sidebar.jsx` |
| C6 | Switching demo role or refetching the tree after an edit must not blank the graph. Keep the old tree on screen until the new one is ready. | `App.jsx` (`loginAs` sets `tree` to `null`) |

**Acceptance.** With the API artificially delayed by 800 ms per request, no view shows an empty area or unresponsive control, and nothing shifts position when data arrives.

## D. Error handling and session expiry (blocks the migration)

**Problem 1: expired sessions strand the user.** Tokens last 8 hours (`TOKEN_TTL_SECONDS` in `backend/app/auth.py`). When one expires, every request returns 401 and each view prints "Invalid or expired token" in place of its content. Nothing sends the user back to sign in.

**Problem 2: failures are silent or raw.** A dropped connection surfaces as the browser's own "Failed to fetch". Several calls discard errors entirely: global search (`App.jsx`), outcome highlighting (`App.jsx`), revoke invite and clipboard copy (`UsersView.jsx`), and one fetch in `Sidebar.jsx`.

**Problem 3: one failure takes down the page.** In `UsersView.jsx` any error, including a failed grant on a single user, replaces the whole page with one line of red text and no way back.

| # | Requirement |
|---|---|
| D1 | `request()` in `api.js` treats 401 as session end: clear the token, return to the sign-in screen, show "Your session expired. Sign in again." Exception: the login request itself, where 401 means wrong credentials. |
| D2 | `request()` maps network failures and 5xx responses to plain messages ("Can't reach the server. Check your connection and try again."). Server-provided `detail` text is still used for 4xx. |
| D3 | `request()` aborts after 15 seconds and reports a timeout as a retryable error. |
| D4 | Read requests (GET) retry once after 500 ms on network failure or 502/503/504. Writes never retry automatically. |
| D5 | Every failed page-level load shows an inline error with a **Try again** button, in place of the content area only. The top bar and navigation stay usable. |
| D6 | Failed writes show their error next to the control that triggered them and leave the rest of the page intact. Fix `UsersView.jsx` so a failed grant or revoke does not replace the page. |
| D7 | No empty `catch`. Each of the silent ones listed above either shows a message or is commented with why silence is correct (clipboard copy and theme persistence qualify; the others do not). |
| D8 | The app-level error line in `App.jsx` is dismissible and clears on the next successful load. |

**Acceptance.**
- Stop the API while signed in. Every view shows a readable message and a retry control. Restart the API, press retry, the view recovers without a page reload.
- Hand-edit the token in session storage so it is invalid. The next action returns to sign-in with the expiry message.
- No request is left pending for more than 15 seconds.

## E. Destructive actions and write feedback

**Problem.** Rejecting a pending course or module, revoking an invite, removing a user's access and deleting an action item all happen on a single click with no confirmation and no undo. With a production database these are permanent.

| # | Requirement |
|---|---|
| E1 | Reject (Approvals), revoke invite, remove grant and delete action item require a confirmation step that names the thing affected ("Reject 'BIOL 240'? Its creator will have to submit it again."). Use an inline confirm in the row, not a browser `confirm()` dialog. |
| E2 | After a successful write, show a short confirmation near the control ("Access added", "Invite revoked"). Today success is only visible as the list changing. |
| E3 | List changes that follow a write update in place without the page jumping back to the top. |
| E4 | Forms keep their entered values when a submit fails. |

**Acceptance.** No single click removes data. Every write ends in a visible success or a visible error.

## F. Large-data behaviour

**Context.** The seeded catalog has 280 courses, 559 modules and 74 outcomes. At "All in my scope" the coverage matrix is 74 by 280 cells, the rigidity table has 280 rows and Module Structure renders 280 cards. The browser copes today, but each of these is also one large query and one large response, and that cost grows once real departments add content.

| # | Requirement |
|---|---|
| F1 | Reports default to the user's narrowest natural scope: their own department for scoped users, and for admins a prompt to pick a department, with "All in my scope" still selectable. |
| F2 | Module Structure renders the first 20 courses and adds more as the user scrolls or presses "Show more". Printing renders all of them. |
| F3 | **Done 2026-11-16.** The graph opens scaled to fit, down to a 70% floor, so a phone user sees the root and the start of the next column. |
| F4 | Report responses are cached per scope for the session, so switching between tabs does not refetch. Any write that changes the tree clears the cache. |
| F5 | `/curriculum` returns the whole tree in one response and is refetched after every edit. Measure it against Supabase from the deployed API host. If it exceeds 1 second, open a follow-up to load module contents on expand. Do not build this speculatively. |

**Acceptance.** Against the remote database, first paint of each report at default scope takes under 1.5 seconds on a typical connection, and switching between already-viewed reports is instant.

## G. Production build hygiene (blocks the migration)

| # | Requirement | Where |
|---|---|---|
| G1 | **Done 2026-11-16.** The sign-in form starts empty. | `Login.jsx` |
| G2 | `VITE_DEMO_MODE=true` puts admin test credentials in the bundle and signs in automatically. The production build must fail loudly if `VITE_DEMO_MODE` is true or `VITE_API_URL` is unset, instead of silently falling back to `http://localhost:8000`. | `api.js`, `vite.config.js` |
| G3 | Sign out is available in production builds. It is currently only hidden in demo mode; confirm it appears and returns to the sign-in screen with all state cleared. | `UserMenu.jsx`, `App.jsx` |
| G4 | Accepting an invite lands the user in the app with their scope loaded, with no flash of the sign-in screen. | `AcceptInvite.jsx`, `App.jsx` |
| G5 | Add an empty state for a newly created user with no access granted yet: "You don't have access to any departments yet. Ask an administrator to grant it." Check what such a user sees today and replace it if it is a bare or empty graph. | `App.jsx` |
| G6 | Document the production values in `frontend/.env.production.example` and cross-reference step 5 of the Supabase guide. | docs |

**Acceptance.** A build made with the production env file contains no test usernames or passwords (search the built JS), and opening it with no session shows an empty sign-in form.

## H. Verification pass (run last, then again after the switch)

Run once against SQLite when C to G are complete, and once more against Supabase immediately after cutover. The two runs should behave identically apart from speed.

1. Each role (admin, editor, viewer) signs in, opens the graph, expands to a module, opens its details.
2. Each of the four reports at department scope and at full scope; print preview of one.
3. Editor creates a course and a module; a second account approves one and rejects the other.
4. Admin creates an invite, opens the link in a private window, completes sign-up, then grants and removes access for that user.
5. Repeat steps 1 and 2 at 375 px width on a real phone, including pinch-zoom and dragging the graph from a node card.
6. Repeat step 1 with the network throttled to "Slow 4G" in browser dev tools.
7. Stop the API mid-session and confirm the behaviour required in D.
8. Light theme spot-check of every view touched in C to G.

## Out of scope

- Moving authentication to Supabase Auth. The app keeps its own tokens; Supabase is used as Postgres only, as the setup guide describes.
- Calling Supabase from the browser. The frontend continues to talk only to the FastAPI service.
- New report types or assessment-result data (covered in the assessment reporting gaps plan).
- Offline support.
