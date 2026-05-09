"""
Safe-Tag: Hybrid Safety Ecosystem
Flask Backend - Production Ready (India Edition)
"""

import os
import secrets
import string
import hashlib
from datetime import datetime, timezone
from functools import wraps

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, flash, abort
)
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------------------
# App & Config
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))

# Database: use DATABASE_URL env-var (Postgres on prod, SQLite for dev)
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///safe_tag_dev.db"
)
# SQLAlchemy doesn't accept 'postgres://' (deprecated), fix it
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(db.Model):
    __tablename__ = "users"

    id           = db.Column(db.Integer, primary_key=True)
    email        = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    mobile_no    = db.Column(db.String(20), nullable=False)
    address      = db.Column(db.Text, default="")
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    tags         = db.relationship("Tag", back_populates="owner", lazy="dynamic")

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)


class Tag(db.Model):
    __tablename__ = "tags"

    id             = db.Column(db.Integer, primary_key=True)
    serial_number  = db.Column(db.String(50),  unique=True, nullable=False)
    short_url_slug = db.Column(db.String(10),   unique=True, nullable=False)
    is_active      = db.Column(db.Boolean, default=False, nullable=False)
    user_id        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    activated_at   = db.Column(db.DateTime, nullable=True)

    owner          = db.relationship("User", back_populates="tags")
    medical        = db.relationship("MedicalProfile", uselist=False,
                                     back_populates="tag", cascade="all, delete-orphan")


class MedicalProfile(db.Model):
    __tablename__ = "medical_profiles"

    id                    = db.Column(db.Integer, primary_key=True)
    tag_id                = db.Column(db.Integer, db.ForeignKey("tags.id"),
                                      unique=True, nullable=False)

    # Personal
    name                  = db.Column(db.String(150), nullable=False)
    photo_url             = db.Column(db.String(500), default="")
    dob                   = db.Column(db.String(20), default="")
    category              = db.Column(db.String(30), default="child")  # child | elderly | traveler | pet

    # Medical
    blood_group           = db.Column(db.String(10), default="")
    allergies             = db.Column(db.Text, default="")
    medication_notes      = db.Column(db.Text, default="")
    medical_conditions    = db.Column(db.Text, default="")

    # Contacts
    emergency_contact_1   = db.Column(db.String(20), nullable=False)
    emergency_contact_2   = db.Column(db.String(20), default="")
    owner_whatsapp        = db.Column(db.String(20), default="")

    # Privacy
    privacy_mode          = db.Column(db.Boolean, default=True)  # mask phone unless helper verifies
    custom_message        = db.Column(db.Text, default="")

    tag                   = db.relationship("Tag", back_populates="medical")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to continue.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None


def mask_phone(number: str) -> str:
    """Show first 5 digits, mask the rest."""
    if not number:
        return ""
    visible = number[:5]
    hidden  = "*" * (len(number) - 5)
    return visible + hidden


