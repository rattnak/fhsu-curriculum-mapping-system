"""Database engine + session helpers. SQLite for MVP; swap DATABASE_URL for Supabase Postgres later."""
import os
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./curriculum.db")

# check_same_thread=False lets FastAPI's threadpool share the SQLite connection safely per-session
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
