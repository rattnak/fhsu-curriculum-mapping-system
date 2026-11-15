.PHONY: setup test lint dev-api dev-web build
setup:
	cd backend && python3 -m venv .venv && .venv/bin/python -m pip install -r requirements-dev.txt
	cd frontend && npm ci
test:
	cd backend && .venv/bin/python -m pytest -q
	cd frontend && npm test
lint:
	cd backend && .venv/bin/python -m ruff check app tests mcp_server.py
	cd frontend && npm run lint
dev-api:
	cd backend && .venv/bin/python -m app.seed && .venv/bin/uvicorn app.main:app --reload
dev-web:
	cd frontend && npm run dev
build:
	cd frontend && npm run build
