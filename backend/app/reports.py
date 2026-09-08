"""Accreditation-style reports: aggregation over the mapping table, scoped to a department subtree."""
from collections import Counter, defaultdict

from sqlmodel import Session, select

from .models import ApprovalStatus, Course, Mapping, Node, Outcome, OutcomeLevel


def _dept_course_ids(session: Session, scope_node_id: int) -> dict[int, Course]:
    """Courses whose owning department sits at/under the scope node. Pending
    (not-yet-approved) courses are excluded so accreditation-facing reports
    only ever count approved curriculum."""
    from .tree import is_descendant_or_self

    courses = session.exec(select(Course)).all()
    course_nodes = {n.node_id: n for n in session.exec(select(Node)).all()}
    return {
        c.course_id: c
        for c in courses
        if is_descendant_or_self(session, c.owning_node_id, scope_node_id)
        and course_nodes.get(c.node_id) is not None
        and course_nodes[c.node_id].status == ApprovalStatus.active
    }


def coverage_matrix(session: Session, scope_node_id: int) -> dict:
    """Cross-tab: courses x program-level outcomes (+ HLC tag), flagging zero-coverage outcomes.
    Program outcomes are limited to those owned within the scope subtree; institutional
    outcomes are always included."""
    from .tree import is_descendant_or_self

    courses = _dept_course_ids(session, scope_node_id)
    all_nodes = {n.node_id: n for n in session.exec(select(Node)).all()}

    def owner_active(owning_node_id):
        owner = all_nodes.get(owning_node_id)
        return owner is not None and owner.status == ApprovalStatus.active

    outcomes = [
        o for o in session.exec(select(Outcome)).all()
        if o.outcome_level == OutcomeLevel.institutional
        or (o.outcome_level == OutcomeLevel.program
            and o.owning_node_id is not None
            and owner_active(o.owning_node_id)
            and is_descendant_or_self(session, o.owning_node_id, scope_node_id))
    ]
    mappings = session.exec(select(Mapping)).all()

    # course-level mappings roll up to their parent program outcome
    outcome_by_id = {o.outcome_id: o for o in session.exec(select(Outcome)).all()}
    cell = defaultdict(set)  # (course_id, program_outcome_id) -> {mastery levels}
    for m in mappings:
        if m.course_id not in courses:
            continue
        # credit every program/institutional ancestor up the outcome chain
        target = outcome_by_id.get(m.target_outcome_id)
        while target:
            if target.outcome_level in (OutcomeLevel.program, OutcomeLevel.institutional):
                cell[(m.course_id, target.outcome_id)].add(m.mastery_level.value)
            target = outcome_by_id.get(target.parent_outcome_id)

    node_names = {n.node_id: n.node_name for n in session.exec(select(Node)).all()}
    rows = []
    for o in outcomes:
        mapped = {
            node_names.get(courses[cid].node_id, courses[cid].course_title): sorted(levels)
            for (cid, oid), levels in cell.items()
            if oid == o.outcome_id
        }
        rows.append({
            "outcome_code": o.outcome_code,
            "outcome_text": o.outcome_text,
            "outcome_level": o.outcome_level.value,
            "hlc_criterion_tag": o.hlc_criterion_tag,
            "courses": mapped,
            "zero_coverage": len(mapped) == 0,
        })
    return {
        "courses": [node_names.get(c.node_id, c.course_title) for c in courses.values()],
        "course_titles": {node_names.get(c.node_id, c.course_title): c.course_title
                          for c in courses.values()},
        "outcomes": rows,
        "gaps": [r["outcome_code"] for r in rows if r["zero_coverage"]],
    }


def rigidity_audit(session: Session, scope_node_id: int) -> dict:
    """Distribution of mastery_level across the program; flags Introduced-heavy / Mastered-light."""
    courses = _dept_course_ids(session, scope_node_id)
    mappings = [m for m in session.exec(select(Mapping)).all() if m.course_id in courses]
    dist = Counter(m.mastery_level.value for m in mappings)
    total = sum(dist.values()) or 1
    pct = {k: round(100 * v / total, 1) for k, v in dist.items()}
    flags = []
    if pct.get("Introduced", 0) > 60:
        flags.append("Program is overloaded with 'Introduced' mappings (>60%).")
    if pct.get("Mastered", 0) < 15:
        flags.append("Program lacks 'Mastered' coverage (<15%) — outcomes may never reach mastery.")
    node_names = {n.node_id: n.node_name for n in session.exec(select(Node)).all()}
    per_course = defaultdict(Counter)
    for m in mappings:
        per_course[node_names.get(courses[m.course_id].node_id, "?")][m.mastery_level.value] += 1
    course_titles = {node_names.get(c.node_id, c.course_title): c.course_title
                     for c in courses.values()}
    return {
        "course_titles": course_titles,
        "total_mappings": sum(dist.values()),
        "distribution": dict(dist),
        "percentages": pct,
        "per_course": {k: dict(v) for k, v in per_course.items()},
        "flags": flags,
    }


def orphan_report(session: Session, scope_node_id: int) -> dict:
    """Orphans: course outcomes with no parent program outcome.
    Dead-ends: program outcomes with no course mappings feeding them."""
    from .tree import is_descendant_or_self

    courses = _dept_course_ids(session, scope_node_id)
    all_outcomes = session.exec(select(Outcome)).all()
    outcome_by_id = {o.outcome_id: o for o in all_outcomes}
    mappings = [m for m in session.exec(select(Mapping)).all() if m.course_id in courses]

    # orphans limited to outcomes actually mapped by in-scope courses (or owned in scope)
    mapped_ids = {m.target_outcome_id for m in mappings}
    orphans = [
        {"outcome_code": o.outcome_code, "outcome_text": o.outcome_text, "level": o.outcome_level.value}
        for o in all_outcomes
        if o.outcome_level in (OutcomeLevel.course, OutcomeLevel.module)
        and o.parent_outcome_id is None
        and (o.outcome_id in mapped_ids
             or (o.owning_node_id is not None
                 and is_descendant_or_self(session, o.owning_node_id, scope_node_id)))
    ]

    fed_program_ids = set()
    for m in mappings:
        target = outcome_by_id.get(m.target_outcome_id)
        while target:
            if target.outcome_level == OutcomeLevel.program:
                fed_program_ids.add(target.outcome_id)
                break
            target = outcome_by_id.get(target.parent_outcome_id)

    dead_ends = [
        {"outcome_code": o.outcome_code, "outcome_text": o.outcome_text}
        for o in all_outcomes
        if o.outcome_level == OutcomeLevel.program
        and o.outcome_id not in fed_program_ids
        and o.owning_node_id is not None
        and is_descendant_or_self(session, o.owning_node_id, scope_node_id)
    ]
    return {"orphans": orphans, "dead_ends": dead_ends}
