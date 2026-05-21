"""Seed development data per SDD section 13.

Creates: admin user, customer user, manufacturer (approved), one product listing,
one active tag with full MedicalProfile, one inactive tag.

Usage:
    python scripts/seed.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from models import (  # noqa: E402
    Manufacturer,
    MedicalProfile,
    ProductListing,
    Tag,
    TagBatch,
    User,
    db,
)


def upsert(model, defaults=None, **filters):
    obj = model.query.filter_by(**filters).first()
    if obj:
        return obj, False
    obj = model(**filters, **(defaults or {}))
    db.session.add(obj)
    return obj, True


def main():
    app = create_app()
    with app.app_context():
        db.create_all()

        # Admin
        admin = User.query.filter_by(email="admin@test.com").first()
        if not admin:
            admin = User(email="admin@test.com", mobile="9999999999", is_admin=True, name="SafeTag Admin")
            admin.set_password("Admin@1234")
            db.session.add(admin)

        # Customer
        customer = User.query.filter_by(email="customer@test.com").first()
        if not customer:
            customer = User(email="customer@test.com", mobile="9876543210", name="Test Customer")
            customer.set_password("Test@1234")
            db.session.add(customer)

        # Manufacturer (approved)
        mfr = Manufacturer.query.filter_by(email="mfr@test.com").first()
        if not mfr:
            mfr = Manufacturer(
                email="mfr@test.com",
                business_name="Test Manufacturer",
                mobile="9000000000",
                is_approved=True,
            )
            mfr.set_password("Test@1234")
            db.session.add(mfr)

        db.session.flush()

        # Test batch
        batch = TagBatch.query.filter_by(batch_name="Test Batch").first()
        if not batch:
            batch = TagBatch(manufacturer_id=mfr.id, batch_name="Test Batch", quantity=2)
            db.session.add(batch)
            db.session.flush()

        # Tag 1: active, full profile
        t1 = Tag.query.get("TESTACT1")
        if not t1:
            t1 = Tag(
                tag_id="TESTACT1",
                security_key="testkey00001",
                is_active=True,
                manufacturer_id=mfr.id,
                batch_id=batch.id,
                owner_id=customer.id,
            )
            db.session.add(t1)
            db.session.flush()
            mp = MedicalProfile(
                tag_id="TESTACT1",
                name="Aarav Sharma",
                age=8,
                parent_name="Riya Sharma",
                blood_group="O+",
                address="123 MG Road, Pune 411001",
                latitude=18.5204,
                longitude=73.8567,
                mobile_primary="9876543210",
                mobile_secondary="9123456789",
                email="parent@test.com",
                medical_conditions="Mild asthma",
                allergies="Peanuts, Penicillin",
                medications="Inhaler as needed",
                custom_message="If found, please call my mother first. I am shy with strangers.",
                owner_whatsapp="9876543210",
                category="CHILD",
            )
            db.session.add(mp)

        # Tag 2: inactive
        t2 = Tag.query.get("TESTINAC")
        if not t2:
            t2 = Tag(
                tag_id="TESTINAC",
                security_key="testkey00002",
                is_active=False,
                manufacturer_id=mfr.id,
                batch_id=batch.id,
            )
            db.session.add(t2)

        # Product listing
        product = ProductListing.query.filter_by(name="SafeTag Key — Steel").first()
        if not product:
            product = ProductListing(
                manufacturer_id=mfr.id,
                name="SafeTag Key — Steel",
                description="Stainless steel keychain with embedded RFID and laser-etched QR code. Built to last a lifetime, waterproof, scratch resistant.",
                price=14900,  # ₹149
                category="keychain",
                quantity_available=100,
                is_approved=True,
                is_featured=True,
            )
            db.session.add(product)

        db.session.commit()

        print("Seed complete. Test accounts:")
        print("  Admin     : admin@test.com / Admin@1234")
        print("  Customer  : customer@test.com / Test@1234")
        print("  Mfr       : mfr@test.com / Test@1234 (approved)")
        print("Test URLs (Flask):")
        print(f"  Emergency : http://localhost:5000/api/scan/TESTACT1/testkey00001")
        print(f"  Register  : http://localhost:5000/api/scan/TESTINAC/testkey00002")


if __name__ == "__main__":
    main()
