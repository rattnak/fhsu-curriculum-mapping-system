"""Database engine + session helpers.

SQLite by default (local dev). For real deployments set DATABASE_URL to the
Supabase Postgres connection string (use the pooler URL: serverless/containers
open many short-lived connections).
"""
import os
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./curriculum.db")

# Supabase/Heroku-style URLs say postgres:// or postgresql://; SQLAlchemy needs
# to be told to use the psycopg (v3) driver we install.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # check_same_thread=False lets FastAPI's threadpool share the SQLite connection safely per-session
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # pool_pre_ping drops connections the pooler has silently closed
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
