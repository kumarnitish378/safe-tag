from app import (
    Manufacturer,
    MedicalProfile,
    ProductListing,
    Tag,
    User,
    app,
    db,
)


def seed():
    with app.app_context():
        db.create_all()

        customer = User.query.filter_by(email="customer@test.com").first()
        if not customer:
            customer = User(email="customer@test.com", mobile="9876543210", name="Test Customer")
            customer.set_password("Test@1234")
            db.session.add(customer)

        admin = User.query.filter_by(email="admin@test.com").first()
        if not admin:
            admin = User(email="admin@test.com", mobile="9876500000", name="Admin", is_admin=True)
            admin.set_password("Admin@1234")
            db.session.add(admin)

        mfr = Manufacturer.query.filter_by(email="mfr@test.com").first()
        if not mfr:
            mfr = Manufacturer(
                email="mfr@test.com",
                business_name="Test Manufacturer",
                mobile="9876511111",
                is_approved=True,
            )
            mfr.set_password("Test@1234")
            db.session.add(mfr)

        db.session.flush()

        active = Tag.query.get("TESTACT1")
        if not active:
            active = Tag(tag_id="TESTACT1", security_key="testkey00001", is_active=True, owner_id=customer.id)
            db.session.add(active)
        active.owner_id = customer.id
        active.is_active = True

        inactive = Tag.query.get("TESTINAC")
        if not inactive:
            inactive = Tag(tag_id="TESTINAC", security_key="testkey00002", is_active=False)
            db.session.add(inactive)

        db.session.flush()

        if not MedicalProfile.query.filter_by(tag_id="TESTACT1").first():
            db.session.add(
                MedicalProfile(
                    tag_id="TESTACT1",
                    name="Aarav Sharma",
                    age=8,
                    parent_name="Rahul Sharma",
                    blood_group="B+",
                    address="Connaught Place, New Delhi",
                    latitude=28.6315,
                    longitude=77.2167,
                    mobile_primary="9876543210",
                    mobile_secondary="9123456789",
                    email="customer@test.com",
                    medical_conditions="Mild asthma",
                    allergies="Penicillin, Peanuts",
                    medications="Salbutamol inhaler as needed",
                    custom_message="Please call my parents immediately.",
                    owner_whatsapp="9876543210",
                )
            )

        if not ProductListing.query.first():
            db.session.add(
                ProductListing(
                    manufacturer_id=mfr.id,
                    name="SafeTag Key - Steel",
                    description="Durable stainless steel SafeTag keychain with QR and RFID/NFC support.",
                    price=14900,
                    category="keychain",
                    is_approved=True,
                    is_featured=True,
                    quantity_available=100,
                    photo_url="https://images.unsplash.com/photo-1618354691373-d851c5c3a990",
                )
            )

        db.session.commit()
        print("Seeded SafeTag development data.")


if __name__ == "__main__":
    seed()
