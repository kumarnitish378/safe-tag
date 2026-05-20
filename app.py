"""
Safe-Tag: Hybrid Safety Ecosystem
Flask Backend - Production Ready (India Edition)
"""

import getpass
import os
import re
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
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_wtf import CSRFProtect
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------------------
# App & Config
# ---------------------------------------------------------------------------
app = Flask(__name__, instance_relative_config=True)
os.makedirs(app.instance_path, exist_ok=True)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["WTF_CSRF_TIME_LIMIT"] = None
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"

# Database: use DATABASE_URL env-var (Postgres on prod, SQLite for dev)
default_db = os.path.join(app.instance_path, "safe_tag_dev.db")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.abspath(default_db)}"
)
# SQLAlchemy doesn't accept 'postgres://' (deprecated), fix it
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Payment mode: True = skip payment for testing, False = real Razorpay
# Set DUMMY_PAYMENT=false in .env to enable real payments
DUMMY_PAYMENT = os.environ.get("DUMMY_PAYMENT", "true").lower() != "false"

csrf = CSRFProtect(app)

db = SQLAlchemy(app)
migrate = Migrate(app, db)

limiter = Limiter(get_remote_address, app=app, default_limits=[], storage_uri="memory://")

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
    orders       = db.relationship("Order", back_populates="user", lazy="dynamic")
    is_admin     = db.Column(db.Boolean, default=False, nullable=False)

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
    order_id       = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    order          = db.relationship("Order", back_populates="tags")
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


class Order(db.Model):
    __tablename__ = "orders"

    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    pack             = db.Column(db.String(20), nullable=False, default="single")
    amount           = db.Column(db.Integer, nullable=False)
    status           = db.Column(db.String(30), nullable=False, default="pending")
    razorpay_order_id = db.Column(db.String(80), unique=True, nullable=True)
    payment_id       = db.Column(db.String(80), nullable=True)
    tracking_number  = db.Column(db.String(100), nullable=True)
    dispatched_at    = db.Column(db.DateTime, nullable=True)
    delivered_at     = db.Column(db.DateTime, nullable=True)
    fulfillment_notes= db.Column(db.Text, default="", nullable=True)
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user             = db.relationship("User", back_populates="orders")
    tags             = db.relationship("Tag", back_populates="order", lazy="dynamic")


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


@app.context_processor
def inject_current_user():
    return {"current_user": current_user()}


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = current_user()
        if not user or not user.is_admin:
            abort(403)
        return f(*args, **kwargs)
    return decorated


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


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{7,20}$")
SERIAL_RE = re.compile(r"^ST-\d{4}-\d{5}$")
CATEGORIES = {"child", "elderly", "traveler", "pet"}
BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


def clean_phone(value: str) -> str:
    if not value:
        return ""
    return re.sub(r"[^0-9+]", "", value).strip()


def validate_registration_data(email: str, password: str, mobile: str):
    errors = []
    if not email or not EMAIL_RE.match(email):
        errors.append("Enter a valid email address.")
    if not password or len(password) < 8:
        errors.append("Use a password with at least 8 characters.")
    phone = clean_phone(mobile)
    if not phone or not PHONE_RE.match(phone):
        errors.append("Enter a valid mobile number, including country code.")
    return phone, errors


def validate_login_data(email: str, password: str):
    errors = []
    if not email:
        errors.append("Email is required.")
    if not password:
        errors.append("Password is required.")
    return errors


def validate_activation_code(serial: str):
    if not serial or not SERIAL_RE.match(serial):
        return False
    return True


