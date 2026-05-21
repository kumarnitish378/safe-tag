"""SafeTag Flask backend — pure JSON REST API.

Architecture (per SDD v3.0):
  Browser → Node.js/Express (HTML) → Flask API (JSON) → DB.
Flask renders NO HTML. Every route returns jsonify().
"""
import csv
import io
import logging
import os
from datetime import datetime, timedelta

from flask import Flask, abort, g, jsonify, request, send_file, Response
from flask_cors import CORS
from sqlalchemy import func

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

from config import Config
from extensions import limiter, mail, migrate
from helpers import (
    BLOOD_GROUPS,
    ALLOWED_CATEGORIES,
    ALLOWED_ORDER_STATUS,
    admin_required,
    collect_errors,
    current_manufacturer_record,
    current_user_record,
    generate_security_key,
    generate_tag_id,
    issue_manufacturer_token,
    issue_user_token,
    is_valid_email,
    is_valid_mobile,
    login_required,
    manufacturer_required,
    normalise_mobile,
)
from models import (
    AuthToken,
    Manufacturer,
    MedicalProfile,
    Order,
    ProductListing,
    Tag,
    TagBatch,
    User,
    db,
)


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Sentry (only if DSN set)
    if app.config.get("SENTRY_DSN"):
        sentry_sdk.init(
            dsn=app.config["SENTRY_DSN"],
            integrations=[FlaskIntegration()],
            traces_sample_rate=0.1,
        )

    # CORS — Node.js frontend + browser direct calls (location-alert)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

    db.init_app(app)
    migrate.init_app(app, db)
    mail.init_app(app)
    limiter.init_app(app)

    logging.basicConfig(level=logging.INFO)

    # -------------------------------------------------------------------------
    # Generic error handlers — always return JSON
    # -------------------------------------------------------------------------
    @app.errorhandler(400)
    def _bad_request(e):
        return jsonify({"ok": False, "message": getattr(e, "description", "Bad request")}), 400

    @app.errorhandler(401)
    def _unauth(e):
        return jsonify({"ok": False, "message": "Unauthenticated"}), 401

    @app.errorhandler(403)
    def _forbidden(e):
        return jsonify({"ok": False, "message": "Forbidden"}), 403

    @app.errorhandler(404)
    def _not_found(e):
        return jsonify({"ok": False, "message": "Not found"}), 404

    @app.errorhandler(429)
    def _rate_limit(e):
        return jsonify({"ok": False, "message": "Too many requests"}), 429

    @app.errorhandler(500)
    def _server_err(e):
        app.logger.exception("Internal error")
        return jsonify({"ok": False, "message": "Internal server error"}), 500

    register_routes(app)
    return app


