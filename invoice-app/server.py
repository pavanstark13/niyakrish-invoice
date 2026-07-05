"""Secure backend for the Niyakrish invoice application."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("INVOICE_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.getenv("INVOICE_DB_PATH", DATA_DIR / "niyakrish-invoice.sqlite3"))
SESSION_COOKIE = "ni_session"
SESSION_TTL_SECONDS = int(os.getenv("INVOICE_SESSION_TTL_SECONDS", "28800"))
MAX_BODY_BYTES = int(os.getenv("INVOICE_MAX_BODY_BYTES", str(8 * 1024 * 1024)))
COOKIE_SECURE = os.getenv("INVOICE_COOKIE_SECURE", "false").lower() == "true"
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

DATA_KEYS = {
    "invoices",
    "invoice_customers",
    "invoice_payments",
    "invoice_gatepasses",
    "invoice_seq",
    "gp_seq",
    "company_settings",
    "quotations",
    "purchase_orders",
    "quote_seq",
    "po_seq",
}


class LoginPayload(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangePayload(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    username: str = Field(min_length=1, max_length=80)
    new_password: str = Field(min_length=12, max_length=256)


class DataPayload(BaseModel):
    value: str = Field(max_length=MAX_BODY_BYTES)


class Session:
    def __init__(self, username: str, csrf_token: str) -> None:
        self.username = username
        self.csrf_token = csrf_token


app = FastAPI(title="Niyakrish Invoice Backend", docs_url=None, redoc_url=None)
_rate_windows: dict[str, deque[float]] = defaultdict(deque)


def _utc_now() -> int:
    return int(time.time())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390_000)
    return "pbkdf2_sha256$390000${}${}".format(
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, rounds_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_raw)
        expected = base64.b64decode(digest_raw)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(rounds_raw),
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


@contextmanager
def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              id_hash TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              csrf_token TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kv_store (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            );
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count == 0:
            username = os.getenv("INVOICE_ADMIN_USERNAME", "admin")
            password = os.getenv("INVOICE_ADMIN_PASSWORD")
            if not password:
                if ENVIRONMENT == "production":
                    raise RuntimeError("Set INVOICE_ADMIN_PASSWORD before starting in production")
                password = "Niyakrish@690"
            now = _utc_now()
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (username, _hash_password(password), now, now),
            )


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return Response("Request too large", status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    client = request.client.host if request.client else "unknown"
    bucket = f"{client}:{request.url.path}"
    limit = 12 if request.url.path == "/api/auth/login" else 180
    now = time.monotonic()
    window = _rate_windows[bucket]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        return Response("Too many requests", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    window.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    )
    if COOKIE_SECURE:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def get_session(ni_session: Annotated[str | None, Cookie()] = None) -> Session:
    if not ni_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    with db() as conn:
        row = conn.execute(
            "SELECT username, csrf_token, expires_at FROM sessions WHERE id_hash = ?",
            (_hash_token(ni_session),),
        ).fetchone()
        if not row or row["expires_at"] < _utc_now():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
        return Session(username=row["username"], csrf_token=row["csrf_token"])


def get_optional_session(ni_session: Annotated[str | None, Cookie()] = None) -> Session | None:
    try:
        return get_session(ni_session)
    except HTTPException:
        return None


def require_csrf(
    session: Annotated[Session, Depends(get_session)],
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> Session:
    if not x_csrf_token or not hmac.compare_digest(x_csrf_token, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return session


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="strict", secure=COOKIE_SECURE)


def _valid_key(key: str) -> str:
    if key not in DATA_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown data key")
    return key


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/session")
def session_status(session: Annotated[Session | None, Depends(get_optional_session)] = None) -> dict[str, object]:
    if not session:
        return {"authenticated": False}
    return {"authenticated": True, "username": session.username, "csrfToken": session.csrf_token}


@app.post("/api/auth/login")
def login(payload: LoginPayload, response: Response) -> dict[str, object]:
    with db() as conn:
        row = conn.execute(
            "SELECT username, password_hash FROM users WHERE username = ?",
            (payload.username,),
        ).fetchone()
        if not row or not _verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        raw_session = secrets.token_urlsafe(48)
        csrf_token = secrets.token_urlsafe(32)
        now = _utc_now()
        conn.execute(
            "INSERT INTO sessions (id_hash, username, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
            (_hash_token(raw_session), row["username"], csrf_token, now + SESSION_TTL_SECONDS, now),
        )
    _set_session_cookie(response, raw_session)
    return {"authenticated": True, "username": row["username"], "csrfToken": csrf_token}


@app.post("/api/auth/logout")
def logout(
    response: Response,
    session: Annotated[Session, Depends(require_csrf)],
    ni_session: Annotated[str | None, Cookie()] = None,
) -> dict[str, bool]:
    if ni_session:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE id_hash = ?", (_hash_token(ni_session),))
    _clear_session_cookie(response)
    return {"ok": True}


@app.post("/api/auth/password")
def change_password(
    payload: PasswordChangePayload,
    session: Annotated[Session, Depends(require_csrf)],
) -> dict[str, object]:
    with db() as conn:
        row = conn.execute(
            "SELECT username, password_hash FROM users WHERE username = ?",
            (session.username,),
        ).fetchone()
        if not row or not _verify_password(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
        now = _utc_now()
        conn.execute(
            "UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE username = ?",
            (payload.username, _hash_password(payload.new_password), now, session.username),
        )
        conn.execute("DELETE FROM sessions WHERE username = ?", (session.username,))
    return {"ok": True, "username": payload.username}


@app.post("/api/auth/verify")
def verify_password(
    payload: LoginPayload,
    session: Annotated[Session, Depends(require_csrf)],
) -> dict[str, bool]:
    if payload.username != session.username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    with db() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = ?",
            (session.username,),
        ).fetchone()
    if not row or not _verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {"ok": True}


@app.get("/api/data/{key}")
def read_value(key: str, session: Annotated[Session, Depends(get_session)]) -> dict[str, object]:
    key = _valid_key(key)
    with db() as conn:
        row = conn.execute("SELECT value, updated_at FROM kv_store WHERE key = ?", (key,)).fetchone()
    if not row:
        return {"key": key, "value": None, "updatedAt": None}
    return {"key": key, "value": row["value"], "updatedAt": row["updated_at"]}


@app.put("/api/data/{key}")
def write_value(
    key: str,
    payload: DataPayload,
    session: Annotated[Session, Depends(require_csrf)],
) -> dict[str, object]:
    key = _valid_key(key)
    now = _utc_now()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (key, payload.value, now),
        )
    return {"ok": True, "key": key, "updatedAt": now}


@app.get("/api/data")
def read_all(session: Annotated[Session, Depends(get_session)]) -> dict[str, dict[str, object]]:
    with db() as conn:
        rows = conn.execute("SELECT key, value, updated_at FROM kv_store").fetchall()
    return {row["key"]: {"value": row["value"], "updatedAt": row["updated_at"]} for row in rows}


@app.delete("/api/data")
def wipe_data(session: Annotated[Session, Depends(require_csrf)]) -> dict[str, bool]:
    with db() as conn:
        conn.execute("DELETE FROM kv_store")
    return {"ok": True}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