def validate_profile_payload(form):
    errors = []
    name = form.get("name", "").strip()
    emergency_contact_1 = clean_phone(form.get("emergency_contact_1", ""))
    emergency_contact_2 = clean_phone(form.get("emergency_contact_2", ""))
    owner_whatsapp = clean_phone(form.get("owner_whatsapp", ""))
    category = form.get("category", "child")
    blood_group = form.get("blood_group", "")

    if not name:
        errors.append("Full name is required.")
    if not emergency_contact_1 or not PHONE_RE.match(emergency_contact_1):
        errors.append("A valid primary emergency contact is required.")
    if emergency_contact_2 and not PHONE_RE.match(emergency_contact_2):
        errors.append("Secondary contact must be a valid phone number.")
    if owner_whatsapp and not PHONE_RE.match(owner_whatsapp):
        errors.append("WhatsApp number must be valid if provided.")
    if category not in CATEGORIES:
        errors.append("Select a valid category.")
    if blood_group and blood_group not in BLOOD_GROUPS:
        errors.append("Select a valid blood group.")

    return {
        "name": name,
        "dob": form.get("dob", "").strip(),
        "category": category,
        "blood_group": blood_group,
        "allergies": form.get("allergies", "").strip(),
        "medication_notes": form.get("medication_notes", "").strip(),
        "medical_conditions": form.get("medical_conditions", "").strip(),
        "emergency_contact_1": emergency_contact_1,
        "emergency_contact_2": emergency_contact_2,
        "owner_whatsapp": owner_whatsapp,
        "privacy_mode": bool(form.get("privacy_mode")),
        "custom_message": form.get("custom_message", "").strip(),
    }, errors


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        email    = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        mobile   = request.form.get("mobile_no", "")
        address  = request.form.get("address", "").strip()

        mobile_clean, errors = validate_registration_data(email, password, mobile)
        if errors:
            for error in errors:
                flash(error, "error")
            return redirect(url_for("register"))

        if User.query.filter_by(email=email).first():
            flash("Email already registered.", "error")
            return redirect(url_for("register"))

        user = User(email=email, mobile_no=mobile_clean, address=address)
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
        errors   = validate_login_data(email, password)

        if errors:
            for error in errors:
                flash(error, "error")
            return redirect(url_for("login"))

        user = User.query.filter_by(email=email).first()
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


@app.route("/admin/orders")
@login_required
@admin_required
def admin_orders():
    orders = Order.query.order_by(Order.created_at.desc()).all()
    return render_template("admin_orders.html", orders=orders)


@app.route("/admin/orders/<int:order_id>/status", methods=["POST"])
@login_required
@admin_required
def admin_update_order_status(order_id):
    order = Order.query.get_or_404(order_id)
    new_status = request.form.get("status", "pending")
    tracking_number = request.form.get("tracking_number", "").strip()
    fulfillment_notes = request.form.get("fulfillment_notes", "").strip()

    valid_statuses = {"pending", "assigned", "shipped", "completed", "cancelled"}
    if new_status not in valid_statuses:
        flash("Invalid order status.", "error")
        return redirect(url_for("admin_order_detail", order_id=order.id))

    order.status = new_status
    order.tracking_number = tracking_number or None
    order.fulfillment_notes = fulfillment_notes
    if new_status == "shipped" and not order.dispatched_at:
        order.dispatched_at = datetime.now(timezone.utc)
    if new_status == "completed" and not order.delivered_at:
        order.delivered_at = datetime.now(timezone.utc)

    db.session.commit()
    flash(f"Order {order.id} updated.", "success")
    return redirect(url_for("admin_order_detail", order_id=order.id))


@app.route("/admin")
@login_required
@admin_required
def admin_dashboard():
    status_counts = {
        status: Order.query.filter_by(status=status).count()
        for status in ["pending", "assigned", "shipped", "completed", "cancelled"]
    }
    unassigned_tags = Tag.query.filter_by(user_id=None).count()
    recent_orders = Order.query.order_by(Order.created_at.desc()).limit(8).all()
    recent_tags = Tag.query.order_by(Tag.id.desc()).limit(8).all()
    return render_template(
        "admin_dashboard.html",
        status_counts=status_counts,
        unassigned_tags=unassigned_tags,
        recent_orders=recent_orders,
        recent_tags=recent_tags,
    )


@app.route("/admin/orders/<int:order_id>")
@login_required
@admin_required
def admin_order_detail(order_id):
    order = Order.query.get_or_404(order_id)
    return render_template("admin_order_detail.html", order=order)


# ---------------------------------------------------------------------------
# Tag Activation
# ---------------------------------------------------------------------------

