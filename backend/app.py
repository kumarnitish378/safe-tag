import csv
import hashlib
import hmac
import io
import os
import secrets
import string
from datetime import datetime, timezone, timedelta
from functools import wraps

import qrcode
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager, UserMixin
from flask_mail import Mail
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from werkzeug.security import check_password_hash, generate_password_hash

try:
    import razorpay
except ImportError:  # pragma: no cover
    razorpay = None

try:
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover
    TwilioClient = None

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()
csrf = CSRFProtect()
mail = Mail()
login_manager = LoginManager()
limiter = Limiter(key_func=get_remote_address)

TOKENS = {}


def utcnow():
    return datetime.now(timezone.utc)


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    database_url = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["WTF_CSRF_TIME_LIMIT"] = None
    app.config["WTF_CSRF_CHECK_DEFAULT"] = False
    app.config["MAIL_SERVER"] = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    app.config["MAIL_PORT"] = int(os.environ.get("MAIL_PORT", "587"))
    app.config["MAIL_USERNAME"] = os.environ.get("MAIL_USERNAME")
    app.config["MAIL_PASSWORD"] = os.environ.get("MAIL_PASSWORD")
    app.config["MAIL_USE_TLS"] = True

    db.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    mail.init_app(app)
    login_manager.init_app(app)
    limiter.init_app(app)
    
    @app.after_request
    def add_public_api_headers(response):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        return response

    @app.before_request
    def require_api_csrf_header():
        if request.method not in {"POST", "PUT", "DELETE"}:
            return None
        if not request.path.startswith("/api/") or request.path == "/api/location-alert":
            return None
        if request.headers.get("X-CSRF-Token") != app.config["SECRET_KEY"]:
            return error("CSRF token missing or invalid", 400)
        return None

    register_routes(app)
    return app


