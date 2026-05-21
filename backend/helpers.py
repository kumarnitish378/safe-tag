"""Shared helpers: tag id generation, auth-token issuing, validators, decorators."""
import re
import secrets
import string
from datetime import datetime
from functools import wraps

from flask import current_app, g, jsonify, request

from models import AuthToken, Manufacturer, User, db

# -----------------------------------------------------------------------------
# Tag ID generation
# -----------------------------------------------------------------------------
TAG_ID_ALPHABET = string.ascii_uppercase + string.digits  # excludes lowercase to avoid camera OCR ambiguity


def generate_tag_id(length: int = 8) -> str:
    """8-char uppercase alphanumeric tag id."""
    return "".join(secrets.choice(TAG_ID_ALPHABET) for _ in range(length))


def generate_security_key() -> str:
    """12-byte URL-safe token (≈16 chars)."""
    return secrets.token_urlsafe(12)


# -----------------------------------------------------------------------------
# Validation helpers
# -----------------------------------------------------------------------------
INDIA_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"}
ALLOWED_CATEGORIES = {"keychain", "card", "sticker", "wristband"}
ALLOWED_ORDER_STATUS = {"pending", "dispatched", "delivered", "cancelled"}


def normalise_mobile(raw):
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits or None


def is_valid_mobile(raw):
    digits = normalise_mobile(raw)
    return digits is not None and bool(INDIA_MOBILE_RE.match(digits))


def is_valid_email(raw):
    return bool(raw) and bool(EMAIL_RE.match(raw.strip()))


def collect_errors(validations):
    """Run a list of (key, ok, message) tuples and return dict of errors."""
    return {k: msg for k, ok, msg in validations if not ok}


# -----------------------------------------------------------------------------
# Auth helpers (token-based)
# -----------------------------------------------------------------------------
def issue_user_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.session.add(AuthToken(token=token, user_id=user.id))
    db.session.commit()
    return token


def issue_manufacturer_token(manufacturer: Manufacturer) -> str:
    token = secrets.token_urlsafe(32)
    db.session.add(AuthToken(token=token, manufacturer_id=manufacturer.id))
    db.session.commit()
    return token


def _token_from_request():
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.headers.get("X-Auth-Token") or None


def _load_token():
    token = _token_from_request()
    if not token:
        return None
    rec = AuthToken.query.filter_by(token=token).first()
    if rec:
        rec.last_used_at = datetime.utcnow()
        db.session.commit()
    return rec


def current_user_record():
    if "auth_token_record" not in g:
        g.auth_token_record = _load_token()
    rec = g.auth_token_record
    return rec.user if rec else None


def current_manufacturer_record():
    if "auth_token_record" not in g:
        g.auth_token_record = _load_token()
    rec = g.auth_token_record
    return rec.manufacturer if rec else None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user_record()
        if not user or not user.is_active:
            return jsonify({"ok": False, "message": "Authentication required"}), 401
        g.current_user = user
        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user_record()
        if not user or not user.is_admin:
            return jsonify({"ok": False, "message": "Admin only"}), 403
        g.current_user = user
        return f(*args, **kwargs)

    return wrapper


def manufacturer_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        mfr = current_manufacturer_record()
        if not mfr:
            return jsonify({"ok": False, "message": "Manufacturer authentication required"}), 401
        if mfr.is_blocked:
            return jsonify({"ok": False, "message": "Manufacturer account blocked"}), 403
        if not mfr.is_approved:
            return jsonify({"ok": False, "message": "Manufacturer account pending approval"}), 403
        g.current_manufacturer = mfr
        return f(*args, **kwargs)

    return wrapper


def internal_only(f):
    """Restrict a route to requests carrying the Node.js internal token.

    Useful where the Node.js layer proxies sensitive admin-listings work.
    """

    @wraps(f)
    def wrapper(*args, **kwargs):
        expected = current_app.config.get("INTERNAL_API_TOKEN")
        if expected and request.headers.get("X-Internal-Token") != expected:
            return jsonify({"ok": False, "message": "Forbidden"}), 403
        return f(*args, **kwargs)

    return wrapper
