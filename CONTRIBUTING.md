# Contributing

## Setup
```bash
make setup      # venv + npm ci
make dev-api    # seeds a local SQLite DB and starts the API on :8000
make dev-web    # Vite on :5173 (demo mode on via frontend/.env.development)
```
Or `docker compose up --build` for the full stack (UI :8080, API :8000).

## Workflow
- Branch from `main`, keep PRs small and tied to an issue (`Closes #n`).
- Commit messages follow Conventional Commits: `feat(api): ...`, `fix(graph): ...`, `docs: ...`.
- Before opening a PR run `make lint test`. CI runs the same checks plus a production build
  that must not contain demo credentials.
- Permission rules live in `backend/app/perms.py` and are enforced in FastAPI, never in the
  client. Any new endpoint needs a test in `backend/tests/` covering each role.
