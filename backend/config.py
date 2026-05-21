"""Flask configuration loaded from environment variables."""
import os

from dotenv import load_dotenv

# Load .env from backend directory (one level above config.py if config sits at root)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def _bool(val, default=False):
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
    # Render injects postgres:// URLs; SQLAlchemy 1.4+ needs postgresql://
    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")

    # Internal trust token used by Node.js → Flask. The Node frontend sends it in
    # X-Internal-Token so the API knows the request originates from the trusted
    # session-aware layer.
    INTERNAL_API_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "dev-internal-token")

    # Payments
    DUMMY_PAYMENT = _bool(os.environ.get("DUMMY_PAYMENT"), default=True)
    RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

    # Twilio
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")

    # Mail
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = _bool(os.environ.get("MAIL_USE_TLS"), default=True)
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "no-reply@safe-tag.in")

    # Cloudinary / Maps / Sentry
    CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "")
    GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

    # Cookies / sessions (Flask still uses sessions for CSRF + Flask-Login fallbacks)
    SESSION_COOKIE_SECURE = _bool(os.environ.get("SESSION_COOKIE_SECURE"), default=False)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # CSRF: disabled on JSON APIs because the trust boundary is the
    # X-Internal-Token header rather than a same-origin form post.
    WTF_CSRF_ENABLED = False

    # Rate limiter storage — defaults to in-memory; override with REDIS_URL in prod
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