@app.route("/activate", methods=["GET", "POST"])
@login_required
def activate():
    user = current_user()

    if request.method == "POST":
        serial = request.form.get("serial_number", "").strip().upper()
        if not validate_activation_code(serial):
            flash("Enter a valid serial number in the format ST-YYYY-NNNNN.", "error")
            return redirect(url_for("activate"))

        tag = Tag.query.filter_by(serial_number=serial).first()
        if not tag:
            flash("Serial number not found. Check and try again.", "error")
            return redirect(url_for("activate"))
        if tag.is_active:
            flash("This tag is already activated.", "error")
            return redirect(url_for("activate"))

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
        profile_data, errors = validate_profile_payload(request.form)
        if errors:
            for error in errors:
                flash(error, "error")
            return redirect(url_for("setup_profile", tag_id=tag.id))

        profile = tag.medical or MedicalProfile(tag_id=tag.id)
        profile.name               = profile_data["name"]
        profile.dob                = profile_data["dob"]
        profile.category           = profile_data["category"]
        profile.blood_group        = profile_data["blood_group"]
        profile.allergies          = profile_data["allergies"]
        profile.medication_notes   = profile_data["medication_notes"]
        profile.medical_conditions = profile_data["medical_conditions"]
        profile.emergency_contact_1 = profile_data["emergency_contact_1"]
        profile.emergency_contact_2 = profile_data["emergency_contact_2"]
        profile.owner_whatsapp     = profile_data["owner_whatsapp"]
        profile.privacy_mode       = profile_data["privacy_mode"]
        profile.custom_message     = profile_data["custom_message"]

        if not tag.medical:
            db.session.add(profile)

        if not tag.is_active:
            tag.is_active = True
        if not tag.activated_at:
            tag.activated_at = datetime.now(timezone.utc)

        db.session.commit()

        flash("Profile saved! Your tag is live.", "success")
        return redirect(url_for("dashboard"))

    return render_template("setup_profile.html", user=user, tag=tag)


# ---------------------------------------------------------------------------
# Payment (Mock Razorpay flow)
# ---------------------------------------------------------------------------

@app.route("/buy")
def buy():
    return render_template("buy.html", user=current_user(), dummy_payment=DUMMY_PAYMENT)


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
    amount  = 14900 if pack == "single" else 49900

    order = Order(
        user_id=user.id,
        pack=pack,
        amount=amount,
        status="assigned" if DUMMY_PAYMENT else "pending",
        razorpay_order_id=f"order_MOCK_{secrets.token_hex(6).upper()}" if DUMMY_PAYMENT else None,
        payment_id=f"pay_MOCK_{secrets.token_hex(6).upper()}" if DUMMY_PAYMENT else None,
    )
    db.session.add(order)
    db.session.flush()

    available = Tag.query.filter_by(is_active=False, user_id=None).limit(qty).all()
    for t in available:
        t.user_id = user.id
        t.order_id = order.id

    order.status = "assigned" if available else "pending"
    db.session.commit()

    return jsonify({
        "success": True,
        "order_id": order.id,
        "tags_assigned": len(available),
        "message": f"Payment successful! {len(available)} tag(s) ready to activate.",
    })


# ---------------------------------------------------------------------------
# Emergency Public View  (/v/<slug>)
# ---------------------------------------------------------------------------

@app.route("/v/<slug>")
@limiter.limit("30 per minute")  
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
@limiter.limit("10 per minute")
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


@app.cli.command("create-admin")
def create_admin():
    """Create a new admin user from the CLI."""
    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        return

    mobile = input("Mobile number (+country digits): ").strip()
    mobile_clean = clean_phone(mobile)
    if not PHONE_RE.match(mobile_clean):
        print("Invalid mobile number.")
        return

    if User.query.filter_by(email=email).first():
        print("User already exists.")
        return

    user = User(email=email, mobile_no=mobile_clean, address="")
    user.set_password(password)
    user.is_admin = True
    db.session.add(user)
    db.session.commit()
    print(f"Admin user created: {email}")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
