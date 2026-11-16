#!/usr/bin/env bash
# Creates the roadmap labels, milestones and issues. Run once after `gh auth login`.
set -euo pipefail
cd "$(dirname "$0")/.."

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null; }
label "blocks-migration" B60205 "Must land before the Supabase cutover"
label "frontend" 1D76DB "React app"
label "backend" 0E8A16 "FastAPI service"
label "ux" C5DEF5 "User-facing behaviour"
label "reliability" FBCA04 "Errors, retries, timeouts"
label "security" D93F0B "Auth and data exposure"
label "devops" 5319E7 "CI, containers, deployment"
label "docs" 0075CA "Documentation"
label "good first issue" 7057FF "Small and well scoped"

gh api repos/:owner/:repo/milestones -f title="v0.2 Production readiness" -f description="Interface readiness spec, parts C to H" >/dev/null 2>&1 || true
gh api repos/:owner/:repo/milestones -f title="v0.3 Assessment reporting" -f description="docs/2026-09-18-assessment-reporting-gaps-plan.md" >/dev/null 2>&1 || true
M2="v0.2 Production readiness"; M3="v0.3 Assessment reporting"

issue() { # title milestone labels body
  gh issue create --title "$1" --milestone "$2" --label "$3" --body "$4"
}

issue "Treat 401 as session end and return to sign-in" "$M2" "frontend,reliability,blocks-migration" \
"Spec D1. Tokens last 8h; after expiry every view prints \"Invalid or expired token\" with no way back.

- [ ] \`request()\` clears the token and returns to sign-in on 401 (except the login call)
- [ ] Sign-in shows \"Your session expired. Sign in again.\"
- [ ] Test: expired token in sessionStorage lands on sign-in

See docs/2026-11-16-interface-readiness-spec.md#d-error-handling-and-session-expiry-blocks-the-migration"

issue "API client: friendly network/5xx errors, 15s timeout, one GET retry" "$M2" "frontend,reliability,blocks-migration" \
"Spec D2-D4.

- [ ] Map network failures and 5xx to plain-language messages
- [ ] Abort after 15s via AbortController
- [ ] Retry GETs once after 500ms on network failure or 502/503/504; never retry writes
- [ ] Unit tests with a mocked fetch"

issue "Inline error state with Try again on every page-level load" "$M2" "frontend,ux,reliability,blocks-migration" \
"Spec D5-D8.

- [ ] Failed loads show an inline error and a Try again button in the content area only
- [ ] A failed grant/revoke in UsersView no longer replaces the whole page
- [ ] No empty \`catch\` remains without a comment explaining why silence is right
- [ ] App-level error line is dismissible"

issue "Fail the production build on demo mode or a missing API URL" "$M2" "frontend,security,devops,blocks-migration" \
"Spec G2, G6. Demo credentials live in App.jsx and the API URL silently falls back to localhost.

- [ ] Move demo credentials out of the production bundle (dynamic import or define-time stripping)
- [ ] \`vite build\` fails if VITE_DEMO_MODE=true or VITE_API_URL is unset in production mode
- [ ] CI grep for demo passwords stays green"

issue "Empty state for users with no access granted" "$M2" "frontend,ux" \
"Spec G5. A new user with no scope should see \"You don't have access to any departments yet. Ask an administrator to grant it.\" instead of a bare graph.

Also verify G3 (sign out in production) and G4 (no sign-in flash after accepting an invite)."

issue "Replace loading text with skeletons (150ms delay)" "$M2" "frontend,ux" \
"Spec C1-C6. Reports, Access, Approvals, Users and the drawer show grey text while loading.

- [ ] Skeletons matching final layout; none shown for the first 150ms
- [ ] Drawer keeps previous content dimmed while the next node loads
- [ ] Search shows a Searching row; graph does not blank on refetch
- [ ] Acceptance: with 800ms API delay nothing shifts when data arrives"

issue "Inline confirmation for destructive actions and visible write feedback" "$M2" "frontend,ux" \
"Spec E1-E4. Reject, revoke invite, remove grant and delete action item are one click with no undo.

- [ ] Inline confirm naming the affected item (no window.confirm)
- [ ] Short success message after each write
- [ ] Forms keep their values when a submit fails"

issue "Large-data behaviour: default report scope, paged Module Structure, report cache" "$M2" "frontend,ux" \
"Spec F1, F2, F4, F5. 280 courses / 559 modules / 74 outcomes today.

- [ ] Reports default to the user's narrowest scope
- [ ] Module Structure renders 20 courses then Show more (print renders all)
- [ ] Per-scope session cache, cleared on any tree write
- [ ] Measure /curriculum against Supabase; only optimise if over 1s"

issue "Run the Supabase setup and migrate the production database" "$M2" "backend,devops,docs" \
"Follow docs/supabase-setup-guide.md.

- [ ] Create org and project, lock down the Data API
- [ ] Seed with CMS_SEED_TEST_USERS=0 and create the first admin
- [ ] Deploy API and frontend containers
- [ ] Run the verification pass (spec part H) before and after cutover"

issue "Add an integration test job against Postgres" "$M2" "backend,devops" \
"CI currently tests on SQLite only. Add a Postgres service container job that seeds and runs the API tests, so dialect differences are caught before cutover."

issue "Introduce Alembic migrations to replace the SQLite-only migrate scripts" "$M2" "backend" \
"migrate_add_*.py only work on SQLite. Add Alembic with an initial revision from the current models so schema changes are reviewable and work on Postgres."

issue "Add refresh-safe auth: shorter access token, revocable sessions" "$M2" "backend,security" \
"Tokens are stateless 8h HMAC strings and cannot be revoked. Evaluate short-lived access tokens plus a refresh mechanism, and rate-limit /login."

issue "Record assessment results per course learning outcome" "$M3" "backend,frontend" \
"First item of docs/2026-09-18-assessment-reporting-gaps-plan.md: store assessment data so reports can show attainment, not just coverage."

issue "Add CSV export for the coverage matrix" "$M3" "frontend,good first issue" \
"Add an Export CSV button to the Coverage Matrix that downloads the currently filtered rows."