# =============================================================================
# Routes (all under /api/* except /api/health which is canonical)
# =============================================================================
def register_routes(app):
    # -------------------------------------------------------------------------
    # X2  /api/health  (Render health check)
    # -------------------------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def api_health():
        return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"})

    # =========================================================================
    # SCAN + EMERGENCY + REGISTRATION (CORE)
    # =========================================================================

    # T1  /api/scan/<tag_id>/<security_key>
    @app.route("/api/scan/<tag_id>/<security_key>", methods=["GET"])
    @limiter.limit("30 per minute")
    def api_scan(tag_id, security_key):
        tag = Tag.query.get(tag_id.upper())
        if not tag or tag.security_key != security_key:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        tag.scan_count = (tag.scan_count or 0) + 1
        db.session.commit()
        return jsonify({"ok": True, "is_active": tag.is_active, "tag_id": tag.tag_id})

    # T4  /api/tag/<tag_id>/status
    @app.route("/api/tag/<tag_id>/status", methods=["GET"])
    def api_tag_status(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        return jsonify({"ok": True, "is_active": tag.is_active, "tag_id": tag.tag_id})

    # T2  /api/emergency/<tag_id>
    @app.route("/api/emergency/<tag_id>", methods=["GET"])
    @limiter.limit("30 per minute")
    def api_emergency(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag or not tag.is_active or not tag.profile:
            return jsonify({"ok": False, "message": "Profile not found"}), 404
        profile = tag.profile.to_dict()
        profile["tag_id"] = tag.tag_id
        profile["scan_count"] = tag.scan_count
        return jsonify({"ok": True, "profile": profile})

    # T3  /api/tag/<tag_id>/register  — activates tag, creates MedicalProfile + (optional) User
    @app.route("/api/tag/<tag_id>/register", methods=["POST"])
    @limiter.limit("20 per minute")
    def api_tag_register(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        if tag.is_active:
            return jsonify({"ok": False, "message": "Tag already activated"}), 409

        data = request.get_json(silent=True) or request.form.to_dict()
        name = (data.get("name") or "").strip()
        age_raw = data.get("age")
        mobile_primary = normalise_mobile(data.get("mobile_primary"))

        errors = {}
        if len(name) < 2 or len(name) > 100:
            errors["name"] = "Name must be 2–100 characters"
        try:
            age = int(age_raw) if age_raw not in (None, "") else None
        except (TypeError, ValueError):
            age = None
        if age is None or age < 1 or age > 120:
            errors["age"] = "Age must be between 1 and 120"
        if not mobile_primary or not is_valid_mobile(mobile_primary):
            errors["mobile_primary"] = "Mobile must be a valid 10-digit Indian number"

        # Optional validations
        mobile_secondary = normalise_mobile(data.get("mobile_secondary"))
        if data.get("mobile_secondary") and not is_valid_mobile(mobile_secondary):
            errors["mobile_secondary"] = "Secondary mobile invalid"
        owner_whatsapp = normalise_mobile(data.get("owner_whatsapp"))
        if data.get("owner_whatsapp") and not is_valid_mobile(owner_whatsapp):
            errors["owner_whatsapp"] = "WhatsApp number invalid"
        email = (data.get("email") or "").strip() or None
        if email and not is_valid_email(email):
            errors["email"] = "Email is invalid"
        blood_group = data.get("blood_group") or None
        if blood_group and blood_group not in BLOOD_GROUPS:
            errors["blood_group"] = "Invalid blood group"

        if errors:
            return jsonify({"ok": False, "message": "Validation failed", "errors": errors}), 400

        # Optionally tie tag to a user if logged in (token in header)
        user = current_user_record()

        profile = MedicalProfile(
            tag_id=tag.tag_id,
            name=name,
            age=age,
            mobile_primary=mobile_primary,
            mobile_secondary=mobile_secondary,
            parent_name=(data.get("parent_name") or "").strip() or None,
            blood_group=blood_group,
            address=(data.get("address") or "").strip() or None,
            latitude=_to_float(data.get("latitude")),
            longitude=_to_float(data.get("longitude")),
            email=email,
            medical_conditions=(data.get("medical_conditions") or "").strip() or None,
            allergies=(data.get("allergies") or "").strip() or None,
            medications=(data.get("medications") or "").strip() or None,
            custom_message=(data.get("custom_message") or "").strip() or None,
            owner_whatsapp=owner_whatsapp,
            photo_url=(data.get("photo_url") or "").strip() or None,
            category=(data.get("category") or "").strip() or None,
        )

        tag.is_active = True
        tag.activated_at = datetime.utcnow()
        if user:
            tag.owner_id = user.id

        db.session.add(profile)
        db.session.commit()

        return jsonify({
            "ok": True,
            "tag_id": tag.tag_id,
            "redirect_url": f"/emergency/{tag.tag_id}",
        })

    # T5/T6  /api/tag/<tag_id>/profile  (GET, PUT — owner or admin)
    @app.route("/api/tag/<tag_id>/profile", methods=["GET"])
    @login_required
    def api_tag_profile_get(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        if tag.owner_id != g.current_user.id and not g.current_user.is_admin:
            return jsonify({"ok": False, "message": "Forbidden"}), 403
        if not tag.profile:
            return jsonify({"ok": False, "message": "Profile not found"}), 404
        return jsonify({"ok": True, "profile": tag.profile.to_dict(), "tag": tag.to_dict()})

    @app.route("/api/tag/<tag_id>/profile", methods=["PUT", "POST"])
    @login_required
    def api_tag_profile_update(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag or not tag.profile:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        if tag.owner_id != g.current_user.id and not g.current_user.is_admin:
            return jsonify({"ok": False, "message": "Forbidden"}), 403

        data = request.get_json(silent=True) or request.form.to_dict()
        p = tag.profile

        if "name" in data and data["name"]:
            n = data["name"].strip()
            if 2 <= len(n) <= 100:
                p.name = n
        if "age" in data:
            try:
                a = int(data["age"])
                if 1 <= a <= 120:
                    p.age = a
            except (TypeError, ValueError):
                pass
        if "mobile_primary" in data and data["mobile_primary"]:
            m = normalise_mobile(data["mobile_primary"])
            if is_valid_mobile(m):
                p.mobile_primary = m

        # Optional fields — accept empty string to clear
        OPTIONAL_TEXT = ("parent_name", "blood_group", "address", "medical_conditions",
                          "allergies", "medications", "custom_message", "photo_url",
                          "category", "email")
        for f in OPTIONAL_TEXT:
            if f in data:
                v = (data[f] or "").strip()
                setattr(p, f, v or None)
        for mf in ("mobile_secondary", "owner_whatsapp"):
            if mf in data:
                raw = data[mf]
                if raw in (None, ""):
                    setattr(p, mf, None)
                else:
                    n = normalise_mobile(raw)
                    if is_valid_mobile(n):
                        setattr(p, mf, n)
        if "latitude" in data:
            p.latitude = _to_float(data["latitude"])
        if "longitude" in data:
            p.longitude = _to_float(data["longitude"])

        p.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"ok": True, "tag_id": tag.tag_id})

    # =========================================================================
    # CUSTOMER AUTH + USER
    # =========================================================================

    # C1  /api/auth/register
    @app.route("/api/auth/register", methods=["POST"])
    @limiter.limit("20 per minute")
    def api_auth_register():
        data = request.get_json(silent=True) or request.form.to_dict()
        email = (data.get("email") or "").strip().lower()
        mobile = normalise_mobile(data.get("mobile"))
        password = data.get("password") or ""
        name = (data.get("name") or "").strip() or None

        errors = {}
        if not is_valid_email(email):
            errors["email"] = "Email is invalid"
        if not is_valid_mobile(mobile):
            errors["mobile"] = "Mobile must be a valid 10-digit Indian number"
        if len(password) < 6:
            errors["password"] = "Password must be at least 6 characters"
        if User.query.filter_by(email=email).first():
            errors["email"] = "Email already registered"
        if errors:
            return jsonify({"ok": False, "message": "Validation failed", "errors": errors}), 400

        user = User(email=email, mobile=mobile, name=name)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        token = issue_user_token(user)
        return jsonify({"ok": True, "user_id": user.id, "token": token, "user": user.to_dict()})

    # C2  /api/auth/login
    @app.route("/api/auth/login", methods=["POST"])
    @limiter.limit("20 per minute")
    def api_auth_login():
        data = request.get_json(silent=True) or request.form.to_dict()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        user = User.query.filter_by(email=email).first()
        if not user or not user.is_active or not user.check_password(password):
            return jsonify({"ok": False, "message": "Invalid credentials"}), 401
        token = issue_user_token(user)
        return jsonify({"ok": True, "token": token, "user": user.to_dict()})

    # C3  /api/auth/logout
    @app.route("/api/auth/logout", methods=["POST"])
    def api_auth_logout():
        auth = request.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else request.headers.get("X-Auth-Token")
        if token:
            AuthToken.query.filter_by(token=token).delete()
            db.session.commit()
        return jsonify({"ok": True})

    # C4  /api/user/tags
    @app.route("/api/user/tags", methods=["GET"])
    @login_required
    def api_user_tags():
        tags = Tag.query.filter_by(owner_id=g.current_user.id).order_by(Tag.created_at.desc()).all()
        return jsonify({
            "ok": True,
            "tags": [t.to_dict(include_profile=True) for t in tags],
            "user": g.current_user.to_dict(),
        })

    # C5  /api/user/orders
    @app.route("/api/user/orders", methods=["GET"])
    @login_required
    def api_user_orders():
        orders = Order.query.filter_by(user_id=g.current_user.id).order_by(Order.created_at.desc()).all()
        return jsonify({"ok": True, "orders": [o.to_dict(include_product=True) for o in orders]})

    # C6  /api/user/settings
    @app.route("/api/user/settings", methods=["PUT", "POST"])
    @login_required
    def api_user_settings():
        data = request.get_json(silent=True) or request.form.to_dict()
        user = g.current_user
        errors = {}
        if "name" in data and data["name"] is not None:
            user.name = (data["name"] or "").strip() or None
        if "mobile" in data and data["mobile"]:
            m = normalise_mobile(data["mobile"])
            if not is_valid_mobile(m):
                errors["mobile"] = "Mobile invalid"
            else:
                user.mobile = m
        if data.get("new_password"):
            current = data.get("current_password") or ""
            if not user.check_password(current):
                errors["current_password"] = "Current password incorrect"
            elif len(data["new_password"]) < 6:
                errors["new_password"] = "Password must be at least 6 characters"
            else:
                user.set_password(data["new_password"])
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        db.session.commit()
        return jsonify({"ok": True, "user": user.to_dict()})

    # /api/user/claim-tag  — let a logged-in customer attach a tag they already registered to their account
    @app.route("/api/user/claim-tag", methods=["POST"])
    @login_required
    def api_user_claim_tag():
        data = request.get_json(silent=True) or request.form.to_dict()
        tag_id = (data.get("tag_id") or "").strip().upper()
        security_key = (data.get("security_key") or "").strip()
        tag = Tag.query.get(tag_id)
        if not tag or tag.security_key != security_key:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        if tag.owner_id and tag.owner_id != g.current_user.id:
            return jsonify({"ok": False, "message": "Tag already claimed"}), 409
        tag.owner_id = g.current_user.id
        db.session.commit()
        return jsonify({"ok": True, "tag": tag.to_dict(include_profile=True)})

    # =========================================================================
    # MANUFACTURER
    # =========================================================================

    # M1
    @app.route("/api/manufacturer/register", methods=["POST"])
    @limiter.limit("20 per minute")
    def api_mfr_register():
        data = request.get_json(silent=True) or request.form.to_dict()
        email = (data.get("email") or "").strip().lower()
        mobile = normalise_mobile(data.get("mobile"))
        password = data.get("password") or ""
        business_name = (data.get("business_name") or "").strip()
        errors = {}
        if not business_name or len(business_name) < 2:
            errors["business_name"] = "Business name required"
        if not is_valid_email(email):
            errors["email"] = "Email invalid"
        if not is_valid_mobile(mobile):
            errors["mobile"] = "Mobile invalid"
        if len(password) < 6:
            errors["password"] = "Password must be at least 6 characters"
        if Manufacturer.query.filter_by(email=email).first():
            errors["email"] = "Email already registered"
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        m = Manufacturer(email=email, mobile=mobile, business_name=business_name)
        m.set_password(password)
        db.session.add(m)
        db.session.commit()
        return jsonify({"ok": True, "message": "Account created — pending admin approval"})

    # M2
    @app.route("/api/manufacturer/login", methods=["POST"])
    @limiter.limit("20 per minute")
    def api_mfr_login():
        data = request.get_json(silent=True) or request.form.to_dict()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        m = Manufacturer.query.filter_by(email=email).first()
        if not m or not m.check_password(password):
            return jsonify({"ok": False, "message": "Invalid credentials"}), 401
        if m.is_blocked:
            return jsonify({"ok": False, "message": "Account blocked"}), 403
        token = issue_manufacturer_token(m)
        return jsonify({
            "ok": True,
            "token": token,
            "manufacturer": m.to_dict(),
            "is_approved": m.is_approved,
        })

    # /api/manufacturer/me
    @app.route("/api/manufacturer/me", methods=["GET"])
    @manufacturer_required
    def api_mfr_me():
        m = g.current_manufacturer
        return jsonify({"ok": True, "manufacturer": m.to_dict()})

    # M3  /api/manufacturer/batch — creates tags, returns CSV
    @app.route("/api/manufacturer/batch", methods=["POST"])
    @manufacturer_required
    def api_mfr_batch_create():
        data = request.get_json(silent=True) or request.form.to_dict()
        try:
            quantity = int(data.get("quantity") or 0)
        except (TypeError, ValueError):
            quantity = 0
        batch_name = (data.get("batch_name") or "").strip() or f"Batch-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        if quantity < 1 or quantity > 10000:
            return jsonify({"ok": False, "message": "Quantity must be 1–10000"}), 400

        base_url = app.config["BASE_URL"]
        batch = TagBatch(
            manufacturer_id=g.current_manufacturer.id,
            batch_name=batch_name,
            quantity=quantity,
        )
        db.session.add(batch)
        db.session.flush()

        rows = []
        existing = set()
        for _ in range(quantity):
            while True:
                tid = generate_tag_id()
                if tid not in existing and Tag.query.get(tid) is None:
                    existing.add(tid)
                    break
            key = generate_security_key()
            tag = Tag(
                tag_id=tid,
                security_key=key,
                manufacturer_id=g.current_manufacturer.id,
                batch_id=batch.id,
            )
            db.session.add(tag)
            full_url = f"{base_url}/{tid}/{key}"
            rows.append({
                "tag_id": tid,
                "security_key": key,
                "full_url": full_url,
                "qr_data": full_url,
                "rfid_payload": full_url,
                "batch_id": batch.id,
                "batch_name": batch_name,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })
        db.session.commit()

        # Return CSV download
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        csv_bytes = buf.getvalue()
        filename = f"safetag-batch-{batch.id}-{batch_name.replace(' ', '_')}.csv"
        return Response(
            csv_bytes,
            mimetype="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Batch-Id": str(batch.id),
            },
        )

    # M4
    @app.route("/api/manufacturer/batches", methods=["GET"])
    @manufacturer_required
    def api_mfr_batches():
        m = g.current_manufacturer
        batches = TagBatch.query.filter_by(manufacturer_id=m.id).order_by(TagBatch.created_at.desc()).all()
        out = []
        for b in batches:
            activated = Tag.query.filter_by(batch_id=b.id, is_active=True).count()
            d = b.to_dict()
            d["activated_count"] = activated
            d["activation_rate"] = round(activated / b.quantity * 100, 1) if b.quantity else 0
            out.append(d)
        return jsonify({"ok": True, "batches": out})

    # M5
    @app.route("/api/manufacturer/batch/<int:batch_id>", methods=["GET"])
    @manufacturer_required
    def api_mfr_batch_detail(batch_id):
        b = TagBatch.query.get(batch_id)
        if not b or b.manufacturer_id != g.current_manufacturer.id:
            return jsonify({"ok": False, "message": "Batch not found"}), 404
        tags = Tag.query.filter_by(batch_id=b.id).order_by(Tag.created_at.asc()).all()
        base_url = app.config["BASE_URL"]
        tag_list = [
            {
                "tag_id": t.tag_id,
                "security_key": t.security_key,
                "is_active": t.is_active,
                "scan_count": t.scan_count,
                "activated_at": t.activated_at.isoformat() if t.activated_at else None,
                "url": f"{base_url}/{t.tag_id}/{t.security_key}",
            }
            for t in tags
        ]
        return jsonify({"ok": True, "batch": b.to_dict(), "tags": tag_list})

    # M5b — download batch CSV again
    @app.route("/api/manufacturer/batch/<int:batch_id>/csv", methods=["GET"])
    @manufacturer_required
    def api_mfr_batch_csv(batch_id):
        b = TagBatch.query.get(batch_id)
        if not b or b.manufacturer_id != g.current_manufacturer.id:
            return jsonify({"ok": False, "message": "Batch not found"}), 404
        tags = Tag.query.filter_by(batch_id=b.id).order_by(Tag.created_at.asc()).all()
        base_url = app.config["BASE_URL"]
        buf = io.StringIO()
        fieldnames = ["tag_id", "security_key", "full_url", "qr_data", "rfid_payload",
                      "batch_id", "batch_name", "created_at"]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for t in tags:
            url = f"{base_url}/{t.tag_id}/{t.security_key}"
            writer.writerow({
                "tag_id": t.tag_id,
                "security_key": t.security_key,
                "full_url": url,
                "qr_data": url,
                "rfid_payload": url,
                "batch_id": b.id,
                "batch_name": b.batch_name,
                "created_at": t.created_at.isoformat() + "Z" if t.created_at else "",
            })
        filename = f"safetag-batch-{b.id}.csv"
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # M6
    @app.route("/api/manufacturer/listings", methods=["GET"])
    @manufacturer_required
    def api_mfr_listings():
        listings = ProductListing.query.filter_by(manufacturer_id=g.current_manufacturer.id) \
            .order_by(ProductListing.created_at.desc()).all()
        return jsonify({"ok": True, "listings": [l.to_dict() for l in listings]})

    # M7
    @app.route("/api/manufacturer/listings", methods=["POST"])
    @manufacturer_required
    def api_mfr_listings_create():
        data = request.get_json(silent=True) or request.form.to_dict()
        errors, parsed = _validate_listing(data)
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        l = ProductListing(manufacturer_id=g.current_manufacturer.id, **parsed)
        db.session.add(l)
        db.session.commit()
        return jsonify({"ok": True, "listing_id": l.id, "listing": l.to_dict()})

    # M8
    @app.route("/api/manufacturer/listings/<int:listing_id>", methods=["PUT", "POST"])
    @manufacturer_required
    def api_mfr_listings_update(listing_id):
        l = ProductListing.query.get(listing_id)
        if not l or l.manufacturer_id != g.current_manufacturer.id:
            return jsonify({"ok": False, "message": "Listing not found"}), 404
        data = request.get_json(silent=True) or request.form.to_dict()
        errors, parsed = _validate_listing(data, partial=True)
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
        for k, v in parsed.items():
            setattr(l, k, v)
        # Edits revert to pending approval unless admin
        l.is_approved = False
        db.session.commit()
        return jsonify({"ok": True, "listing": l.to_dict()})

    # M9
    @app.route("/api/manufacturer/listings/<int:listing_id>", methods=["DELETE"])
    @manufacturer_required
    def api_mfr_listings_delete(listing_id):
        l = ProductListing.query.get(listing_id)
        if not l or l.manufacturer_id != g.current_manufacturer.id:
            return jsonify({"ok": False, "message": "Listing not found"}), 404
        db.session.delete(l)
        db.session.commit()
        return jsonify({"ok": True})

    # =========================================================================
    # STORE (public)
    # =========================================================================

    # S1
    @app.route("/api/store/products", methods=["GET"])
    def api_store_products():
        q = ProductListing.query.filter_by(is_approved=True, is_rejected=False)
        cat = request.args.get("category")
        if cat and cat in ALLOWED_CATEGORIES:
            q = q.filter_by(category=cat)
        if request.args.get("featured") in ("true", "1"):
            q = q.filter_by(is_featured=True)
        q = q.order_by(ProductListing.is_featured.desc(), ProductListing.created_at.desc())
        listings = q.all()
        return jsonify({"ok": True, "products": [l.to_dict() for l in listings]})

    # S2
    @app.route("/api/store/products/<int:product_id>", methods=["GET"])
    def api_store_product_detail(product_id):
        l = ProductListing.query.get(product_id)
        if not l or not l.is_approved or l.is_rejected:
            return jsonify({"ok": False, "message": "Product not found"}), 404
        return jsonify({"ok": True, "product": l.to_dict()})

    # =========================================================================
    # PAYMENT + ORDERS
    # =========================================================================

    # PAY1
    @app.route("/api/payment/initiate", methods=["POST"])
    @login_required
    def api_payment_initiate():
        data = request.get_json(silent=True) or request.form.to_dict()
        try:
            product_id = int(data.get("product_listing_id") or 0)
            quantity = int(data.get("quantity") or 1)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "message": "Invalid request"}), 400
        if quantity < 1 or quantity > 100:
            return jsonify({"ok": False, "message": "Quantity must be 1–100"}), 400
        product = ProductListing.query.get(product_id)
        if not product or not product.is_approved:
            return jsonify({"ok": False, "message": "Product not available"}), 404
        if product.quantity_available < quantity:
            return jsonify({"ok": False, "message": "Insufficient stock"}), 400

        amount = product.price * quantity  # paise
        currency = "INR"

        if app.config["DUMMY_PAYMENT"]:
            order_id = f"order_dummy_{secrets_hex(12)}"
            return jsonify({
                "ok": True,
                "dummy": True,
                "order_id": order_id,
                "amount": amount,
                "currency": currency,
                "key_id": "rzp_test_dummy",
            })

        try:
            import razorpay
            client = razorpay.Client(auth=(app.config["RAZORPAY_KEY_ID"], app.config["RAZORPAY_KEY_SECRET"]))
            rzp_order = client.order.create({
                "amount": amount,
                "currency": currency,
                "payment_capture": 1,
            })
            return jsonify({
                "ok": True,
                "order_id": rzp_order["id"],
                "amount": amount,
                "currency": currency,
                "key_id": app.config["RAZORPAY_KEY_ID"],
            })
        except Exception as e:
            app.logger.exception("Razorpay error")
            return jsonify({"ok": False, "message": "Payment provider error"}), 502

    # PAY2
    @app.route("/api/payment/success", methods=["POST"])
    @login_required
    def api_payment_success():
        data = request.get_json(silent=True) or request.form.to_dict()
        try:
            product_id = int(data.get("product_listing_id") or 0)
            quantity = int(data.get("quantity") or 1)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "message": "Invalid request"}), 400
        product = ProductListing.query.get(product_id)
        if not product:
            return jsonify({"ok": False, "message": "Product not found"}), 404

        rzp_order_id = data.get("razorpay_order_id")
        rzp_payment_id = data.get("razorpay_payment_id")
        rzp_signature = data.get("razorpay_signature")

        if not app.config["DUMMY_PAYMENT"]:
            # CRITICAL: verify Razorpay signature
            try:
                import razorpay
                client = razorpay.Client(auth=(app.config["RAZORPAY_KEY_ID"], app.config["RAZORPAY_KEY_SECRET"]))
                client.utility.verify_payment_signature({
                    "razorpay_order_id": rzp_order_id,
                    "razorpay_payment_id": rzp_payment_id,
                    "razorpay_signature": rzp_signature,
                })
            except Exception:
                app.logger.exception("Razorpay signature verification failed")
                return jsonify({"ok": False, "message": "Signature verification failed"}), 400

        amount = product.price * quantity
        order = Order(
            user_id=g.current_user.id,
            product_listing_id=product.id,
            quantity=quantity,
            amount=amount,
            status="pending",
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=rzp_payment_id,
            shipping_address=(data.get("shipping_address") or "").strip() or None,
        )
        product.quantity_available = max(0, product.quantity_available - quantity)
        db.session.add(order)
        db.session.commit()
        return jsonify({"ok": True, "order_id": order.id, "order": order.to_dict()})

    # =========================================================================
    # ADMIN
    # =========================================================================

    # A1 stats
    @app.route("/api/admin/stats", methods=["GET"])
    @admin_required
    def api_admin_stats():
        total_tags = Tag.query.count()
        activated = Tag.query.filter_by(is_active=True).count()
        activation_rate = round(activated / total_tags * 100, 1) if total_tags else 0
        total_users = User.query.count()
        week_ago = datetime.utcnow() - timedelta(days=7)
        new_users_week = User.query.filter(User.created_at >= week_ago).count()
        total_manufacturers = Manufacturer.query.count()
        pending_mfr = Manufacturer.query.filter_by(is_approved=False).count()
        total_orders = Order.query.count()
        pending_orders = Order.query.filter_by(status="pending").count()
        revenue_week = db.session.query(func.coalesce(func.sum(Order.amount), 0)) \
            .filter(Order.created_at >= week_ago).scalar() or 0

        # Recent activity feed (last 10 events)
        recent = []
        for u in User.query.order_by(User.created_at.desc()).limit(5):
            recent.append({"type": "user", "ts": u.created_at.isoformat(), "label": f"New customer: {u.email}"})
        for o in Order.query.order_by(Order.created_at.desc()).limit(5):
            recent.append({"type": "order", "ts": o.created_at.isoformat(), "label": f"Order #{o.id} (₹{o.amount/100:.0f})"})
        for m in Manufacturer.query.order_by(Manufacturer.created_at.desc()).limit(5):
            recent.append({"type": "manufacturer", "ts": m.created_at.isoformat(), "label": f"Manufacturer signup: {m.business_name}"})
        recent.sort(key=lambda x: x["ts"], reverse=True)
        recent = recent[:10]

        return jsonify({
            "ok": True,
            "stats": {
                "total_tags": total_tags,
                "activated_tags": activated,
                "activation_rate": activation_rate,
                "total_users": total_users,
                "new_users_week": new_users_week,
                "total_manufacturers": total_manufacturers,
                "pending_manufacturers": pending_mfr,
                "total_orders": total_orders,
                "pending_orders": pending_orders,
                "revenue_week_paise": revenue_week,
                "revenue_week_inr": round(revenue_week / 100, 2),
            },
            "recent_activity": recent,
        })

    # A2
    @app.route("/api/admin/manufacturers", methods=["GET"])
    @admin_required
    def api_admin_manufacturers():
        mfrs = Manufacturer.query.order_by(Manufacturer.created_at.desc()).all()
        return jsonify({"ok": True, "manufacturers": [m.to_dict() for m in mfrs]})

    # A3
    @app.route("/api/admin/manufacturers/<int:mid>/approve", methods=["POST"])
    @admin_required
    def api_admin_mfr_approve(mid):
        m = Manufacturer.query.get(mid)
        if not m:
            return jsonify({"ok": False, "message": "Not found"}), 404
        m.is_approved = True
        m.is_blocked = False
        db.session.commit()
        return jsonify({"ok": True})

    # A4
    @app.route("/api/admin/manufacturers/<int:mid>/block", methods=["POST"])
    @admin_required
    def api_admin_mfr_block(mid):
        m = Manufacturer.query.get(mid)
        if not m:
            return jsonify({"ok": False, "message": "Not found"}), 404
        m.is_blocked = True
        db.session.commit()
        return jsonify({"ok": True})

    # A5
    @app.route("/api/admin/listings", methods=["GET"])
    @admin_required
    def api_admin_listings():
        listings = ProductListing.query.order_by(ProductListing.created_at.desc()).all()
        return jsonify({"ok": True, "listings": [l.to_dict() for l in listings]})

    # A6
    @app.route("/api/admin/listings/<int:lid>/approve", methods=["POST"])
    @admin_required
    def api_admin_listing_approve(lid):
        l = ProductListing.query.get(lid)
        if not l:
            return jsonify({"ok": False, "message": "Not found"}), 404
        l.is_approved = True
        l.is_rejected = False
        db.session.commit()
        return jsonify({"ok": True})

    # A7
    @app.route("/api/admin/listings/<int:lid>/reject", methods=["POST"])
    @admin_required
    def api_admin_listing_reject(lid):
        l = ProductListing.query.get(lid)
        if not l:
            return jsonify({"ok": False, "message": "Not found"}), 404
        l.is_approved = False
        l.is_rejected = True
        db.session.commit()
        return jsonify({"ok": True})

    # A7b — feature toggle (SDD: admin sets featured)
    @app.route("/api/admin/listings/<int:lid>/feature", methods=["POST"])
    @admin_required
    def api_admin_listing_feature(lid):
        l = ProductListing.query.get(lid)
        if not l:
            return jsonify({"ok": False, "message": "Not found"}), 404
        data = request.get_json(silent=True) or {}
        l.is_featured = bool(data.get("is_featured", not l.is_featured))
        db.session.commit()
        return jsonify({"ok": True, "is_featured": l.is_featured})

    # A8
    @app.route("/api/admin/orders", methods=["GET"])
    @admin_required
    def api_admin_orders():
        q = Order.query
        status = request.args.get("status")
        if status and status in ALLOWED_ORDER_STATUS:
            q = q.filter_by(status=status)
        orders = q.order_by(Order.created_at.desc()).all()
        return jsonify({"ok": True, "orders": [o.to_dict(include_user=True, include_product=True) for o in orders]})

    # A9
    @app.route("/api/admin/orders/<int:oid>/dispatch", methods=["POST"])
    @admin_required
    def api_admin_order_dispatch(oid):
        o = Order.query.get(oid)
        if not o:
            return jsonify({"ok": False, "message": "Not found"}), 404
        data = request.get_json(silent=True) or request.form.to_dict()
        tracking_id = (data.get("tracking_id") or "").strip()
        o.status = "dispatched"
        if tracking_id:
            o.tracking_id = tracking_id
        db.session.commit()
        return jsonify({"ok": True, "order": o.to_dict()})

    # A9b — generic status update (delivered/cancelled)
    @app.route("/api/admin/orders/<int:oid>/status", methods=["POST"])
    @admin_required
    def api_admin_order_status(oid):
        o = Order.query.get(oid)
        if not o:
            return jsonify({"ok": False, "message": "Not found"}), 404
        data = request.get_json(silent=True) or request.form.to_dict()
        status = (data.get("status") or "").strip()
        if status not in ALLOWED_ORDER_STATUS:
            return jsonify({"ok": False, "message": "Invalid status"}), 400
        o.status = status
        if "tracking_id" in data:
            o.tracking_id = (data["tracking_id"] or "").strip() or None
        db.session.commit()
        return jsonify({"ok": True, "order": o.to_dict()})

    # A9c — CSV export of orders
    @app.route("/api/admin/orders.csv", methods=["GET"])
    @admin_required
    def api_admin_orders_csv():
        orders = Order.query.order_by(Order.created_at.desc()).all()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "user_email", "product", "quantity", "amount_inr",
                          "status", "tracking_id", "created_at"])
        for o in orders:
            writer.writerow([
                o.id,
                o.user.email if o.user else "",
                o.product_listing.name if o.product_listing else "",
                o.quantity,
                f"{o.amount/100:.2f}",
                o.status,
                o.tracking_id or "",
                o.created_at.isoformat() if o.created_at else "",
            ])
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": 'attachment; filename="safetag-orders.csv"'},
        )

    # A10
    @app.route("/api/admin/users", methods=["GET"])
    @admin_required
    def api_admin_users():
        users = User.query.order_by(User.created_at.desc()).all()
        out = []
        for u in users:
            tag_count = Tag.query.filter_by(owner_id=u.id).count()
            order_count = Order.query.filter_by(user_id=u.id).count()
            d = u.to_dict()
            d.update({"tag_count": tag_count, "order_count": order_count})
            out.append(d)
        return jsonify({"ok": True, "users": out})

    @app.route("/api/admin/users/<int:uid>/deactivate", methods=["POST"])
    @admin_required
    def api_admin_user_deactivate(uid):
        u = User.query.get(uid)
        if not u:
            return jsonify({"ok": False, "message": "Not found"}), 404
        u.is_active = False
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/admin/users/<int:uid>/activate", methods=["POST"])
    @admin_required
    def api_admin_user_activate(uid):
        u = User.query.get(uid)
        if not u:
            return jsonify({"ok": False, "message": "Not found"}), 404
        u.is_active = True
        db.session.commit()
        return jsonify({"ok": True})

    # =========================================================================
    # QR + LOCATION ALERT
    # =========================================================================

    # T7  /api/qr/<tag_id>  — generate PNG via qrcode[pil]
    @app.route("/api/qr/<tag_id>", methods=["GET"])
    def api_qr(tag_id):
        tag = Tag.query.get(tag_id.upper())
        if not tag:
            return jsonify({"ok": False, "message": "Tag not found"}), 404
        url = f"{app.config['BASE_URL']}/{tag.tag_id}/{tag.security_key}"
        import qrcode
        from qrcode.image.pil import PilImage
        img = qrcode.make(url, image_factory=PilImage, box_size=10, border=2)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return send_file(buf, mimetype="image/png", download_name=f"safetag-{tag.tag_id}.png")

    # X1  /api/location-alert  — Twilio with graceful fallback
    @app.route("/api/location-alert", methods=["POST"])
    @limiter.limit("10 per minute")
    def api_location_alert():
        data = request.get_json(silent=True) or {}
        tag_id = (data.get("tag_id") or "").strip().upper()
        lat = _to_float(data.get("lat"))
        lng = _to_float(data.get("lng"))
        tag = Tag.query.get(tag_id)
        if not tag:
            return jsonify({"ok": False, "message": "Tag not found"}), 404

        profile = tag.profile
        if not profile or not profile.owner_whatsapp:
            # No WhatsApp configured — still return ok per SDD ("graceful fail")
            return jsonify({"ok": True, "message": "No alert target configured"})

        maps_url = f"https://maps.google.com/?q={lat},{lng}" if (lat is not None and lng is not None) else None
        msg_body = f"Your SafeTag ({tag.tag_id}) was scanned."
        if maps_url:
            msg_body += f" Location: {maps_url}"

        sid = app.config.get("TWILIO_ACCOUNT_SID")
        token = app.config.get("TWILIO_AUTH_TOKEN")
        from_ = app.config.get("TWILIO_WHATSAPP_FROM")
        sent = False
        if sid and token and from_:
            try:
                from twilio.rest import Client
                client = Client(sid, token)
                to_ = f"whatsapp:+91{profile.owner_whatsapp}"
                client.messages.create(body=msg_body, from_=from_, to=to_)
                sent = True
            except Exception:
                app.logger.exception("Twilio send failed")

        return jsonify({"ok": True, "delivered": sent, "message": "Owner notified" if sent else "Alert logged"})


