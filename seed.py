from app import app, db, Tag, MedicalProfile, User
with app.app_context():
    db.create_all()
    tags = [("ST-2026-00001","demo01"),("ST-2026-00002","demo02"),("ST-2026-00003","demo03")]
    for serial, slug in tags:
        if not Tag.query.filter_by(serial_number=serial).first():
            db.session.add(Tag(serial_number=serial, short_url_slug=slug, is_active=False))
    db.session.commit()

    t = Tag.query.filter_by(serial_number="ST-2026-00001").first()
    if t and not t.medical:
        t.is_active = True
        db.session.add(MedicalProfile(tag_id=t.id, name="Aarav Sharma", dob="15 Aug 2018", category="child", blood_group="B+", allergies="Penicillin, Peanuts", medication_notes="None", emergency_contact_1="+919876543210", emergency_contact_2="+919123456789", owner_whatsapp="+919876543210", privacy_mode=True, custom_message="Please call my parents immediately."))
        db.session.commit()

    if not User.query.filter_by(email="admin@safe-tag.local").first():
        admin = User(email="admin@safe-tag.local", mobile_no="+919999999999", address="Local Admin")
        admin.set_password("admin1234")
        admin.is_admin = True
        db.session.add(admin)
        db.session.commit()
        print("Admin user created: admin@safe-tag.local / admin1234")

    print("Done! Tags: ST-2026-00001, ST-2026-00002, ST-2026-00003")
