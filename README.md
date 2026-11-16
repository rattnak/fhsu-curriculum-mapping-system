# FHSU Curriculum Mapping System (MVP)

[![CI](https://github.com/rattnak/fhsu-curriculum-mapping-system/actions/workflows/ci.yml/badge.svg)](https://github.com/rattnak/fhsu-curriculum-mapping-system/actions/workflows/ci.yml) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)


Lightweight, self-hosted Coursetune alternative for Fort Hays State University:
a pan/zoom node-graph of the curriculum hierarchy (institution → college →
department → program → course → module) that expands level by level on click, with
learning-outcome alignment tracking, per-node filter bars, a details sidebar,
and role-based, server-side scoped access.

## Stack
- **Backend:** FastAPI + SQLModel, SQLite (`backend/curriculum.db`) — swap `DATABASE_URL` for Supabase Postgres later
- **Frontend:** React (Vite), custom SVG node-graph canvas (tidy-tree layout, pan/zoom,
  click-to-expand, per-college/department search bars, right details sidebar) — no D3 dependency
- **Auth:** 3 hardcoded test users, HMAC-signed bearer tokens (stdlib only)

## Run it

```bash
# backend (port 8000)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.seed          # seeds FHSU > College of Applied Business > Dept of Applied Business Studies
.venv/bin/uvicorn app.main:app --reload --port 8000

# frontend (port 5173)
cd frontend
npm install
npm run dev
```

Swagger docs: http://localhost:8000/docs

## Development commands

```bash
make setup     # backend venv + frontend deps
make lint      # ruff + eslint
make test      # pytest (auth, permissions, reports) + vitest
docker compose up --build   # full stack: UI :8080, API :8000
```

CI runs the same checks on every push and PR. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[roadmap](docs/2026-11-16-interface-readiness-spec.md).

## Deploying for real users (Supabase Postgres)

1. Create a Supabase project; copy the **pooler** connection string (Project Settings → Database).
2. In `backend/`, copy `.env.example` to `.env` and fill in `DATABASE_URL`, a random `CMS_SECRET`
   (the API refuses to start with `CMS_ENV=production` on the default secret), and `CMS_CORS_ORIGINS`.
3. Load the env, then create the schema + catalog and the first admin (no `admin123`-style test accounts):
   ```bash
   set -a; source .env; set +a
   .venv/bin/pip install -r requirements.txt
   .venv/bin/python -m app.seed                       # CMS_SEED_TEST_USERS=0 skips demo users
   .venv/bin/python -m app.create_admin jdoe "Jane" "Doe"
   .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
4. Build the frontend with `frontend/.env.production` (see `.env.production.example`):
   `VITE_API_URL=<your API>` and `VITE_DEMO_MODE=false`, then `npm run build`.
5. Add everyone else from the Users view or with invite links.

Do not expose these tables through Supabase's auto-generated REST API: scope/role checks
live in FastAPI. The `migrate_add_*.py` scripts are SQLite-only and not needed on a fresh Postgres.
Passwords are salted scrypt (old SHA-256 hashes upgrade on next login). Local dev is unchanged:
`frontend/.env.development` keeps demo mode on.

## Test users

| username     | password   | role   | scope                                  |
|--------------|------------|--------|----------------------------------------|
| `admin_test` | `admin123` | admin  | Fort Hays State University (full tree) |
| `editor_test`| `editor123`| editor | Robbins College of Business and Entrepreneurship |
| `viewer_test`| `viewer123`| viewer | Department of Applied Business Studies |

Role scope cascades downward; the `/curriculum` endpoint returns only the
subtree at/under the user's scope node, enforced server-side. A viewer
requesting a scope above their assignment gets a 403.

## API
- `POST /login` → `{token, role, scope_node_id}`
- `GET /curriculum?scope=<node_id>` → role-filtered nested JSON tree (outcomes + activities on course/module nodes)
- `GET /reports/coverage` — coverage matrix (courses × program outcomes / HLC criteria, zero-coverage gaps flagged)
- `GET /reports/rigidity` — mastery-level distribution audit (Introduced/Reinforced/Mastered)
- `GET /reports/orphans` — orphaned course outcomes + dead-end program outcomes
- `POST /programs` / `POST /courses` / `POST /modules` — admin/editor create
  programs (under a department), courses (under a program), and modules (under a
  course), scope-enforced; also available from the details sidebar
- `GET /advise/{node_id}` — rule-based module-organization recommendations for a
  course: Bloom's-taxonomy verb analysis, mastery scaffolding across module
  order, module shape, outcome/assessment alignment; findings carry resource tags
- `GET /resources?q=&tag=` — curated accreditation/pedagogy reference library
  (Bloom's taxonomy, HLC criteria, Quality Matters, NILOA, FHSU pages)
- `GET /outcome-nodes/{outcome_id}` — node ids mapped to an outcome (drives the
  select-outcome → highlight-on-canvas interaction)
- `GET /access` — which departments are shared with the caller; shared ones list
  course names only (never module detail). Rendered as the Access view

## AI-agent integration
The API is designed to be driven by an AI agent as well as the UI. FastAPI
publishes the full OpenAPI spec at `/openapi.json` (interactive at `/docs`),
so an agent (e.g., Claude via tool-use or an MCP wrapper) can:
- `GET /search?q=…` — find any course/module/department by name; each hit
  includes its full `path`/`path_ids` for navigation
- `GET /node/{id}` — structured detail: path, outcomes with text + mastery +
  HLC tags + parent outcome, activities, descendant counts
- `GET /compliance/{node_id}` — check a course/module (or aggregate a whole
  department/college) against the university taxonomy format rules: course
  code format, credit hours, module naming (`Module N: Title`), outcome
  mapping per module, assessment presence, orphaned CLOs. Returns structured
  pass/fail checks with human-readable detail.

Example agent question this supports: "find the Pharmacology module and tell
me whether it complies with the university taxonomy format" →
`/search?q=pharmacology` → `/compliance/{id}`.

The same compliance check is exposed in the UI sidebar ("Run compliance check"),
alongside "Analyze module organization" (`/advise`).

### MCP server
`backend/mcp_server.py` exposes the whole thing to any MCP client (Claude Code,
Claude Desktop) as five tools: `search_curriculum`, `get_node`,
`check_compliance`, `advise_course`, `search_resources` — Claude becomes the
conversational UI, no chat frontend needed.

```bash
claude mcp add fhsu-curriculum \
  -- /path/to/backend/.venv/bin/python /path/to/backend/mcp_server.py
# scope it to a seeded user (default viewer_test):
#   CMS_MCP_USERNAME=admin_test
```

## Seeded demo data
All 5 real FHSU colleges and ~28 departments (from
fhsu.edu/academic/departments-and-colleges), ~1,100 nodes / 364 courses. The
Department of Applied Business Studies is richly hand-seeded (MGT 301,
MKT 301, MGT 400, MGT 601 capstone) for the stakeholder demo; other
departments carry generated representative courses/modules so the graph has
realistic scale. Refine against the real catalog with stakeholders.

Deliberately seeded report fodder:
- `MGT400-CLO2` has no parent program outcome → shows in the **orphan report**
- `PLO4` has no course mappings → shows as a **dead-end** and a **coverage gap**
- Mastery distribution is Introduced-heavy → exercises the **rigidity audit** thresholds

## Deferred (post-MVP)
Real auth (Supabase), SIS/LMS integration, term versioning, multi-tenant,
audit log, Excel export, circle-graph visualization (v2), universal search.

## Docs
- `docs/coursetune-review-prompt.md` — ready-to-paste prompt for Claude Cowork to
  review FHSU's current CourseTune layout and produce transferable design notes.
