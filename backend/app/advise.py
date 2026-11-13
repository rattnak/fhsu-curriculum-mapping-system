"""Rule-based module-organization advisor (no LLM).

Classifies outcome verbs against the revised Bloom's taxonomy (Anderson &
Krathwohl, 2001), checks mastery scaffolding across module order, module shape,
and outcome/assessment alignment. Deterministic and testable; findings carry
resource tags that map into the curated Resource library so the UI (and any AI
agent) can cite references alongside each recommendation.
"""
import re

from sqlmodel import Session, select

from .models import (Activity, ActivityType, Course, Mapping, MASTERY_LABELS,
                     MasteryLevel, Node, NodeType, Outcome)

BLOOM_VERBS = {
    "remember": {"define", "describe", "identify", "label", "list", "match", "name",
                 "recall", "recognize", "recite", "record", "repeat", "state"},
    "understand": {"classify", "compare", "discuss", "explain", "express", "interpret",
                   "locate", "paraphrase", "report", "restate", "review", "summarize",
                   "translate"},
    "apply": {"apply", "calculate", "demonstrate", "employ", "execute", "illustrate",
              "implement", "operate", "practice", "schedule", "sketch", "solve", "use"},
    "analyze": {"analyze", "categorize", "contrast", "differentiate", "distinguish",
                "examine", "experiment", "inspect", "investigate", "organize",
                "question", "test"},
    "evaluate": {"appraise", "argue", "assess", "critique", "defend", "estimate",
                 "evaluate", "judge", "justify", "rate", "select", "support", "value"},
    "create": {"assemble", "build", "compose", "construct", "create", "design",
               "develop", "devise", "formulate", "generate", "invent", "plan",
               "produce", "propose", "synthesize", "write"},
}
BLOOM_RANK = {level: i for i, level in enumerate(BLOOM_VERBS, start=1)}
VERB_TO_LEVEL = {v: level for level, verbs in BLOOM_VERBS.items() for v in verbs}

NON_MEASURABLE = {"know", "understand", "learn", "appreciate", "grasp", "realize",
                  "believe", "familiarize", "comprehend", "be aware"}

# what Bloom depth each mastery level should at least reach
MASTERY_MIN_BLOOM = {
    MasteryLevel.introduced: 1,   # remember+
    MasteryLevel.reinforced: 3,   # apply+
    MasteryLevel.mastered: 4,     # analyze+
}

MODULE_MIN, MODULE_MAX = 3, 8


def _leading_verb(text: str) -> str:
    words = re.findall(r"[a-z']+", text.lower())
    skip = {"students", "will", "be", "able", "to", "the", "learners", "learner",
            "student", "can", "should", "upon", "completion", "of", "this",
            "course", "module", "successfully"}
    for w in words:
        if w not in skip:
            return w
    return ""


def _finding(rule, severity, passed, detail, tags):
    return {"rule": rule, "severity": severity, "passed": passed,
            "detail": detail, "resource_tags": tags}


