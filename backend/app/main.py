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


# ---------- agent-friendly endpoints (also used by the UI sidebar) ----------

def _path_ids(session: Session, node_id: int) -> list[int]:
    path, current, seen = [], node_id, set()
    while current is not None and current not in seen:
        seen.add(current)
        path.append(current)
        n = session.get(Node, current)
        current = n.parent_node_id if n else None
    return list(reversed(path))


def _grandparent_id(session: Session, node_id: int) -> Optional[int]:
    n = session.get(Node, node_id)
    parent = session.get(Node, n.parent_node_id) if n and n.parent_node_id else None
    return parent.parent_node_id if parent else None


def _can_approve(session: Session, user: User, node: Node) -> bool:
    """For a course, approval checks the direct parent (program) — whoever
    holds edit access at or above that program approves courses created
    under it. For a module, approval checks the grandparent (course's
    parent, i.e. program) — the same authority either way."""
    if is_admin(user):
        return True
    if node.node_type == NodeType.course:
        return node.parent_node_id is not None and can_edit(session, user, node.parent_node_id)
    gp_id = _grandparent_id(session, node.node_id)
    return gp_id is not None and can_edit(session, user, gp_id)


def _pending_visible_ids(session: Session, user: User) -> set:
    """Pending nodes this user may see beyond their own creations: everything
    they're eligible to approve. Feeds build_tree's viewer_pending_ok."""
    if is_admin(user):
        return set()  # admins see all pending nodes unconditionally (is_admin_viewer)
    pending = session.exec(select(Node).where(Node.status == ApprovalStatus.pending)).all()
    return {n.node_id for n in pending if _can_approve(session, user, n)}


