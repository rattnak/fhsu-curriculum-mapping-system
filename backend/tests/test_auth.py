import time

from app import auth


def test_scrypt_hash_roundtrip_and_salting():
    a, b = auth.hash_password("correct horse"), auth.hash_password("correct horse")
    assert a.startswith("scrypt$") and a != b
    assert auth.verify_password("correct horse", a)
    assert not auth.verify_password("wrong", a)


def test_legacy_sha256_hash_still_verifies_and_is_flagged():
    import hashlib
    legacy = hashlib.sha256(b"admin123").hexdigest()
    assert auth.verify_password("admin123", legacy)
    assert auth.needs_rehash(legacy)
    assert not auth.needs_rehash(auth.hash_password("x"))


def test_token_roundtrip_tamper_and_expiry(monkeypatch):
    token = auth.make_token("alice")
    assert auth.verify_token(token) == "alice"
    assert auth.verify_token(token[:-2] + "00") is None
    assert auth.verify_token("garbage") is None
    real = time.time()
    monkeypatch.setattr(auth.time, "time", lambda: real + auth.TOKEN_TTL_SECONDS + 60)
    assert auth.verify_token(token) is None


def test_login_flow(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.post("/login", json={"username": "admin_test", "password": "nope"}).status_code == 401
    assert client.get("/curriculum").status_code == 401
    assert client.get("/curriculum", headers={"Authorization": "Bearer bad"}).status_code == 401
