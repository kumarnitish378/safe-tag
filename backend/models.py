"""
SafeTag SQLAlchemy models.

All timestamps are UTC. Primary keys are integers unless specified.
The Tag model is the core of the system; everything relates to it.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def _utcnow():
    return datetime.utcnow()


class Tag(db.Model):
    """Core tag record. tag_id is the same value programmed into RFID + QR."""
    __tablename__ = "tags"

    tag_id = db.Column(db.String(10), primary_key=True)
    security_key = db.Column(db.String(16), nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturers.id"), nullable=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("tag_batches.id"), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    activated_at = db.Column(db.DateTime, nullable=True)
    scan_count = db.Column(db.Integer, default=0, nullable=False)

    profile = db.relationship(
        "MedicalProfile",
        backref="tag",
        uselist=False,
        cascade="all, delete-orphan",
    )
    owner = db.relationship("User", backref="tags", foreign_keys=[owner_id])
    manufacturer = db.relationship("Manufacturer", backref="tags", foreign_keys=[manufacturer_id])
    batch = db.relationship("TagBatch", backref="tags", foreign_keys=[batch_id])

    def to_dict(self, include_profile=False):
        data = {
            "tag_id": self.tag_id,
            "is_active": self.is_active,
            "scan_count": self.scan_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "activated_at": self.activated_at.isoformat() if self.activated_at else None,
            "owner_id": self.owner_id,
            "batch_id": self.batch_id,
            "manufacturer_id": self.manufacturer_id,
        }
        if include_profile and self.profile:
            data["profile"] = self.profile.to_dict()
        return data


class MedicalProfile(db.Model):
    """1:1 with Tag. Created when a customer fills the registration form."""
    __tablename__ = "medical_profiles"

    id = db.Column(db.Integer, primary_key=True)
    tag_id = db.Column(db.String(10), db.ForeignKey("tags.tag_id"), unique=True, nullable=False)

    # Required fields
    name = db.Column(db.String(150), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    mobile_primary = db.Column(db.String(20), nullable=False)

    # Optional fields
    parent_name = db.Column(db.String(150), nullable=True)
    blood_group = db.Column(db.String(10), nullable=True)
    address = db.Column(db.Text, nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    mobile_secondary = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    medical_conditions = db.Column(db.Text, nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medications = db.Column(db.Text, nullable=True)
    custom_message = db.Column(db.Text, nullable=True)
    owner_whatsapp = db.Column(db.String(20), nullable=True)
    photo_url = db.Column(db.String(500), nullable=True)
    category = db.Column(db.String(30), nullable=True)  # CHILD/ELDERLY/TRAVELER/PET/ADULT

    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "tag_id": self.tag_id,
            "name": self.name,
            "age": self.age,
            "parent_name": self.parent_name,
            "blood_group": self.blood_group,
            "address": self.address,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "mobile_primary": self.mobile_primary,
            "mobile_secondary": self.mobile_secondary,
            "email": self.email,
            "medical_conditions": self.medical_conditions,
            "allergies": self.allergies,
            "medications": self.medications,
            "custom_message": self.custom_message,
            "owner_whatsapp": self.owner_whatsapp,
            "photo_url": self.photo_url,
            "category": self.category,
        }


class User(db.Model):
    """Customer account."""
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    mobile = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(150), nullable=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    orders = db.relationship("Order", backref="user", lazy="dynamic")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "mobile": self.mobile,
            "name": self.name,
            "is_admin": self.is_admin,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Manufacturer(db.Model):
    __tablename__ = "manufacturers"

    id = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    mobile = db.Column(db.String(20), nullable=False)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    is_blocked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    batches = db.relationship("TagBatch", backref="manufacturer", lazy="dynamic")
    listings = db.relationship("ProductListing", backref="manufacturer", lazy="dynamic")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "business_name": self.business_name,
            "email": self.email,
            "mobile": self.mobile,
            "is_approved": self.is_approved,
            "is_blocked": self.is_blocked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TagBatch(db.Model):
    __tablename__ = "tag_batches"

    id = db.Column(db.Integer, primary_key=True)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturers.id"), nullable=False)
    batch_name = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "manufacturer_id": self.manufacturer_id,
            "batch_name": self.batch_name,
            "quantity": self.quantity,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ProductListing(db.Model):
    __tablename__ = "product_listings"

    id = db.Column(db.Integer, primary_key=True)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturers.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Integer, nullable=False)  # paise
    category = db.Column(db.String(30), nullable=False)  # keychain|card|sticker|wristband
    quantity_available = db.Column(db.Integer, default=0, nullable=False)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    is_featured = db.Column(db.Boolean, default=False, nullable=False)
    is_rejected = db.Column(db.Boolean, default=False, nullable=False)
    photo_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    orders = db.relationship("Order", backref="product_listing", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "manufacturer_id": self.manufacturer_id,
            "manufacturer_name": self.manufacturer.business_name if self.manufacturer else None,
            "name": self.name,
            "description": self.description,
            "price": self.price,
            "price_inr": round(self.price / 100, 2),
            "category": self.category,
            "quantity_available": self.quantity_available,
            "is_approved": self.is_approved,
            "is_featured": self.is_featured,
            "is_rejected": self.is_rejected,
            "photo_url": self.photo_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    product_listing_id = db.Column(db.Integer, db.ForeignKey("product_listings.id"), nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)
    amount = db.Column(db.Integer, nullable=False)  # paise
    status = db.Column(db.String(20), default="pending", nullable=False)  # pending|dispatched|delivered|cancelled
    tracking_id = db.Column(db.String(100), nullable=True)
    razorpay_order_id = db.Column(db.String(100), nullable=True)
    razorpay_payment_id = db.Column(db.String(100), nullable=True)
    shipping_address = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self, include_user=False, include_product=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "product_listing_id": self.product_listing_id,
            "quantity": self.quantity,
            "amount": self.amount,
            "amount_inr": round(self.amount / 100, 2),
            "status": self.status,
            "tracking_id": self.tracking_id,
            "razorpay_order_id": self.razorpay_order_id,
            "razorpay_payment_id": self.razorpay_payment_id,
            "shipping_address": self.shipping_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_user and self.user:
            data["user"] = {"email": self.user.email, "name": self.user.name, "mobile": self.user.mobile}
        if include_product and self.product_listing:
            data["product"] = {
                "name": self.product_listing.name,
                "photo_url": self.product_listing.photo_url,
                "category": self.product_listing.category,
            }
        return data


class AuthToken(db.Model):
    """API auth token issued at login. Node.js stores it in express-session and forwards on every API call."""
    __tablename__ = "auth_tokens"

    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturers.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    last_used_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])
    manufacturer = db.relationship("Manufacturer", foreign_keys=[manufacturer_id])