def advise_course(session: Session, course_node: Node) -> dict:
    course = session.exec(select(Course).where(Course.node_id == course_node.node_id)).first()
    modules = session.exec(
        select(Node).where(Node.parent_node_id == course_node.node_id,
                           Node.node_type == NodeType.module).order_by(Node.node_id)).all()
    mappings = session.exec(
        select(Mapping).where(Mapping.course_id == (course.course_id if course else -1))).all()
    activities = session.exec(
        select(Activity).where(Activity.course_id == (course.course_id if course else -1))).all()
    outcome_by_id = {o.outcome_id: o for o in session.exec(select(Outcome)).all()}

    findings = []

    # --- module shape ---
    n = len(modules)
    findings.append(_finding(
        "module_count", "suggestion", MODULE_MIN <= n <= MODULE_MAX,
        f"Course has {n} module(s); {MODULE_MIN}–{MODULE_MAX} keeps pacing manageable."
        if not (MODULE_MIN <= n <= MODULE_MAX) else f"Module count ({n}) is in the {MODULE_MIN}–{MODULE_MAX} range.",
        ["module-design", "qm"],
    ))
    acts_by_module = {}
    for a in activities:
        acts_by_module.setdefault(a.module_node_id, []).append(a)
    for m in modules:
        acts = acts_by_module.get(m.node_id, [])
        has_learning = any(a.activity_type == ActivityType.learning_activity for a in acts)
        has_assessment = any(a.activity_type == ActivityType.assessment for a in acts)
        if not (has_learning and has_assessment):
            missing = []
            if not has_learning:
                missing.append("a learning activity")
            if not has_assessment:
                missing.append("an assessment")
            findings.append(_finding(
                f"module_completeness:{m.node_name}", "warning", False,
                f"'{m.node_name}' is missing {' and '.join(missing)}.",
                ["module-design", "qm"],
            ))

    # --- Bloom verb analysis per mapped outcome ---
    mapped_outcomes = {}
    for mp in mappings:
        o = outcome_by_id.get(mp.target_outcome_id)
        if o:
            mapped_outcomes.setdefault(o.outcome_id, {"outcome": o, "levels": set()})
            mapped_outcomes[o.outcome_id]["levels"].add(mp.mastery_level)

    max_bloom_seen = 0
    for entry in mapped_outcomes.values():
        o, levels = entry["outcome"], entry["levels"]
        verb = _leading_verb(o.outcome_text)
        if verb in NON_MEASURABLE:
            findings.append(_finding(
                f"measurable_verb:{o.outcome_code}", "warning", False,
                f"{o.outcome_code} opens with '{verb}': not observable/measurable. "
                f"Swap for a Bloom action verb (e.g., 'explain', 'apply', 'evaluate').",
                ["bloom", "writing"],
            ))
            continue
        bloom = VERB_TO_LEVEL.get(verb)
        if bloom is None:
            findings.append(_finding(
                f"unclassified_verb:{o.outcome_code}", "suggestion", False,
                f"{o.outcome_code} opens with '{verb}', which isn't in the Bloom verb lists: "
                f"consider a standard action verb so the level is unambiguous.",
                ["bloom", "writing"],
            ))
            continue
        rank = BLOOM_RANK[bloom]
        max_bloom_seen = max(max_bloom_seen, rank)
        top_mastery = max(levels, key=lambda l: MASTERY_MIN_BLOOM[l])
        required = MASTERY_MIN_BLOOM[top_mastery]
        if rank < required:
            findings.append(_finding(
                f"bloom_mastery_mismatch:{o.outcome_code}", "warning", False,
                f"{o.outcome_code} is mapped at '{MASTERY_LABELS[top_mastery]}' but its verb "
                f"'{verb}' is {bloom}-level (Bloom). A {MASTERY_LABELS[top_mastery].lower()} outcome "
                f"should use at least an {'apply' if required == 3 else 'analyze'}-level verb.",
                ["bloom", "outcomes"],
            ))

    if mapped_outcomes and max_bloom_seen and max_bloom_seen <= 2:
        findings.append(_finding(
            "bloom_ceiling", "suggestion", False,
            "No outcome in this course rises above understand-level (Bloom). "
            "Consider at least one apply/analyze-level outcome.",
            ["bloom", "outcomes"],
        ))

    # --- scaffolding: mastery should not decrease across module order ---
    module_order = {m.node_id: i for i, m in enumerate(modules)}
    mastery_rank = {MasteryLevel.introduced: 1, MasteryLevel.reinforced: 2, MasteryLevel.mastered: 3}
    seq = sorted(
        ((module_order[mp.module_node_id], mastery_rank[mp.mastery_level], mp)
         for mp in mappings if mp.module_node_id in module_order),
        key=lambda t: t[0],
    )
    peak = 0
    drops = set()
    for idx, rank, _mp in seq:
        if rank < peak - 1:  # allow one-step variation; flag hard drops
            drops.add(modules[idx].node_name)
        peak = max(peak, rank)
    for name in sorted(drops):
        findings.append(_finding(
            f"scaffold_drop:{name}", "suggestion", False,
            f"'{name}' maps outcomes at a lower mastery level than earlier modules reached: "
            f"check whether the module order still scaffolds upward.",
            ["module-design", "outcomes"],
        ))

    # --- alignment: every mapped outcome assessed somewhere; every assessment mapped ---
    act_by_id = {a.activity_id: a for a in activities}
    assessed_outcomes = {
        mp.target_outcome_id for mp in mappings
        if mp.activity_id and act_by_id.get(mp.activity_id)
        and act_by_id[mp.activity_id].activity_type == ActivityType.assessment
    }
    for entry in mapped_outcomes.values():
        o = entry["outcome"]
        if o.outcome_id not in assessed_outcomes:
            findings.append(_finding(
                f"unassessed_outcome:{o.outcome_code}", "warning", False,
                f"{o.outcome_code} is taught but never assessed: no assessment activity maps to it.",
                ["assessment", "qm"],
            ))
    mapped_activity_ids = {mp.activity_id for mp in mappings if mp.activity_id}
    for a in activities:
        if a.activity_type == ActivityType.assessment and a.activity_id not in mapped_activity_ids:
            findings.append(_finding(
                f"unmapped_assessment:{a.activity_name}", "suggestion", False,
                f"Assessment '{a.activity_name}' is not mapped to any outcome.",
                ["assessment", "outcomes"],
            ))

    issues = [f for f in findings if not f["passed"]]
    return {
        "node_id": course_node.node_id,
        "node_name": course_node.node_name,
        "healthy": len(issues) == 0,
        "summary": (f"{len(issues)} recommendation(s)" if issues
                    else "Module organization looks sound: no recommendations."),
        "findings": findings,
    }
