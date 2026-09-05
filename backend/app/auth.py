"""Minimal auth for the MVP: 3 hardcoded test users (seeded in DB) + HMAC-signed bearer tokens.

Stdlib-only token scheme (no python-jose dependency): payload is
"username:expiry_ts", signature is HMAC-SHA256 over it. Replace with Supabase
auth / real JWT when moving past hardcoded users.
"""
import hashlib
import hmac
import os
import time
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .database import get_session
from .models import User

SECRET = os.environ.get("CMS_SECRET", "dev-secret-change-me")
TOKEN_TTL_SECONDS = 8 * 3600

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


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
