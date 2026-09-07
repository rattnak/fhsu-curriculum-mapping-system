"""Multi-scope permission helpers.

A user's effective access = primary scope (role viewer -> view, editor -> edit)
plus every UserScope grant. Admins can view and edit everything. Access cascades
down the node tree from each granted scope node.
"""
from typing import Optional

from sqlmodel import Session, select

from .models import Role, User, UserScope
from .tree import is_descendant_or_self


def is_admin(user: User) -> bool:
    return user.role == Role.admin


def scope_grants(session: Session, user: User) -> list[tuple[int, str]]:
    """[(scope_node_id, 'view'|'edit'), ...] for a non-admin user."""
    grants = []
    if user.scope_node_id is not None:
        grants.append((user.scope_node_id, "view" if user.role == Role.viewer else "edit"))
    for us in session.exec(select(UserScope).where(UserScope.user_id == user.user_id)).all():
        grants.append((us.scope_node_id, "edit" if us.access == "edit" else "view"))
    return grants


def can_view(session: Session, user: User, node_id: int) -> bool:
    if is_admin(user):
        return True
    return any(is_descendant_or_self(session, node_id, s) for s, _ in scope_grants(session, user))


def can_edit(session: Session, user: User, node_id: int) -> bool:
    if is_admin(user):
        return True
    return any(a == "edit" and is_descendant_or_self(session, node_id, s)
               for s, a in scope_grants(session, user))


def default_scope(session: Session, user: User) -> Optional[int]:
    """Node id to root reports/searches at when the caller names none."""
    if user.scope_node_id is not None:
        return user.scope_node_id
    grants = scope_grants(session, user)
    return grants[0][0] if grants else None
