"""Create the first real admin for a fresh deployment.

    cd backend && python -m app.create_admin <username> "<First>" "<Last>"

Prompts for the password (not echoed). The admin is scoped to the institution
root node, so seed the database first (CMS_SEED_TEST_USERS=0 python -m app.seed).
Further users are added from the Users view or via invite links.
"""
import getpass
import sys

from sqlmodel import Session, select

from .auth import hash_password
from .database import engine, init_db
from .models import Node, NodeType, Role, User


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    username, first, last = sys.argv[1:4]
    init_db()
    with Session(engine) as s:
        if s.exec(select(User).where(User.username == username)).first():
            sys.exit(f"User {username!r} already exists.")
        root = s.exec(select(Node).where(Node.node_type == NodeType.institution)).first()
        if not root:
            sys.exit("No institution node found; run `python -m app.seed` first.")
        pw = getpass.getpass("Password: ")
        if len(pw) < 12 or pw != getpass.getpass("Confirm: "):
            sys.exit("Passwords must match and be at least 12 characters.")
        s.add(User(username=username, first_name=first, last_name=last,
                   password_hash=hash_password(pw), role=Role.admin, scope_node_id=root.node_id))
        s.commit()
        print(f"Created admin {username!r} scoped to {root.node_name}.")


if __name__ == "__main__":
    main()
