"""Rule-based 'university taxonomy format' compliance checks.

Designed to be called by humans (sidebar button) and AI agents (via the
OpenAPI-documented endpoint) alike: given a node, returns a structured list of
pass/fail checks with human-readable detail an agent can reason over.
"""
import re

from sqlmodel import Session, select

from .models import ApprovalStatus, Activity, ActivityType, Course, Mapping, Node, NodeType, Outcome

COURSE_CODE_RE = re.compile(r"^[A-Z]{2,4} \d{3}$")
MODULE_NAME_RE = re.compile(r"^Module \d+: .+")


def _check(rule: str, passed: bool, detail: str) -> dict:
    return {"rule": rule, "passed": passed, "detail": detail}


def check_course(session: Session, course_node: Node) -> dict:
    checks = []
    course = session.exec(select(Course).where(Course.node_id == course_node.node_id)).first()

    checks.append(_check(
        "course_code_format",
        bool(COURSE_CODE_RE.match(course_node.node_name)),
        f"Course code '{course_node.node_name}' should match 'PREFIX ###' (e.g., 'MGT 301').",
    ))
    checks.append(_check(
        "credit_hours_set",
        course is not None and 1 <= course.credit_hours <= 6,
        f"Credit hours: {course.credit_hours if course else 'missing'} (expected 1–6).",
    ))

    modules = session.exec(
        select(Node).where(Node.parent_node_id == course_node.node_id,
                           Node.node_type == NodeType.module,
                           Node.status == ApprovalStatus.active)).all()
    checks.append(_check(
        "has_modules", len(modules) > 0,
        f"Course has {len(modules)} module(s); at least 1 required.",
    ))

    mappings = session.exec(
        select(Mapping).where(Mapping.course_id == (course.course_id if course else -1))).all()
    activities = session.exec(
        select(Activity).where(Activity.course_id == (course.course_id if course else -1))).all()
    mapped_modules = {m.module_node_id for m in mappings}
    assessed_modules = {a.module_node_id for a in activities
                        if a.activity_type == ActivityType.assessment}

    for mod in modules:
        ok_name = bool(MODULE_NAME_RE.match(mod.node_name))
        checks.append(_check(
            f"module_name_format:{mod.node_name}",
            ok_name,
            f"Module name '{mod.node_name}' should follow 'Module N: Title'.",
        ))
        checks.append(_check(
            f"module_has_outcome:{mod.node_name}",
            mod.node_id in mapped_modules,
            f"'{mod.node_name}' {'has' if mod.node_id in mapped_modules else 'has no'} mapped learning outcome(s).",
        ))
        checks.append(_check(
            f"module_has_assessment:{mod.node_name}",
            mod.node_id in assessed_modules,
            f"'{mod.node_name}' {'has' if mod.node_id in assessed_modules else 'has no'} assessment activity.",
        ))

    # orphaned CLOs: mapped course outcomes with no parent program outcome
    outcome_ids = {m.target_outcome_id for m in mappings}
    orphans = [
        o.outcome_code for o in session.exec(select(Outcome)).all()
        if o.outcome_id in outcome_ids and o.outcome_level.value == "course"
        and o.parent_outcome_id is None
    ]
    checks.append(_check(
        "no_orphaned_outcomes", len(orphans) == 0,
        "All course outcomes roll up to a program outcome." if not orphans
        else f"Orphaned course outcome(s) with no parent program outcome: {', '.join(orphans)}.",
    ))

    return {
        "node_id": course_node.node_id,
        "node_name": course_node.node_name,
        "node_type": "course",
        "compliant": all(c["passed"] for c in checks),
        "checks": checks,
    }


def check_module(session: Session, module_node: Node) -> dict:
    checks = [_check(
        "module_name_format",
        bool(MODULE_NAME_RE.match(module_node.node_name)),
        f"Module name '{module_node.node_name}' should follow 'Module N: Title'.",
    )]
    mappings = session.exec(
        select(Mapping).where(Mapping.module_node_id == module_node.node_id)).all()
    activities = session.exec(
        select(Activity).where(Activity.module_node_id == module_node.node_id)).all()
    checks.append(_check(
        "has_outcome", len(mappings) > 0,
        f"Module has {len(mappings)} outcome mapping(s); at least 1 required.",
    ))
    has_assessment = any(a.activity_type == ActivityType.assessment for a in activities)
    checks.append(_check(
        "has_assessment", has_assessment,
        "Module has an assessment activity." if has_assessment
        else "Module has no assessment activity.",
    ))
    return {
        "node_id": module_node.node_id,
        "node_name": module_node.node_name,
        "node_type": "module",
        "compliant": all(c["passed"] for c in checks),
        "checks": checks,
    }


def check_node(session: Session, target: Node) -> dict:
    """Course/module: direct check. Department/college: summarize over child courses."""
    if target.node_type == NodeType.course:
        return check_course(session, target)
    if target.node_type == NodeType.module:
        return check_module(session, target)

    # aggregate: run over all descendant courses (approved only)
    from .tree import is_descendant_or_self
    courses = [
        n for n in session.exec(
            select(Node).where(Node.node_type == NodeType.course,
                               Node.status == ApprovalStatus.active)).all()
        if is_descendant_or_self(session, n.node_id, target.node_id)
    ]
    results = [check_course(session, c) for c in courses]
    failing = [r for r in results if not r["compliant"]]
    return {
        "node_id": target.node_id,
        "node_name": target.node_name,
        "node_type": target.node_type.value,
        "compliant": len(failing) == 0,
        "courses_checked": len(results),
        "courses_failing": [
            {"node_id": r["node_id"], "node_name": r["node_name"],
             "failed_rules": [c["rule"] for c in r["checks"] if not c["passed"]]}
            for r in failing
        ],
    }
