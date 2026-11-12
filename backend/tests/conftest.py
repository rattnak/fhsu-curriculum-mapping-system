"""Test fixtures: a throwaway SQLite database seeded once per session."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="cms-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["CMS_SEED_TEST_USERS"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session")
def client():
    seed()
    with TestClient(app) as c:
        yield c


def _login(client, username, password):
    r = client.post("/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return _login(client, "admin_test", "admin123")


@pytest.fixture(scope="session")
def editor(client):
    return _login(client, "editor_test", "editor123")


@pytest.fixture(scope="session")
def viewer(client):
    return _login(client, "viewer_test", "viewer123")
