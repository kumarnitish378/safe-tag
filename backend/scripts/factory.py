"""SafeTag Tag Factory CLI.

Generates a batch of unique tag_id + security_key pairs, inserts them
into the database, and writes a CSV ready for RFID programming and
QR printing.

Usage:
    python scripts/factory.py --qty 100 --batch "Batch-Jan-2025-Keychains" \
        [--manufacturer-email mfr@test.com] [--out path/to/out.csv]

Run from the backend/ directory (so app.py / models.py are importable).
"""
import argparse
import csv
import os
import sys
from datetime import datetime

# Make backend/ importable when running directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from models import Manufacturer, Tag, TagBatch, db  # noqa: E402
from helpers import generate_security_key, generate_tag_id  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Generate a SafeTag batch")
    parser.add_argument("--qty", type=int, required=True, help="Number of tags to generate")
    parser.add_argument("--batch", required=True, help="Batch name")
    parser.add_argument("--manufacturer-email", help="Attach batch to this manufacturer (must exist)")
    parser.add_argument("--out", help="Output CSV path (default: ./batch-<timestamp>.csv)")
    args = parser.parse_args()

    if args.qty < 1 or args.qty > 10000:
        sys.exit("--qty must be between 1 and 10000")

    app = create_app()
    with app.app_context():
        mfr = None
        if args.manufacturer_email:
            mfr = Manufacturer.query.filter_by(email=args.manufacturer_email.lower()).first()
            if not mfr:
                sys.exit(f"Manufacturer with email {args.manufacturer_email} not found")

        batch = TagBatch(
            manufacturer_id=mfr.id if mfr else None,
            batch_name=args.batch,
            quantity=args.qty,
        )
        db.session.add(batch)
        db.session.flush()

        base_url = app.config["BASE_URL"]
        rows = []
        seen = set()
        for _ in range(args.qty):
            while True:
                tid = generate_tag_id()
                if tid not in seen and Tag.query.get(tid) is None:
                    seen.add(tid)
                    break
            key = generate_security_key()
            tag = Tag(
                tag_id=tid,
                security_key=key,
                manufacturer_id=mfr.id if mfr else None,
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
                "batch_name": args.batch,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })
        db.session.commit()

        out_path = args.out or f"batch-{batch.id}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

        print(f"Generated {args.qty} tags in batch #{batch.id} ('{args.batch}').")
        print(f"CSV written to: {os.path.abspath(out_path)}")
        print("First 3 URLs:")
        for r in rows[:3]:
            print(" ", r["full_url"])


if __name__ == "__main__":
    main()
