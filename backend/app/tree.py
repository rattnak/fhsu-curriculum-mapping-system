"""Build the nested JSON tree from the Node table.

Loads all nodes in one query, assembles the tree in memory (fine at MVP scale),
and attaches outcomes/activities to course and module nodes. Scope filtering is
done here, server-side: callers get only the subtree their scope allows.
"""
from collections import defaultdict
from typing import Optional

from sqlmodel import Session, select

from .models import ApprovalStatus, Activity, Course, Mapping, Node, Outcome


def _load(session: Session):
    nodes = session.exec(select(Node).order_by(Node.sort_order, Node.node_id)).all()
    courses = {c.node_id: c for c in session.exec(select(Course)).all()}
    outcomes = {o.outcome_id: o for o in session.exec(select(Outcome)).all()}
    activities = session.exec(select(Activity)).all()
    mappings = session.exec(select(Mapping)).all()
    return nodes, courses, outcomes, activities, mappings


def is_descendant_or_self(session: Session, node_id: int, ancestor_id: int) -> bool:
    """True if node_id is ancestor_id or lies below it in the tree."""
    current: Optional[int] = node_id
    seen = set()
    while current is not None and current not in seen:
        if current == ancestor_id:
            return True
        seen.add(current)
        node = session.get(Node, current)
        current = node.parent_node_id if node else None
    return False


def build_tree(session: Session, root_node_id: Optional[int] = None,
               grants: Optional[list] = None, uniform_access: str = "edit",
               viewer_user_id: Optional[int] = None,
               viewer_pending_ok: Optional[set] = None,
               is_admin_viewer: bool = False) -> Optional[dict]:
    """Nested JSON per the frontend contract. root_node_id limits output to that
    subtree; grants=[(scope_node_id, access)] prunes to granted subtrees plus
    their ancestor path and annotates per-node access.

    Pending (not-yet-approved) program/course/module nodes are hidden from the
    tree unless the viewer is an admin, created the node themselves, or is
    listed in viewer_pending_ok (the set of node_ids they're eligible to
    approve — computed by the caller, see main.py's _pending_visible_ids)."""
    if viewer_pending_ok is None:
        viewer_pending_ok = set()
    nodes, courses, outcomes, activities, mappings = _load(session)

    children_of = defaultdict(list)
    by_id = {}
    for n in nodes:
        by_id[n.node_id] = n
        children_of[n.parent_node_id].append(n)

    # outcomes/activities keyed by the node they belong to
    acts_by_module = defaultdict(list)
    acts_by_course_node = defaultdict(list)
    course_by_id = {c.course_id: c for c in courses.values()}
    for a in activities:
        entry = {"type": a.activity_type.value, "name": a.activity_name}
        if a.module_node_id is not None:
            acts_by_module[a.module_node_id].append(entry)
        elif a.course_id in course_by_id:
            acts_by_course_node[course_by_id[a.course_id].node_id].append(entry)

    outcome_codes_by_module = defaultdict(list)
    outcome_codes_by_course_node = defaultdict(list)
    objectives_by_module = defaultdict(list)
    seen_module_objectives = set()
    for m in mappings:
        o = outcomes.get(m.target_outcome_id)
        if not o:
            continue
        tag = f"{o.outcome_code} ({m.mastery_level.value})"
        if m.module_node_id is not None:
            if tag not in outcome_codes_by_module[m.module_node_id]:
                outcome_codes_by_module[m.module_node_id].append(tag)
            key = (m.module_node_id, o.outcome_id)
            if key not in seen_module_objectives:
                seen_module_objectives.add(key)
                objectives_by_module[m.module_node_id].append(
                    {"code": o.outcome_code, "text": o.outcome_text,
                     "mastery": m.mastery_level.value})
        elif m.course_id in course_by_id:
            cn = course_by_id[m.course_id].node_id
            if tag not in outcome_codes_by_course_node[cn]:
                outcome_codes_by_course_node[cn].append(tag)

    # access model: grants=None -> everything visible with uniform_access;
    # otherwise prune to (ancestors of grants) + (descendants of grants), and
    # annotate each node 'edit' / 'view' / 'context' (skeleton path only).
    scope_access = {}
    ancestor_ids = set()
    if grants is not None:
        rank = {None: 0, "view": 1, "edit": 2}
        for sid, acc in grants:
            if rank[acc] > rank[scope_access.get(sid)]:
                scope_access[sid] = acc
            cur = by_id.get(sid)
            while cur is not None and cur.parent_node_id is not None:
                ancestor_ids.add(cur.parent_node_id)
                cur = by_id.get(cur.parent_node_id)

    def node_access(n: Node, inherited):
        own = scope_access.get(n.node_id)
        rank = {None: 0, "view": 1, "edit": 2}
        return own if rank[own] > rank[inherited] else inherited

    def pending_hidden(n: Node) -> bool:
        if n.status != ApprovalStatus.pending or is_admin_viewer:
            return False
        if viewer_user_id is not None and n.created_by_user_id == viewer_user_id:
            return False
        return n.node_id not in viewer_pending_ok

    def serialize(n: Node, inherited=None) -> Optional[dict]:
        access = node_access(n, inherited) if grants is not None else uniform_access
        if grants is not None and access is None and n.node_id not in ancestor_ids:
            return None
        if pending_hidden(n):
            return None
        d = {"id": n.node_id, "name": n.node_name, "type": n.node_type.value,
             "access": access or "context"}
        if n.status == ApprovalStatus.pending:
            d["status"] = "pending"
        if n.modality_tag:
            d["modality"] = n.modality_tag
        if n.node_type.value == "course" and n.node_id in courses:
            c = courses[n.node_id]
            d["credit_hours"] = c.credit_hours
            d["course_title"] = c.course_title
        outs = outcome_codes_by_module.get(n.node_id) or outcome_codes_by_course_node.get(n.node_id)
        if outs:
            d["outcomes"] = outs
        objs = objectives_by_module.get(n.node_id)
        if objs:
            d["objectives"] = objs
        acts = acts_by_module.get(n.node_id) or acts_by_course_node.get(n.node_id)
        if acts:
            d["activities"] = acts
        kids = [serialize(k, access if grants is not None else None)
                for k in children_of.get(n.node_id, [])]
        kids = [k for k in kids if k is not None]
        if kids:
            d["children"] = kids
        return d

    if root_node_id is not None:
        root = by_id.get(root_node_id)
        return serialize(root) if root else None

    roots = children_of.get(None, [])
    return serialize(roots[0]) if roots else None