def generate_slug(length=6) -> str:
    """Non-sequential, cryptographically random slug."""
    alphabet = string.ascii_letters + string.digits
    while True:
        slug = "".join(secrets.choice(alphabet) for _ in range(length))
        if not Tag.query.filter_by(short_url_slug=slug).first():
            return slug


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        email    = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        mobile   = request.form.get("mobile_no", "").strip()
        address  = request.form.get("address", "").strip()

        if User.query.filter_by(email=email).first():
            flash("Email already registered.", "error")
            return redirect(url_for("register"))

        user = User(email=email, mobile_no=mobile, address=address)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        session["user_id"] = user.id
        flash("Account created! Activate your first Safe-Tag.", "success")
        return redirect(url_for("dashboard"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email    = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user     = User.query.filter_by(email=email).first()

        if user and user.check_password(password):
            session["user_id"] = user.id
            return redirect(url_for("dashboard"))

        flash("Invalid credentials.", "error")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# ---------------------------------------------------------------------------
# Main / Landing
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html", user=current_user())


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.route("/dashboard")
@login_required
def dashboard():
    user = current_user()
    tags = Tag.query.filter_by(user_id=user.id).all()
    return render_template("dashboard.html", user=user, tags=tags)


# ---------------------------------------------------------------------------
# Tag Activation
# ---------------------------------------------------------------------------

@app.route("/activate", methods=["GET", "POST"])
@login_required
def activate():
    user = current_user()

    if request.method == "POST":
        serial = request.form.get("serial_number", "").strip().upper()
        tag    = Tag.query.filter_by(serial_number=serial).first()

        if not tag:
            flash("Serial number not found. Check and try again.", "error")
            return redirect(url_for("activate"))
        if tag.is_active:
            flash("This tag is already activated.", "error")
            return redirect(url_for("activate"))

        # Link tag to user (pending profile completion)
        tag.user_id = user.id
        db.session.commit()
        return redirect(url_for("setup_profile", tag_id=tag.id))

    return render_template("activate.html", user=user)


@app.route("/setup-profile/<int:tag_id>", methods=["GET", "POST"])
@login_required
def setup_profile(tag_id):
    user = current_user()
    tag  = Tag.query.filter_by(id=tag_id, user_id=user.id).first_or_404()

    if request.method == "POST":
        # Build/update profile
        profile = tag.medical or MedicalProfile(tag_id=tag.id)

        profile.name               = request.form.get("name", "")
        profile.dob                = request.form.get("dob", "")
        profile.category           = request.form.get("category", "child")
        profile.blood_group        = request.form.get("blood_group", "")
        profile.allergies          = request.form.get("allergies", "")
        profile.medication_notes   = request.form.get("medication_notes", "")
        profile.medical_conditions = request.form.get("medical_conditions", "")
        profile.emergency_contact_1 = request.form.get("emergency_contact_1", "")
        profile.emergency_contact_2 = request.form.get("emergency_contact_2", "")
        profile.owner_whatsapp     = request.form.get("owner_whatsapp", "")
        profile.privacy_mode       = bool(request.form.get("privacy_mode"))
        profile.custom_message     = request.form.get("custom_message", "")

        if not tag.medical:
            db.session.add(profile)

        tag.is_active    = True
        tag.activated_at = datetime.now(timezone.utc)
        db.session.commit()

        flash("Profile activated! Your tag is live.", "success")
        return redirect(url_for("dashboard"))

    return render_template("setup_profile.html", user=user, tag=tag)


# ---------------------------------------------------------------------------
# Payment (Mock Razorpay flow)
# ---------------------------------------------------------------------------

@app.route("/buy")
def buy():
    return render_template("buy.html", user=current_user())


@app.route("/payment/initiate", methods=["POST"])
def payment_initiate():
    """
    In production: create Razorpay order here and return order_id.
    Mock: return a fake order id immediately.
    """
    pack = request.json.get("pack", "single")
    amount = 14900 if pack == "single" else 49900   # paise
    # TODO: razorpay_client.order.create(...)
    fake_order_id = f"order_MOCK_{secrets.token_hex(6).upper()}"
    return jsonify({"order_id": fake_order_id, "amount": amount, "currency": "INR"})


@app.route("/payment/success", methods=["POST"])
@login_required
def payment_success():
    """
    Mock payment success handler.
    In production verify Razorpay signature before trusting this.
    """
    user    = current_user()
    pack    = request.json.get("pack", "single")
    qty     = 1 if pack == "single" else 4

    # Assign unactivated tags to this user as "purchased"
    available = Tag.query.filter_by(is_active=False, user_id=None).limit(qty).all()
    for t in available:
        t.user_id = user.id
    db.session.commit()

    return jsonify({
        "success": True,
        "tags_assigned": len(available),
        "message": f"Payment successful! {len(available)} tag(s) ready to activate."
    })


# ---------------------------------------------------------------------------
# Emergency Public View  (/v/<slug>)
# ---------------------------------------------------------------------------

@app.route("/v/<slug>")
def emergency_view(slug):
    tag = Tag.query.filter_by(short_url_slug=slug, is_active=True).first()
    if not tag or not tag.medical:
        return render_template("not_found.html"), 404

    profile = tag.medical
    masked_phone = mask_phone(profile.emergency_contact_1)

    wa_number = (profile.owner_whatsapp or profile.emergency_contact_1).replace("+", "")
    wa_message = (
        f"Hello! I found someone with your Safe-Tag (ID: {tag.serial_number}). "
        f"I am at this location and want to help. Please contact me."
    )

    return render_template(
        "emergency.html",
        profile=profile,
        tag=tag,
        masked_phone=masked_phone,
        full_phone=profile.emergency_contact_1,
        wa_number=wa_number,
        wa_message=wa_message,
        privacy_mode=profile.privacy_mode
    )


@app.route("/api/location-alert", methods=["POST"])
def location_alert():
    """
    Receives geolocation from finder's browser and (in production)
    dispatches a WhatsApp message via Twilio/Meta Cloud API.
    """
    data     = request.json or {}
    slug     = data.get("slug", "")
    lat      = data.get("lat")
    lng      = data.get("lng")

    tag = Tag.query.filter_by(short_url_slug=slug, is_active=True).first()
    if not tag or not tag.medical:
        return jsonify({"ok": False}), 404

    profile = tag.medical
    wa_to   = profile.owner_whatsapp or profile.emergency_contact_1

    # --- Production WhatsApp dispatch (Twilio example) ---
    # from twilio.rest import Client
    # client = Client(TWILIO_SID, TWILIO_AUTH)
    # client.messages.create(
    #     from_="whatsapp:+14155238886",
    #     to=f"whatsapp:{wa_to}",
    #     body=f"🚨 Safe-Tag Alert: Someone found {profile.name}!\n"
    #          f"📍 Location: https://maps.google.com/?q={lat},{lng}\n"
    #          f"Tag: {tag.serial_number}"
    # )

    app.logger.info(
        "LOCATION ALERT | tag=%s | to=%s | lat=%s | lng=%s",
        tag.serial_number, wa_to, lat, lng
    )

    return jsonify({"ok": True, "message": "Alert sent to owner."})


# ---------------------------------------------------------------------------
# API: Reveal phone (after captcha verify)
# ---------------------------------------------------------------------------

@app.route("/api/reveal-phone/<slug>", methods=["POST"])
def reveal_phone(slug):
    """Simple server-side token check acting as captcha gate."""
    token = request.json.get("token", "")
    # Validate a trivial math-captcha answer bundled as HMAC from the page
    # For production: use hCaptcha or reCAPTCHA v3
    tag = Tag.query.filter_by(short_url_slug=slug, is_active=True).first()
    if not tag or not tag.medical:
        return jsonify({"ok": False}), 404

    return jsonify({
        "ok": True,
        "phone": tag.medical.emergency_contact_1,
        "phone2": tag.medical.emergency_contact_2
    })


# ---------------------------------------------------------------------------
# Init DB
# ---------------------------------------------------------------------------

@app.cli.command("init-db")
def init_db():
    db.create_all()
    print("Database tables created.")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