@app.get("/search")
def search(
    q: str,
    scope: Optional[int] = None,
    limit: int = 25,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Search nodes (colleges, departments, courses, modules) by name or course title,
    restricted to the caller's permitted subtree. Returns each hit with its full path
    so a client (or AI agent) can expand/navigate straight to it."""
    ql = q.strip().lower()
    if not ql:
        return {"query": q, "results": []}

    nodes = session.exec(select(Node)).all()
    by_id = {n.node_id: n for n in nodes}
    from .models import Course as CourseModel
    title_by_node = {c.node_id: c.course_title for c in session.exec(select(CourseModel)).all()}

    pending_ok = _pending_visible_ids(session, user)
    admin = is_admin(user)

    def pending_hidden(n: Node) -> bool:
        if n.status != ApprovalStatus.pending or admin:
            return False
        if n.created_by_user_id == user.user_id:
            return False
        return n.node_id not in pending_ok

    def visible(nid: int) -> bool:
        if scope is not None and not is_descendant_or_self(session, nid, scope):
            return False
        if pending_hidden(by_id[nid]):
            return False
        return can_view(session, user, nid)

    results = []
    for n in nodes:
        haystack = n.node_name.lower()
        title = title_by_node.get(n.node_id, "")
        if (ql in haystack or ql in title.lower()) and visible(n.node_id):
            pids = _path_ids(session, n.node_id)
            results.append({
                "id": n.node_id,
                "name": n.node_name,
                "type": n.node_type.value,
                "course_title": title or None,
                "path_ids": pids,
                "path": [by_id[p].node_name for p in pids],
            })
            if len(results) >= limit:
                break
    return {"query": q, "results": results}


@app.get("/node/{node_id}")
def node_detail(
    node_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Full structured detail for one node: path, course info, outcomes with text,
    activities, and descendant counts. Structured for AI-agent consumption."""
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    if not can_view(session, user, node_id):
        raise HTTPException(status_code=403, detail="Node outside your permission")
    if (n.status == ApprovalStatus.pending and not is_admin(user)
            and n.created_by_user_id != user.user_id and not _can_approve(session, user, n)):
        # look identical to the ordinary scope-denial above — don't leak that a
        # pending node exists here to someone who isn't its creator or approver
        raise HTTPException(status_code=403, detail="Node outside your permission")

    from .models import Activity, Course as CourseModel, Mapping, Outcome
    pids = _path_ids(session, node_id)
    names = {x.node_id: x.node_name for x in session.exec(select(Node)).all()}
    detail = {
        "id": n.node_id,
        "name": n.node_name,
        "type": n.node_type.value,
        "path": [names[p] for p in pids],
        "path_ids": pids,
        "can_edit": can_edit(session, user, node_id),
        "status": n.status.value,
    }

    all_nodes = session.exec(select(Node)).all()
    children = [x for x in all_nodes if x.parent_node_id == node_id]
    detail["child_count"] = len(children)

    course = session.exec(select(CourseModel).where(CourseModel.node_id == node_id)).first()
    mappings, activities = [], []
    if course:
        detail["course_title"] = course.course_title
        detail["credit_hours"] = course.credit_hours
        mappings = session.exec(select(Mapping).where(Mapping.course_id == course.course_id)).all()
        activities = session.exec(select(Activity).where(Activity.course_id == course.course_id)).all()
    elif n.node_type.value == "module":
        mappings = session.exec(select(Mapping).where(Mapping.module_node_id == node_id)).all()
        activities = session.exec(select(Activity).where(Activity.module_node_id == node_id)).all()

    if n.node_type.value == "program" and n.degree_type:
        detail["degree_type"] = n.degree_type

    outcome_by_id = {o.outcome_id: o for o in session.exec(select(Outcome)).all()}
    seen_outcomes = {}
    for m in mappings:
        o = outcome_by_id.get(m.target_outcome_id)
        if o and o.outcome_id not in seen_outcomes:
            parent = outcome_by_id.get(o.parent_outcome_id)
            seen_outcomes[o.outcome_id] = {
                "id": o.outcome_id,
                "code": o.outcome_code,
                "text": o.outcome_text,
                "level": o.outcome_level.value,
                "mastery": m.mastery_level.value,
                "hlc_criterion_tag": o.hlc_criterion_tag,
                "parent_outcome": parent.outcome_code if parent else None,
            }
    detail["outcomes"] = list(seen_outcomes.values())
    detail["activities"] = [
        {"type": a.activity_type.value, "name": a.activity_name} for a in activities
    ]

    if n.node_type.value == "program":
        from .models import ActionItem
        all_action_items = session.exec(select(ActionItem)).all()
        items_by_outcome = defaultdict(list)
        for ai in all_action_items:
            items_by_outcome[ai.outcome_id].append(ai)
        detail["program_outcomes"] = [
            {
                "id": o.outcome_id,
                "code": o.outcome_code,
                "text": o.outcome_text,
                "hlc_criterion_tag": o.hlc_criterion_tag,
                "action_items": [
                    {
                        "id": ai.action_item_id,
                        "short_title": ai.short_title,
                        "description": ai.description,
                        "person_responsible": ai.person_responsible,
                        "target_date": ai.target_date,
                        "resources_needed": ai.resources_needed,
                        "status": ai.status.value,
                    }
                    for ai in items_by_outcome.get(o.outcome_id, [])
                ],
            }
            for o in outcome_by_id.values()
            if o.owning_node_id == node_id and o.outcome_level.value == "program"
        ]

    if n.node_type.value in ("department", "program", "college", "college_dept_grouping", "institution"):
        def count_desc(target_type):
            ids, total = {node_id}, 0
            changed = True
            while changed:
                changed = False
                for x in all_nodes:
                    if x.parent_node_id in ids and x.node_id not in ids:
                        ids.add(x.node_id)
                        changed = True
            return sum(1 for x in all_nodes if x.node_id in ids and x.node_type.value == target_type)
        detail["descendant_courses"] = count_desc("course")
        detail["descendant_modules"] = count_desc("module")
    return detail


@app.get("/compliance/{node_id}")
def compliance_check(
    node_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Check a course/module (or aggregate a department/college) against the
    university taxonomy format rules. Structured pass/fail output for UI and AI agents."""
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    if not can_view(session, user, node_id):
        raise HTTPException(status_code=403, detail="Node outside your permission")
    if (n.status == ApprovalStatus.pending and not is_admin(user)
            and n.created_by_user_id != user.user_id and not _can_approve(session, user, n)):
        raise HTTPException(status_code=403, detail="Node outside your permission")
    if n.node_type.value in ("institution", "college_dept_grouping"):
        raise HTTPException(status_code=400, detail="Run compliance at college level or below")
    return compliance.check_node(session, n)


# ---------- curriculum creation (admin/editor within scope) ----------

class CourseCreate(BaseModel):
    parent_node_id: int  # program node
    code: str            # e.g. "MGT 305"
    title: str
    credit_hours: int = 3


class ModuleCreate(BaseModel):
    parent_node_id: int  # course node
    name: str            # e.g. "Module 3: Applied Strategy"


def _check_edit_target(session: Session, user: User, parent_id: int, expected: NodeType) -> Node:
    parent = session.get(Node, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent node not found")
    if parent.node_type != expected:
        raise HTTPException(status_code=400, detail=f"Parent must be a {expected.value}")
    if not can_edit(session, user, parent_id):
        raise HTTPException(status_code=403, detail="No edit access here")
    if parent.status == ApprovalStatus.pending:
        # the frontend hides this path too, but it's enforced here since this
        # API is documented for direct/AI-agent use, not just the UI. Unreachable
        # for course creation (parent=department, which is never pending — see
        # ApprovalStatus's docstring), but stays active/necessary for module
        # creation, since a freshly-created course does start out pending.
        raise HTTPException(
            status_code=409,
            detail=f"'{parent.node_name}' is still pending approval; it can't have children yet",
        )
    return parent


@app.post("/courses", status_code=201)
def create_course(
    body: CourseCreate,
    user: User = Depends(require_editor),
    session: Session = Depends(get_session),
):
    parent = _check_edit_target(session, user, body.parent_node_id, NodeType.program)
    code = body.code.strip()
    if not code or not body.title.strip():
        raise HTTPException(status_code=422, detail="Code and title are required")
    dup = session.exec(
        select(Node).where(Node.parent_node_id == parent.node_id, Node.node_name == code)
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"'{code}' already exists in this program")
    node = Node(node_type=NodeType.course, node_name=code, parent_node_id=parent.node_id,
                status=ApprovalStatus.pending, created_by_user_id=user.user_id)
    session.add(node)
    session.flush()
    course = Course(course_title=body.title.strip(), credit_hours=body.credit_hours,
                    owning_node_id=parent.node_id, node_id=node.node_id)
    session.add(course)
    session.commit()
    return {"node_id": node.node_id, "course_id": course.course_id, "name": code, "status": "pending"}


@app.post("/modules", status_code=201)
def create_module(
    body: ModuleCreate,
    user: User = Depends(require_editor),
    session: Session = Depends(get_session),
):
    parent = _check_edit_target(session, user, body.parent_node_id, NodeType.course)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Module name is required")
    dup = session.exec(
        select(Node).where(Node.parent_node_id == parent.node_id, Node.node_name == name)
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"'{name}' already exists in this course")
    node = Node(node_type=NodeType.module, node_name=name, parent_node_id=parent.node_id,
                status=ApprovalStatus.pending, created_by_user_id=user.user_id)
    session.add(node)
    session.commit()
    return {"node_id": node.node_id, "name": name, "status": "pending"}


@app.get("/approvals")
def list_approvals(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Pending course/module nodes the caller is eligible to approve
    (parent- or grandparent-scope edit access, or admin — see _can_approve)."""
    pending = session.exec(select(Node).where(Node.status == ApprovalStatus.pending)).all()
    creators = {u.user_id: u for u in session.exec(select(User)).all()}
    names = {n.node_id: n.node_name for n in session.exec(select(Node)).all()}
    out = []
    for n in pending:
        if not _can_approve(session, user, n):
            continue
        pids = _path_ids(session, n.node_id)
        creator = creators.get(n.created_by_user_id)
        out.append({
            "node_id": n.node_id,
            "name": n.node_name,
            "type": n.node_type.value,
            "path": [names[p] for p in pids],
            "path_ids": pids,
            "created_by": creator.username if creator else None,
        })
    return {"approvals": out}


@app.post("/nodes/{node_id}/approve")
def approve_node(
    node_id: int,
    user: User = Depends(require_editor),
    session: Session = Depends(get_session),
):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    if n.status != ApprovalStatus.pending:
        raise HTTPException(status_code=400, detail="Node is not pending approval")
    if not _can_approve(session, user, n):
        raise HTTPException(status_code=403, detail="No approval access here")
    n.status = ApprovalStatus.active
    session.add(n)
    session.commit()
    return {"node_id": n.node_id, "status": "active"}


@app.post("/nodes/{node_id}/reject")
def reject_node(
    node_id: int,
    user: User = Depends(require_editor),
    session: Session = Depends(get_session),
):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    if n.status != ApprovalStatus.pending:
        raise HTTPException(status_code=400, detail="Node is not pending approval")
    if not _can_approve(session, user, n):
        raise HTTPException(status_code=403, detail="No approval access here")

    from .models import Activity, Mapping

    # a freshly-created pending node is always a leaf in practice (children
    # can't be added under a still-pending node), but walk defensively in case
    # that constraint is ever relaxed
    all_nodes = session.exec(select(Node)).all()
    doomed = {node_id}
    changed = True
    while changed:
        changed = False
        for x in all_nodes:
            if x.parent_node_id in doomed and x.node_id not in doomed:
                doomed.add(x.node_id)
                changed = True

    doomed_courses = session.exec(select(Course).where(Course.node_id.in_(doomed))).all()
    doomed_course_ids = {c.course_id for c in doomed_courses}
    if doomed_course_ids:
        for m in session.exec(select(Mapping).where(Mapping.course_id.in_(doomed_course_ids))).all():
            session.delete(m)
        for a in session.exec(select(Activity).where(Activity.course_id.in_(doomed_course_ids))).all():
            session.delete(a)
        for c in doomed_courses:
            session.delete(c)
    for x in all_nodes:
        if x.node_id in doomed:
            session.delete(x)
    session.commit()
    return {"node_id": node_id, "status": "rejected"}


@app.get("/resources")
def resources(
    q: str = "",
    tag: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Curated accreditation/pedagogy reference library. Filter by keyword and/or tag."""
    rows = session.exec(select(Resource)).all()
    ql, tl = q.strip().lower(), tag.strip().lower()
    out = []
    for r in rows:
        tags = [t.strip() for t in r.tags.split(",")]
        if tl and tl not in tags:
            continue
        if ql and ql not in f"{r.title} {r.source} {r.blurb} {r.tags}".lower():
            continue
        out.append({"id": r.resource_id, "title": r.title, "url": r.url,
                    "source": r.source, "tags": tags, "blurb": r.blurb})
    return {"resources": out}


@app.get("/advise/{node_id}")
def advise_endpoint(
    node_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Rule-based module-organization recommendations (Bloom verbs, scaffolding,
    module shape, assessment alignment) for one course. Structured for UI + AI agents."""
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node not found")
    if not can_view(session, user, node_id):
        raise HTTPException(status_code=403, detail="Node outside your permission")
    if (n.status == ApprovalStatus.pending and not is_admin(user)
            and n.created_by_user_id != user.user_id and not _can_approve(session, user, n)):
        raise HTTPException(status_code=403, detail="Node outside your permission")
    if n.node_type != NodeType.course:
        raise HTTPException(status_code=400, detail="Advice runs on course nodes")
    return advise.advise_course(session, n)


