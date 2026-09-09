"""FastAPI app: login, curriculum tree (role-scoped), and reports."""
import secrets
import time
from collections import defaultdict
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from . import advise, compliance, reports
from .auth import get_current_user, hash_password, make_token, require_admin, require_editor
from .database import get_session, init_db
from .models import ApprovalStatus, Course, Invite, Node, NodeType, Resource, Role, User, UserScope
from .perms import can_edit, can_view, default_scope, is_admin, scope_grants
from .tree import build_tree, is_descendant_or_self

INVITE_TTL_SECONDS = 7 * 24 * 3600

app = FastAPI(title="FHSU Curriculum Mapping API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/login")
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == body.username)).first()
    if not user or user.password_hash != hash_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "token": make_token(user.username),
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role.value,
        "scope_node_id": user.scope_node_id,
    }


