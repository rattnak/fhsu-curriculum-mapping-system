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


def _resolve_scope(session: Session, user: User, scope: Optional[int]) -> int:
    """Requested scope must sit within one of the user's grants; defaults to the primary scope."""
    if scope is None:
        base = default_scope(session, user)
        if base is None:
            raise HTTPException(status_code=403, detail="No access granted yet")
        return base
    if not session.get(Node, scope):
        raise HTTPException(status_code=404, detail="Scope node not found")
    if not can_view(session, user, scope):
        raise HTTPException(status_code=403, detail="Scope outside your permission")
    return scope


@app.get("/curriculum")
def curriculum(
    scope: Optional[int] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pending_ok = _pending_visible_ids(session, user)
    if scope is not None:
        root = _resolve_scope(session, user, scope)
        tree = build_tree(session, root_node_id=root,
                          grants=None if is_admin(user) else scope_grants(session, user),
                          viewer_user_id=user.user_id, viewer_pending_ok=pending_ok,
                          is_admin_viewer=is_admin(user))
    elif is_admin(user):
        tree = build_tree(session, viewer_user_id=user.user_id, is_admin_viewer=True)  # full tree, uniform edit access
    else:
        grants = scope_grants(session, user)
        if not grants:
            raise HTTPException(status_code=403, detail="No access granted yet")
        # institution-rooted tree pruned to granted subtrees + their ancestor path
        tree = build_tree(session, grants=grants, viewer_user_id=user.user_id,
                          viewer_pending_ok=pending_ok)
    if tree is None:
        raise HTTPException(status_code=404, detail="No curriculum data")
    return {
        "role": user.role.value,
        "username": user.username,
        "first_name": user.first_name,
        "can_edit": user.role.value in ("admin", "editor"),
        "tree": tree,
    }


def _report_scope(session: Session, user: User, scope: Optional[int]) -> int:
    root = _resolve_scope(session, user, scope)
    # reports aggregate over a department subtree; any node works, courses filter by descendance
    return root


@app.get("/reports/coverage")
def report_coverage(scope: Optional[int] = None, user: User = Depends(get_current_user),
                    session: Session = Depends(get_session)):
    return reports.coverage_matrix(session, _report_scope(session, user, scope))


@app.get("/reports/rigidity")
def report_rigidity(scope: Optional[int] = None, user: User = Depends(get_current_user),
                    session: Session = Depends(get_session)):
    return reports.rigidity_audit(session, _report_scope(session, user, scope))


@app.get("/reports/orphans")
def report_orphans(scope: Optional[int] = None, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    return reports.orphan_report(session, _report_scope(session, user, scope))


