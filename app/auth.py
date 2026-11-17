"""JWT helpers for single-admin authentication."""
from __future__ import annotations

import time

import jwt

from . import config as C

_SKIP_PATHS = {"/api/login", "/api/health", "/"}


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + C.JWT_EXPIRY_HOURS * 3600,
    }
    return jwt.encode(payload, C.JWT_SECRET, algorithm=C.JWT_ALGORITHM)


def verify_token(token: str) -> str | None:
    """Return username if token is valid, None otherwise."""
    try:
        data = jwt.decode(token, C.JWT_SECRET, algorithms=[C.JWT_ALGORITHM])
        return data.get("sub")
    except jwt.PyJWTError:
        return None


def is_public_path(path: str) -> bool:
    return path in _SKIP_PATHS or path.startswith("/static")