class Tag(db.Model):
    tag_id = db.Column(db.String(10), primary_key=True)
    security_key = db.Column(db.String(32), nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturer.id"), nullable=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("tag_batch.id"), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    activated_at = db.Column(db.DateTime, nullable=True)
    scan_count = db.Column(db.Integer, default=0, nullable=False)

    profile = db.relationship("MedicalProfile", back_populates="tag", uselist=False, cascade="all, delete-orphan")


class MedicalProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tag_id = db.Column(db.String(10), db.ForeignKey("tag.tag_id"), unique=True, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    parent_name = db.Column(db.String(150), default="")
    blood_group = db.Column(db.String(10), default="Unknown")
    address = db.Column(db.Text, default="")
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    mobile_primary = db.Column(db.String(20), nullable=False)
    mobile_secondary = db.Column(db.String(20), default="")
    email = db.Column(db.String(255), default="")
    medical_conditions = db.Column(db.Text, default="")
    allergies = db.Column(db.Text, default="")
    medications = db.Column(db.Text, default="")
    custom_message = db.Column(db.Text, default="")
    owner_whatsapp = db.Column(db.String(20), default="")
    photo_url = db.Column(db.String(500), default="")

    tag = db.relationship("Tag", back_populates="profile")


class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    mobile = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(150), default="")
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    tags = db.relationship("Tag", backref="owner", lazy=True)
    orders = db.relationship("Order", backref="user", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Manufacturer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    mobile = db.Column(db.String(20), nullable=False)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class TagBatch(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturer.id"), nullable=True)
    batch_name = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    manufacturer = db.relationship("Manufacturer", backref="batches")
    tags = db.relationship("Tag", backref="batch", lazy=True)


class ProductListing(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturer.id"), nullable=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default="")
    price = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(30), nullable=False)
    quantity_available = db.Column(db.Integer, default=0)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    is_featured = db.Column(db.Boolean, default=False, nullable=False)
    photo_url = db.Column(db.String(500), default="")
    created_at = db.Column(db.DateTime, default=utcnow)

    manufacturer = db.relationship("Manufacturer", backref="listings")


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    product_listing_id = db.Column(db.Integer, db.ForeignKey("product_listing.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="pending", nullable=False)
    tracking_id = db.Column(db.String(100), default="")
    razorpay_order_id = db.Column(db.String(100), default="")
    razorpay_payment_id = db.Column(db.String(100), default="")
    created_at = db.Column(db.DateTime, default=utcnow)

    product = db.relationship("ProductListing")


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


def ok(data=None, status=200):
    payload = {"ok": True}
    if data:
        payload.update(data)
    return jsonify(payload), status


def error(message, status=400):
    return jsonify({"ok": False, "message": message}), status


def token_for(role, model_id):
    token = secrets.token_urlsafe(32)
    TOKENS[token] = {"role": role, "id": model_id, "expires": utcnow() + timedelta(days=7)}
    return token


def auth_required(role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = request.headers.get("X-Auth-Token", "")
            record = TOKENS.get(token)
            if not record or record["role"] != role or record["expires"] < utcnow():
                return error("Unauthorized", 401)
            request.actor_id = record["id"]
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    @wraps(fn)
    @auth_required("user")
    def wrapper(*args, **kwargs):
        user = User.query.get(request.actor_id)
        if not user or not user.is_admin:
            return error("Forbidden", 403)
        return fn(*args, **kwargs)

    return wrapper


def approved_manufacturer_required(fn):
    @wraps(fn)
    @auth_required("manufacturer")
    def wrapper(*args, **kwargs):
        manufacturer = Manufacturer.query.get(request.actor_id)
        if not manufacturer or not manufacturer.is_approved:
            return error("Manufacturer approval pending", 403)
        return fn(*args, **kwargs)

    return wrapper


def clean_mobile(value):
    return "".join(ch for ch in (value or "") if ch.isdigit())[-10:]


def validate_mobile(value):
    mobile = clean_mobile(value)
    return len(mobile) == 10 and mobile[0] in "6789"


def generate_tag_id():
    alphabet = string.ascii_uppercase + string.digits
    while True:
        tag_id = "".join(secrets.choice(alphabet) for _ in range(8))
        if not Tag.query.get(tag_id):
            return tag_id


def tag_json(tag, include_profile=True):
    data = {
        "tag_id": tag.tag_id,
        "security_key": tag.security_key,
        "is_active": tag.is_active,
        "manufacturer_id": tag.manufacturer_id,
        "batch_id": tag.batch_id,
        "owner_id": tag.owner_id,
        "created_at": tag.created_at.isoformat() if tag.created_at else None,
        "activated_at": tag.activated_at.isoformat() if tag.activated_at else None,
        "scan_count": tag.scan_count,
    }
    if include_profile:
        data["profile"] = profile_json(tag.profile) if tag.profile else None
    return data


def profile_json(profile):
    return {
        "id": profile.id,
        "tag_id": profile.tag_id,
        "name": profile.name,
        "age": profile.age,
        "parent_name": profile.parent_name,
        "blood_group": profile.blood_group,
        "address": profile.address,
        "latitude": profile.latitude,
        "longitude": profile.longitude,
        "mobile_primary": profile.mobile_primary,
        "mobile_secondary": profile.mobile_secondary,
        "email": profile.email,
        "medical_conditions": profile.medical_conditions,
        "allergies": profile.allergies,
        "medications": profile.medications,
        "custom_message": profile.custom_message,
        "owner_whatsapp": profile.owner_whatsapp,
        "photo_url": profile.photo_url,
    }


def user_json(user):
    return {"id": user.id, "email": user.email, "mobile": user.mobile, "name": user.name, "is_admin": user.is_admin}


def manufacturer_json(mfr):
    return {
        "id": mfr.id,
        "business_name": mfr.business_name,
        "email": mfr.email,
        "mobile": mfr.mobile,
        "is_approved": mfr.is_approved,
        "created_at": mfr.created_at.isoformat() if mfr.created_at else None,
    }


def listing_json(listing):
    return {
        "id": listing.id,
        "manufacturer_id": listing.manufacturer_id,
        "name": listing.name,
        "description": listing.description,
        "price": listing.price,
        "category": listing.category,
        "quantity_available": listing.quantity_available,
        "is_approved": listing.is_approved,
        "is_featured": listing.is_featured,
        "photo_url": listing.photo_url,
    }


def order_json(order):
    return {
        "id": order.id,
        "user_id": order.user_id,
        "product_listing_id": order.product_listing_id,
        "product_name": order.product.name if order.product else "",
        "quantity": order.quantity,
        "amount": order.amount,
        "status": order.status,
        "tracking_id": order.tracking_id,
        "razorpay_order_id": order.razorpay_order_id,
        "razorpay_payment_id": order.razorpay_payment_id,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def create_or_update_profile(tag, data):
    required = ["name", "age", "mobile_primary"]
    for field in required:
        if not data.get(field):
            raise ValueError(f"{field} is required")
    age = int(data.get("age"))
    if age < 1 or age > 120:
        raise ValueError("Age must be between 1 and 120")
    if not validate_mobile(data.get("mobile_primary")):
        raise ValueError("Mobile number must be a valid 10-digit India number")

    profile = tag.profile or MedicalProfile(tag_id=tag.tag_id)
    profile.name = data.get("name", "").strip()
    profile.age = age
    profile.parent_name = data.get("parent_name", "").strip()
    profile.blood_group = data.get("blood_group", "Unknown") or "Unknown"
    profile.address = data.get("address", "").strip()
    profile.latitude = float(data["latitude"]) if data.get("latitude") else None
    profile.longitude = float(data["longitude"]) if data.get("longitude") else None
    profile.mobile_primary = clean_mobile(data.get("mobile_primary"))
    profile.mobile_secondary = clean_mobile(data.get("mobile_secondary")) if data.get("mobile_secondary") else ""
    profile.email = data.get("email", "").strip().lower()
    profile.medical_conditions = data.get("medical_conditions", "").strip()
    profile.allergies = data.get("allergies", "").strip()
    profile.medications = data.get("medications", "").strip()
    profile.custom_message = data.get("custom_message", "").strip()
    profile.owner_whatsapp = clean_mobile(data.get("owner_whatsapp")) if data.get("owner_whatsapp") else ""
    profile.photo_url = data.get("photo_url", "").strip()
    db.session.add(profile)
    return profile


def generate_batch(qty, batch_name, manufacturer_id=None):
    batch = TagBatch(manufacturer_id=manufacturer_id, batch_name=batch_name, quantity=qty)
    db.session.add(batch)
    db.session.flush()
    rows = []
    base_url = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
    for _ in range(qty):
        tag_id = generate_tag_id()
        security_key = secrets.token_urlsafe(12)
        tag = Tag(tag_id=tag_id, security_key=security_key, manufacturer_id=manufacturer_id, batch_id=batch.id)
        db.session.add(tag)
        full_url = f"{base_url}/{tag_id}/{security_key}"
        rows.append(
            {
                "tag_id": tag_id,
                "security_key": security_key,
                "full_url": full_url,
                "qr_data": full_url,
                "rfid_payload": full_url,
                "batch_id": batch.id,
                "batch_name": batch_name,
                "created_at": utcnow().isoformat(),
            }
        )
    return batch, rows


def csv_response(rows, filename):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["tag_id", "security_key", "full_url", "qr_data", "rfid_payload", "batch_id", "batch_name", "created_at"])
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def register_routes(app):
    @app.get("/api/scan/<tag_id>/<security_key>")
    @limiter.limit("30 per minute")
    def scan(tag_id, security_key):
        tag = Tag.query.filter_by(tag_id=tag_id, security_key=security_key).first()
        if not tag:
            return error("Tag not found", 404)
        tag.scan_count += 1
        db.session.commit()
        return ok({"is_active": tag.is_active, "tag_id": tag.tag_id})

    @app.get("/api/emergency/<tag_id>")
    @limiter.limit("30 per minute")
    def emergency(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag or not tag.is_active or not tag.profile:
            return error("Emergency profile not found", 404)
        return ok({"tag": tag_json(tag), "profile": profile_json(tag.profile)})

    @app.post("/api/tag/<tag_id>/register")
    def register_tag(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag:
            return error("Tag not found", 404)
        data = request.get_json(silent=True) or request.form.to_dict()
        try:
            mobile = clean_mobile(data.get("mobile_primary"))
            user = User.query.filter_by(mobile=mobile).first()
            if not user:
                user = User(email=data.get("email") or f"{mobile}@safetag.local", mobile=mobile, name=data.get("name", ""))
                user.set_password(secrets.token_urlsafe(12))
                db.session.add(user)
                db.session.flush()
            tag.owner_id = user.id
            tag.is_active = True
            tag.activated_at = utcnow()
            create_or_update_profile(tag, data)
            db.session.commit()
            return ok({"tag_id": tag.tag_id})
        except ValueError as exc:
            db.session.rollback()
            return error(str(exc), 422)

    @app.get("/api/tag/<tag_id>/status")
    def tag_status(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag:
            return error("Tag not found", 404)
        return ok({"is_active": tag.is_active, "tag_id": tag.tag_id})

    @app.get("/api/tag/<tag_id>/profile")
    @auth_required("user")
    def get_profile(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag or tag.owner_id != request.actor_id or not tag.profile:
            return error("Profile not found", 404)
        return ok({"profile": profile_json(tag.profile)})

    @app.put("/api/tag/<tag_id>/profile")
    @auth_required("user")
    def update_profile(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag or tag.owner_id != request.actor_id:
            return error("Profile not found", 404)
        try:
            create_or_update_profile(tag, request.get_json(silent=True) or {})
            db.session.commit()
            return ok()
        except ValueError as exc:
            db.session.rollback()
            return error(str(exc), 422)

    @app.get("/api/qr/<tag_id>")
    def qr_code(tag_id):
        tag = Tag.query.get(tag_id)
        if not tag:
            return error("Tag not found", 404)
        base_url = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
        image = qrcode.make(f"{base_url}/{tag.tag_id}/{tag.security_key}")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return send_file(buffer, mimetype="image/png", download_name=f"{tag_id}.png")

    @app.post("/api/auth/register")
    def auth_register():
        data = request.get_json(silent=True) or {}
        if not data.get("email") or not validate_mobile(data.get("mobile")) or not data.get("password"):
            return error("Email, valid mobile, and password are required", 422)
        if User.query.filter_by(email=data["email"].lower()).first():
            return error("Email already registered", 409)
        user = User(email=data["email"].lower(), mobile=clean_mobile(data["mobile"]), name=data.get("name", ""))
        user.set_password(data["password"])
        db.session.add(user)
        db.session.commit()
        return ok({"user_id": user.id, "token": token_for("user", user.id), "user": user_json(user)}, 201)

    @app.post("/api/auth/login")
    def auth_login():
        data = request.get_json(silent=True) or {}
        user = User.query.filter_by(email=(data.get("email") or "").lower()).first()
        if not user or not user.check_password(data.get("password", "")):
            return error("Invalid credentials", 401)
        return ok({"token": token_for("user", user.id), "user": user_json(user)})

    @app.post("/api/auth/logout")
    def auth_logout():
        token = request.headers.get("X-Auth-Token")
        TOKENS.pop(token, None)
        return ok()

    @app.get("/api/user/tags")
    @auth_required("user")
    def user_tags():
        tags = Tag.query.filter_by(owner_id=request.actor_id).all()
        return ok({"tags": [tag_json(tag) for tag in tags]})

    @app.get("/api/user/orders")
    @auth_required("user")
    def user_orders():
        orders = Order.query.filter_by(user_id=request.actor_id).order_by(Order.created_at.desc()).all()
        return ok({"orders": [order_json(order) for order in orders]})

    @app.put("/api/user/settings")
    @auth_required("user")
    def user_settings():
        user = User.query.get(request.actor_id)
        data = request.get_json(silent=True) or {}
        if data.get("mobile"):
            if not validate_mobile(data["mobile"]):
                return error("Invalid mobile", 422)
            user.mobile = clean_mobile(data["mobile"])
        if "name" in data:
            user.name = data["name"]
        if data.get("password"):
            user.set_password(data["password"])
        db.session.commit()
        return ok()

    @app.post("/api/manufacturer/register")
    def manufacturer_register():
        data = request.get_json(silent=True) or {}
        if not data.get("business_name") or not data.get("email") or not data.get("password"):
            return error("Business name, email, and password are required", 422)
        if Manufacturer.query.filter_by(email=data["email"].lower()).first():
            return error("Email already registered", 409)
        mfr = Manufacturer(business_name=data["business_name"], email=data["email"].lower(), mobile=clean_mobile(data.get("mobile")))
        mfr.set_password(data["password"])
        db.session.add(mfr)
        db.session.commit()
        return ok({"manufacturer_id": mfr.id}, 201)

    @app.post("/api/manufacturer/login")
    def manufacturer_login():
        data = request.get_json(silent=True) or {}
        mfr = Manufacturer.query.filter_by(email=(data.get("email") or "").lower()).first()
        if not mfr or not mfr.check_password(data.get("password", "")):
            return error("Invalid credentials", 401)
        return ok({"token": token_for("manufacturer", mfr.id), "manufacturer": manufacturer_json(mfr)})

    @app.post("/api/manufacturer/batch")
    @approved_manufacturer_required
    def manufacturer_batch():
        data = request.get_json(silent=True) or request.form.to_dict()
        qty = min(int(data.get("qty", 0)), 10000)
        if qty < 1:
            return error("Quantity is required", 422)
        batch, rows = generate_batch(qty, data.get("batch_name", "SafeTag Batch"), request.actor_id)
        db.session.commit()
        return csv_response(rows, f"batch-{batch.id}.csv")

    @app.get("/api/manufacturer/batches")
    @approved_manufacturer_required
    def manufacturer_batches():
        batches = TagBatch.query.filter_by(manufacturer_id=request.actor_id).order_by(TagBatch.created_at.desc()).all()
        return ok({"batches": [{"id": b.id, "name": b.batch_name, "qty": b.quantity, "activated_count": sum(1 for t in b.tags if t.is_active)} for b in batches]})

    @app.get("/api/manufacturer/batch/<int:batch_id>")
    @approved_manufacturer_required
    def manufacturer_batch_detail(batch_id):
        batch = TagBatch.query.filter_by(id=batch_id, manufacturer_id=request.actor_id).first()
        if not batch:
            return error("Batch not found", 404)
        return ok({"batch": {"id": batch.id, "name": batch.batch_name, "qty": batch.quantity, "tags": [tag_json(t, False) for t in batch.tags]}})

    @app.get("/api/manufacturer/listings")
    @approved_manufacturer_required
    def manufacturer_listings():
        listings = ProductListing.query.filter_by(manufacturer_id=request.actor_id).all()
        return ok({"listings": [listing_json(listing) for listing in listings]})

    @app.post("/api/manufacturer/listings")
    @approved_manufacturer_required
    def manufacturer_create_listing():
        data = request.get_json(silent=True) or {}
        listing = ProductListing(
            manufacturer_id=request.actor_id,
            name=data.get("name", ""),
            description=data.get("description", ""),
            price=int(data.get("price", 0)),
            category=data.get("category", "keychain"),
            quantity_available=int(data.get("quantity_available", 0)),
            photo_url=data.get("photo_url", ""),
        )
        db.session.add(listing)
        db.session.commit()
        return ok({"listing_id": listing.id}, 201)

    @app.put("/api/manufacturer/listings/<int:listing_id>")
    @approved_manufacturer_required
    def manufacturer_update_listing(listing_id):
        listing = ProductListing.query.filter_by(id=listing_id, manufacturer_id=request.actor_id).first()
        if not listing:
            return error("Listing not found", 404)
        data = request.get_json(silent=True) or {}
        for field in ["name", "description", "category", "photo_url"]:
            if field in data:
                setattr(listing, field, data[field])
        for field in ["price", "quantity_available"]:
            if field in data:
                setattr(listing, field, int(data[field]))
        db.session.commit()
        return ok()

    @app.delete("/api/manufacturer/listings/<int:listing_id>")
    @approved_manufacturer_required
    def manufacturer_delete_listing(listing_id):
        listing = ProductListing.query.filter_by(id=listing_id, manufacturer_id=request.actor_id).first()
        if not listing:
            return error("Listing not found", 404)
        db.session.delete(listing)
        db.session.commit()
        return ok()

    @app.get("/api/store/products")
    def store_products():
        query = ProductListing.query.filter_by(is_approved=True)
        if request.args.get("category"):
            query = query.filter_by(category=request.args["category"])
        if request.args.get("featured") == "true":
            query = query.filter_by(is_featured=True)
        return ok({"products": [listing_json(item) for item in query.all()]})

    @app.get("/api/store/products/<int:listing_id>")
    def store_product(listing_id):
        listing = ProductListing.query.filter_by(id=listing_id, is_approved=True).first()
        if not listing:
            return error("Product not found", 404)
        return ok({"product": listing_json(listing)})

    @app.post("/api/payment/initiate")
    @auth_required("user")
    def payment_initiate():
        data = request.get_json(silent=True) or {}
        product = ProductListing.query.get(data.get("product_listing_id"))
        if not product:
            return error("Product not found", 404)
        qty = max(1, int(data.get("quantity", 1)))
        amount = product.price * qty
        if os.environ.get("DUMMY_PAYMENT", "true").lower() == "true":
            return ok({"order_id": f"order_DUMMY_{secrets.token_hex(6)}", "amount": amount, "currency": "INR"})
        client = razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))
        order = client.order.create({"amount": amount, "currency": "INR", "payment_capture": 1})
        return ok({"order_id": order["id"], "amount": amount, "currency": "INR"})

    @app.post("/api/payment/success")
    @auth_required("user")
    def payment_success():
        data = request.get_json(silent=True) or {}
        product = ProductListing.query.get(data.get("product_listing_id"))
        if not product:
            return error("Product not found", 404)
        if os.environ.get("DUMMY_PAYMENT", "true").lower() != "true":
            payload = f"{data.get('razorpay_order_id')}|{data.get('razorpay_payment_id')}"
            expected = hmac.new(os.environ["RAZORPAY_KEY_SECRET"].encode(), payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, data.get("razorpay_signature", "")):
                return error("Invalid Razorpay signature", 400)
        qty = max(1, int(data.get("quantity", 1)))
        order = Order(
            user_id=request.actor_id,
            product_listing_id=product.id,
            quantity=qty,
            amount=product.price * qty,
            status="pending",
            razorpay_order_id=data.get("razorpay_order_id", data.get("order_id", "")),
            razorpay_payment_id=data.get("razorpay_payment_id", "dummy_payment"),
        )
        db.session.add(order)
        product.quantity_available = max(0, product.quantity_available - qty)
        db.session.commit()
        return ok({"order_id": order.id})

    @app.get("/api/admin/stats")
    @admin_required
    def admin_stats():
        total_tags = Tag.query.count()
        active_tags = Tag.query.filter_by(is_active=True).count()
        week_ago = utcnow() - timedelta(days=7)
        return ok(
            {
                "total_tags": total_tags,
                "tags_activated": active_tags,
                "activation_rate": round((active_tags / total_tags * 100) if total_tags else 0, 2),
                "total_users": User.query.count(),
                "new_users_this_week": User.query.filter(User.created_at >= week_ago).count(),
                "total_manufacturers": Manufacturer.query.count(),
                "pending_manufacturers": Manufacturer.query.filter_by(is_approved=False).count(),
                "total_orders": Order.query.count(),
                "pending_dispatch": Order.query.filter_by(status="pending").count(),
                "revenue_this_week": sum(o.amount for o in Order.query.filter(Order.created_at >= week_ago).all()),
            }
        )

    @app.get("/api/admin/manufacturers")
    @admin_required
    def admin_manufacturers():
        return ok({"manufacturers": [manufacturer_json(m) for m in Manufacturer.query.all()]})

    @app.post("/api/admin/manufacturers/<int:mfr_id>/approve")
    @admin_required
    def approve_mfr(mfr_id):
        mfr = Manufacturer.query.get_or_404(mfr_id)
        mfr.is_approved = True
        db.session.commit()
        return ok()

    @app.post("/api/admin/manufacturers/<int:mfr_id>/block")
    @admin_required
    def block_mfr(mfr_id):
        mfr = Manufacturer.query.get_or_404(mfr_id)
        mfr.is_approved = False
        db.session.commit()
        return ok()

    @app.get("/api/admin/listings")
    @admin_required
    def admin_listings():
        return ok({"listings": [listing_json(listing) for listing in ProductListing.query.all()]})

    @app.post("/api/admin/listings/<int:listing_id>/approve")
    @admin_required
    def approve_listing(listing_id):
        listing = ProductListing.query.get_or_404(listing_id)
        listing.is_approved = True
        if "is_featured" in (request.get_json(silent=True) or {}):
            listing.is_featured = bool(request.json["is_featured"])
        db.session.commit()
        return ok()

    @app.post("/api/admin/listings/<int:listing_id>/reject")
    @admin_required
    def reject_listing(listing_id):
        listing = ProductListing.query.get_or_404(listing_id)
        listing.is_approved = False
        db.session.commit()
        return ok()

    @app.get("/api/admin/orders")
    @admin_required
    def admin_orders():
        query = Order.query
        if request.args.get("status"):
            query = query.filter_by(status=request.args["status"])
        return ok({"orders": [order_json(order) for order in query.order_by(Order.created_at.desc()).all()]})

    @app.post("/api/admin/orders/<int:order_id>/dispatch")
    @admin_required
    def dispatch_order(order_id):
        order = Order.query.get_or_404(order_id)
        data = request.get_json(silent=True) or {}
        order.status = "dispatched"
        order.tracking_id = data.get("tracking_id", "")
        db.session.commit()
        return ok()

    @app.get("/api/admin/users")
    @admin_required
    def admin_users():
        users = User.query.all()
        return ok({"users": [{**user_json(u), "tag_count": len(u.tags), "order_count": len(u.orders)} for u in users]})

    @app.post("/api/location-alert")
    @limiter.limit("10 per minute")
    def location_alert():
        data = request.get_json(silent=True) or {}
        tag = Tag.query.get(data.get("tag_id"))
        if not tag or not tag.profile:
            return error("Tag not found", 404)
        if TwilioClient and os.environ.get("TWILIO_ACCOUNT_SID") and tag.profile.owner_whatsapp:
            try:
                client = TwilioClient(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
                maps_url = f"https://maps.google.com/?q={data.get('lat')},{data.get('lng')}"
                client.messages.create(
                    from_=os.environ.get("TWILIO_WHATSAPP_FROM"),
                    to=f"whatsapp:+91{tag.profile.owner_whatsapp}",
                    body=f"Your SafeTag was scanned. Location: {maps_url}",
                )
            except Exception:
                pass
        return ok({"message": "Owner notified"})

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "timestamp": utcnow().isoformat()})


app = create_app()


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
