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


