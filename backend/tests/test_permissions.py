def test_everyone_gets_a_tree(client, admin, editor, viewer):
    for h in (admin, editor, viewer):
        r = client.get("/curriculum", headers=h)
        assert r.status_code == 200 and r.json()


def test_viewer_cannot_create(client, viewer):
    r = client.post("/courses", headers=viewer, json={"parent_id": 1, "name": "X 100", "title": "X"})
    assert r.status_code in (403, 422)


def test_admin_only_endpoints_reject_editor(client, editor):
    assert client.get("/users", headers=editor).status_code == 403
    assert client.post("/invites", headers=editor, json={}).status_code in (403, 422)


def test_admin_can_list_users(client, admin):
    r = client.get("/users", headers=admin)
    assert r.status_code == 200
    assert {"admin_test", "editor_test", "viewer_test"} <= {u["username"] for u in r.json()["users"]}


def test_viewer_scope_is_narrower_than_admin(client, admin, viewer):
    def count(node):
        return 1 + sum(count(c) for c in node.get("children", []))
    a = client.get("/curriculum", headers=admin).json()["tree"]
    v = client.get("/curriculum", headers=viewer).json()["tree"]
    assert count(a) > count(v)
