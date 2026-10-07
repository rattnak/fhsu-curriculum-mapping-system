"""SQLModel schema for the FHSU curriculum mapping MVP.

Hierarchy is a self-referential Node tree:
  institution -> college_dept_grouping -> college -> department -> program -> course -> module
Course/Module rows also live in the Node table (so the tree query is one recursive walk);
the Course table carries course-specific fields and points back at its node.

The "program" (degree/major) level sits between department and course: a
department can offer many real catalog programs (e.g. multiple BA/BFA/BS
options), each hosting its own courses.
"""
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class NodeType(str, Enum):
    institution = "institution"
    college_dept_grouping = "college_dept_grouping"
    college = "college"
    department = "department"
    program = "program"
    course = "course"
    module = "module"


class OutcomeLevel(str, Enum):
    institutional = "institutional"
    program = "program"
    course = "course"
    module = "module"


class ActivityType(str, Enum):
    learning_activity = "learning_activity"
    assessment = "assessment"


class MasteryLevel(str, Enum):
    introduced = "Introduced"
    reinforced = "Reinforced"
    mastered = "Mastered"


# Display labels for the mastery scale, keyed by enum member. FHSU departments use
# different scale wordings (Nursing: Introduce/Develop/Mastery), so UI/report labels
# read from here — rename per pilot department without a migration or admin UI.
MASTERY_LABELS = {
    MasteryLevel.introduced: "Introduced",
    MasteryLevel.reinforced: "Reinforced",
    MasteryLevel.mastered: "Mastered",
}


class ActionItemStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class Role(str, Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class ApprovalStatus(str, Enum):
    """New program/course/module nodes start pending and need sign-off from an
    editor scoped at the grandparent level (or an admin) before they join the
    tree everyone else sees. Colleges/departments are never created through the
    app, so they're always active."""
    active = "active"
    pending = "pending"


class Node(SQLModel, table=True):
    node_id: Optional[int] = Field(default=None, primary_key=True)
    node_type: NodeType
    node_name: str
    parent_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")
    modality_tag: Optional[str] = None
    degree_type: Optional[str] = None  # e.g. "Bachelor of Arts" — set on program nodes only
    sort_order: int = Field(default=0)
    status: ApprovalStatus = Field(default=ApprovalStatus.active)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="user.user_id")


class Course(SQLModel, table=True):
    course_id: Optional[int] = Field(default=None, primary_key=True)
    course_title: str
    credit_hours: int = 3
    owning_node_id: int = Field(foreign_key="node.node_id")  # program node
    node_id: int = Field(foreign_key="node.node_id")  # this course's own tree node


class Outcome(SQLModel, table=True):
    outcome_id: Optional[int] = Field(default=None, primary_key=True)
    outcome_level: OutcomeLevel
    outcome_code: str  # e.g. "PLO2", "MLO1.1"
    outcome_text: str
    hlc_criterion_tag: Optional[str] = None
    parent_outcome_id: Optional[int] = Field(default=None, foreign_key="outcome.outcome_id")
    owning_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")


class Activity(SQLModel, table=True):
    activity_id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.course_id")
    module_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")
    activity_type: ActivityType
    activity_name: str


class Mapping(SQLModel, table=True):
    mapping_id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.course_id")
    target_outcome_id: int = Field(foreign_key="outcome.outcome_id")
    activity_id: Optional[int] = Field(default=None, foreign_key="activity.activity_id")
    module_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")
    mastery_level: MasteryLevel
    assessment_method: Optional[str] = None


class User(SQLModel, table=True):
    user_id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    first_name: str = ""
    last_name: str = ""
    password_hash: str  # sha256 for hardcoded test users; real hashing when real auth lands
    role: Role
    # primary scope; None for users whose access comes only from UserScope grants
    scope_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")


class Resource(SQLModel, table=True):
    """Curated accreditation / pedagogy reference library (not live web search)."""
    resource_id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    url: str
    source: str
    tags: str  # comma-separated: bloom, hlc, outcomes, module-design, fhsu, assessment, qm
    blurb: str = ""


class ActionItem(SQLModel, table=True):
    """A 'closing the loop' commitment against a program-level outcome, mirroring
    the action-item tables FHSU departments already track by hand in their annual
    assessment reports (short title, person responsible, target date, status)."""
    action_item_id: Optional[int] = Field(default=None, primary_key=True)
    outcome_id: int = Field(foreign_key="outcome.outcome_id")  # the PLO this addresses
    short_title: str
    description: str = ""  # "Brief Description with Rationale" in the source reports
    person_responsible: str = ""
    target_date: str = ""  # free text, e.g. "Fall 2025" — assessment cycles aren't calendar dates
    resources_needed: str = ""
    status: ActionItemStatus = Field(default=ActionItemStatus.open)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="user.user_id")
    created_at: float = 0.0


class UserScope(SQLModel, table=True):
    """Extra access grants beyond the user's primary scope. A user can hold any mix:
    an entire college, single departments across colleges, view here and edit there.
    Admins bypass grants entirely."""
    user_scope_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.user_id")
    scope_node_id: int = Field(foreign_key="node.node_id")
    access: str = "view"  # 'view' | 'edit'


class Invite(SQLModel, table=True):
    """One-time confirmation link for account activation — a stopgap until
    real institutional SSO/email auth exists. An admin or editor issues one
    with a role (+ optional single scope grant) baked in but no identity; the
    invitee supplies their own name/username/password at accept time. Single
    use: used_at is set the moment it's redeemed, and a token can never be
    redeemed twice."""
    invite_id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(index=True, unique=True)
    role: Role
    scope_node_id: Optional[int] = Field(default=None, foreign_key="node.node_id")
    access: Optional[str] = None  # 'view' | 'edit'; set only when scope_node_id is set
    created_by_user_id: int = Field(foreign_key="user.user_id")
    created_at: float
    expires_at: float
    used_at: Optional[float] = None
    used_by_user_id: Optional[int] = Field(default=None, foreign_key="user.user_id")
