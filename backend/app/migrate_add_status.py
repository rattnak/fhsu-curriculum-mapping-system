"""One-shot migration: add Node.status / Node.created_by_user_id to an existing
curriculum.db.

SQLModel's create_all() (see database.py) only creates missing tables, never
alters existing ones — so the approval-workflow columns added to the Node model
won't reach a database file that already has a `node` table. Run this once
against any such existing curriculum.db:

    cd backend && python -m app.migrate_add_status

Safe to re-run: it checks PRAGMA table_info first and skips columns that are
already present. Not needed on a fresh clone that deletes curriculum.db and
lets seed.py/create_all rebuild it — that path picks up the new columns for free.
"""
from sqlalchemy import text

from .database import IS_SQLITE, engine


def migrate() -> None:
    if not IS_SQLITE:
        raise SystemExit("SQLite-only migration; a fresh Postgres database gets the full schema from create_all().")
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(node)"))}

        if "status" not in existing:
            conn.execute(text("ALTER TABLE node ADD COLUMN status VARCHAR DEFAULT 'active'"))
            print("added node.status (backfilled existing rows to 'active')")
        else:
            print("node.status already present, skipping")

        if "created_by_user_id" not in existing:
            conn.execute(text("ALTER TABLE node ADD COLUMN created_by_user_id INTEGER"))
            print("added node.created_by_user_id")
        else:
            print("node.created_by_user_id already present, skipping")


if __name__ == "__main__":
    migrate()
