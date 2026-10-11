"""MCP server for the FHSU Curriculum Mapping System.

Lets any MCP client (Claude Code, Claude Desktop, claude.ai connectors) drive
the curriculum data conversationally — search, node detail, taxonomy compliance,
module-organization advice, and the curated resource library — with the same
scope enforcement as the web UI.

Run (stdio):  .venv/bin/python mcp_server.py
Scope:        set CMS_MCP_USERNAME to one of the seeded users
              (admin_test / editor_test / viewer_test; default viewer_test).

Claude Code registration:
  claude mcp add fhsu-curriculum -- <repo>/backend/.venv/bin/python <repo>/backend/mcp_server.py
"""
import os

from mcp.server.mcpserver import MCPServer
from sqlmodel import Session, select

from app import advise as advise_mod
from app import compliance as compliance_mod
from app.database import engine, init_db
from app.models import Node, Resource, User
from app.tree import build_tree, is_descendant_or_self

mcp = MCPServer("fhsu-curriculum")

USERNAME = os.environ.get("CMS_MCP_USERNAME", "viewer_test")


def _scope(session: Session) -> int:
    user = session.exec(select(User).where(User.username == USERNAME)).first()
    if not user:
        raise ValueError(f"Unknown CMS_MCP_USERNAME '{USERNAME}'")
    return user.scope_node_id


def _in_scope(session: Session, node_id: int) -> bool:
    return is_descendant_or_self(session, node_id, _scope(session))


@mcp.tool()
def search_curriculum(query: str, limit: int = 15) -> list[dict]:
    """Search colleges, departments, programs, courses, and modules by name or
    course title. Returns each hit with its node id, type, and full path."""
    from app.models import Course
    with Session(engine) as s:
        nodes = s.exec(select(Node)).all()
        titles = {c.node_id: c.course_title for c in s.exec(select(Course)).all()}
        ql = query.lower()
        out = []
        for n in nodes:
            if (ql in n.node_name.lower() or ql in titles.get(n.node_id, "").lower()) \
                    and _in_scope(s, n.node_id):
                path, cur = [], n.node_id
                while cur is not None:
                    node = s.get(Node, cur)
                    path.append(node.node_name)
                    cur = node.parent_node_id
                out.append({"id": n.node_id, "name": n.node_name,
                            "type": n.node_type.value,
                            "course_title": titles.get(n.node_id),
                            "path": list(reversed(path))})
                if len(out) >= limit:
                    break
        return out


@mcp.tool()
def get_node(node_id: int) -> dict:
    """Full subtree JSON for one node (children, outcomes, activities). Use ids
    from search_curriculum."""
    with Session(engine) as s:
        if not _in_scope(s, node_id):
            return {"error": "Node outside the configured user's permission scope"}
        tree = build_tree(s, root_node_id=node_id)
        return tree or {"error": "Node not found"}


@mcp.tool()
def check_compliance(node_id: int) -> dict:
    """Check a course or module (or aggregate a department/college/program)
    against the university taxonomy format rules: course code format, module
    naming, outcome mapping, assessment presence, orphaned outcomes."""
    with Session(engine) as s:
        n = s.get(Node, node_id)
        if not n:
            return {"error": "Node not found"}
        if not _in_scope(s, node_id):
            return {"error": "Node outside the configured user's permission scope"}
        return compliance_mod.check_node(s, n)


@mcp.tool()
def advise_course(node_id: int) -> dict:
    """Rule-based module-organization recommendations for a course: Bloom's
    taxonomy verb analysis of outcomes, mastery scaffolding across modules,
    module shape, and outcome/assessment alignment. Each finding carries
    resource_tags usable with search_resources."""
    with Session(engine) as s:
        n = s.get(Node, node_id)
        if not n or n.node_type.value != "course":
            return {"error": "advise_course requires a course node id"}
        if not _in_scope(s, node_id):
            return {"error": "Node outside the configured user's permission scope"}
        return advise_mod.advise_course(s, n)


@mcp.tool()
def search_resources(query: str = "", tag: str = "") -> list[dict]:
    """Curated accreditation/pedagogy references (Bloom's taxonomy, HLC criteria,
    Quality Matters, FHSU pages). Filter by keyword and/or tag
    (bloom, hlc, outcomes, module-design, assessment, qm, fhsu, writing)."""
    with Session(engine) as s:
        rows = s.exec(select(Resource)).all()
        ql, tl = query.lower(), tag.lower()
        out = []
        for r in rows:
            tags = [t.strip() for t in r.tags.split(",")]
            if tl and tl not in tags:
                continue
            if ql and ql not in f"{r.title} {r.source} {r.blurb} {r.tags}".lower():
                continue
            out.append({"title": r.title, "url": r.url, "source": r.source,
                        "tags": tags, "blurb": r.blurb})
        return out


if __name__ == "__main__":
    init_db()
    mcp.run()