# =============================================================================
# Helpers (module-private)
# =============================================================================
def _to_float(val):
    try:
        if val in (None, ""):
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def _validate_listing(data, partial=False):
    """Return (errors_dict, parsed_dict) for create or partial-update."""
    errors = {}
    parsed = {}

    def need(field, validator, message):
        val = data.get(field)
        if val in (None, ""):
            if not partial:
                errors[field] = message
            return
        ok, parsed_val = validator(val)
        if not ok:
            errors[field] = message
        else:
            parsed[field] = parsed_val

    def _str_ok(v, max_len=255, min_len=1):
        s = str(v).strip()
        return (min_len <= len(s) <= max_len, s)

    need("name", lambda v: _str_ok(v, 255, 2), "Name 2–255 chars required")
    need("description", lambda v: _str_ok(v, 5000, 1), "Description required")

    def _price_ok(v):
        try:
            p = int(v)
            return (1 <= p <= 100000000, p)
        except (TypeError, ValueError):
            return (False, None)
    need("price", _price_ok, "Price (paise) must be a positive integer")

    def _cat_ok(v):
        return (str(v).strip().lower() in ALLOWED_CATEGORIES, str(v).strip().lower())
    need("category", _cat_ok, "Category must be one of keychain/card/sticker/wristband")

    def _qty_ok(v):
        try:
            q = int(v)
            return (q >= 0, q)
        except (TypeError, ValueError):
            return (False, None)
    need("quantity_available", _qty_ok, "Quantity must be non-negative integer")

    if "photo_url" in data:
        parsed["photo_url"] = (data["photo_url"] or "").strip() or None

    return errors, parsed


def secrets_hex(n):
    """Convenience: short random hex (used for dummy order ids)."""
    import secrets
    return secrets.token_hex(n)


# Create module-level app instance for gunicorn (app:app)
app = create_app()


if __name__ == "__main__":
    # Local dev: create tables on first run, then start dev server
    with app.app_context():
        db.create_all()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=bool(int(os.environ.get("FLASK_DEBUG", "1"))))
