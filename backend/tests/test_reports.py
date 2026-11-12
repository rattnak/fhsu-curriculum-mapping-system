import pytest


@pytest.mark.parametrize("path", ["coverage", "rigidity", "orphans"])
def test_reports_return_json_for_each_role(client, admin, editor, viewer, path):
    for h in (admin, editor, viewer):
        r = client.get(f"/reports/{path}", headers=h)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)


def test_reports_require_auth(client):
    assert client.get("/reports/coverage").status_code == 401


def test_seeded_gaps_are_reported(client, admin):
    body = client.get("/reports/orphans", headers=admin).json()
    assert any(body.values()), "seed deliberately contains orphans and dead-ends"
