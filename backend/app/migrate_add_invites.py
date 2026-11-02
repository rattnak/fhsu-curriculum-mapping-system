"""One-shot migration companion for the Invite table.

Unlike migrate_add_status.py, `invite` is a brand-new table, not a new column
on an existing one — SQLModel's create_all() (see database.py) creates any
missing table automatically on the next app startup, so this script isn't
strictly required. It exists as a no-op-safe convenience/documentation
companion, matching the migrate_add_*.py naming precedent, so a future reader
looking for "how did the invites table get here" finds an explicit answer.

Safe to re-run:

    cd backend && python -m app.migrate_add_invites
"""
from sqlalchemy import text

from .database import IS_SQLITE, engine


def migrate() -> None:
    if not IS_SQLITE:
        raise SystemExit("SQLite-only migration; a fresh Postgres database gets the full schema from create_all().")
    with engine.begin() as conn:
        tables = {row[0] for row in conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "invite" in tables:
            print("invite table already present, skipping")
            return
        conn.execute(text("""
            CREATE TABLE invite (
                invite_id INTEGER PRIMARY KEY,
                token VARCHAR NOT NULL,
                role VARCHAR NOT NULL,
                scope_node_id INTEGER,
                access VARCHAR,
                created_by_user_id INTEGER NOT NULL,
                created_at FLOAT NOT NULL,
                expires_at FLOAT NOT NULL,
                used_at FLOAT,
                used_by_user_id INTEGER,
                FOREIGN KEY(scope_node_id) REFERENCES node(node_id),
                FOREIGN KEY(created_by_user_id) REFERENCES user(user_id),
                FOREIGN KEY(used_by_user_id) REFERENCES user(user_id)
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX ix_invite_token ON invite (token)"))
        print("created invite table")


if __name__ == "__main__":
    migrate()
