"""Auth: salted scrypt password hashes + HMAC-signed bearer tokens (stdlib only).

Token payload is "username:expiry_ts", signature is HMAC-SHA256 over it.
Set CMS_SECRET in any real deployment; with CMS_ENV=production the app refuses
to start on the built-in dev secret. Legacy unsalted-SHA256 hashes (from the
original seeded test users) still verify and are upgraded on next login.
"""
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .database import get_session
from .models import User

DEV_SECRET = "dev-secret-change-me"
SECRET = os.environ.get("CMS_SECRET", DEV_SECRET)
if os.environ.get("CMS_ENV") == "production" and SECRET == DEV_SECRET:
    raise RuntimeError("CMS_SECRET must be set to a long random value when CMS_ENV=production")
TOKEN_TTL_SECONDS = 8 * 3600

bearer = HTTPBearer(auto_error=False)


_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(pw.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    if stored.startswith("scrypt$"):
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt_hex), **_SCRYPT)
        return hmac.compare_digest(digest.hex(), digest_hex)
    # legacy unsalted sha256
    return hmac.compare_digest(hashlib.sha256(pw.encode()).hexdigest(), stored)


def needs_rehash(stored: str) -> bool:
    return not stored.startswith("scrypt$")


def _sign(payload: str) -> str:
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(username: str) -> str:
    payload = f"{username}:{int(time.time()) + TOKEN_TTL_SECONDS}"
    return f"{payload}:{_sign(payload)}"


def verify_token(token: str) -> Optional[str]:
    try:
        username, exp, sig = token.rsplit(":", 2)
    except ValueError:
        return None
    payload = f"{username}:{exp}"
    if not hmac.compare_digest(_sign(payload), sig):
        return None
    if int(exp) < time.time():
        return None
    return username


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    username = verify_token(creds.credentials)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


def require_editor(user: User = Depends(get_current_user)) -> User:
    if user.role.value not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Read-only role")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user
