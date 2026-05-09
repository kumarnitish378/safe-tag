#!/usr/bin/env python3
"""
Safe-Tag Factory Script
=======================
Generates 1,000 unique serial numbers + short URL slugs,
inserts them into the database (is_active=False),
and exports a print-ready CSV for the physical printing press.

Usage:
    python scripts/factory.py [--count 1000] [--year 2026] [--output tags_batch.csv]

Requirements:
    pip install flask flask-sqlalchemy
    Set DATABASE_URL env-var or use the default SQLite dev DB.
"""

import os
import sys
import csv
import string
import secrets
import argparse
from datetime import datetime

# Ensure the parent directory is on the path so we can import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, Tag


def generate_unique_slug(existing_slugs: set, length: int = 6) -> str:
    """
    Cryptographically random, non-sequential slug.
    Excludes visually ambiguous characters (0, O, I, l).
    """
    alphabet = (
        string.ascii_uppercase.replace("O", "").replace("I", "") +
        string.ascii_lowercase.replace("l", "") +
        string.digits.replace("0", "")
    )
    while True:
        slug = "".join(secrets.choice(alphabet) for _ in range(length))
        if slug not in existing_slugs:
            existing_slugs.add(slug)
            return slug


def generate_serial(year: int, sequence: int) -> str:
    """
    Format: ST-{YEAR}-{ZERO_PADDED_SEQUENCE}
    Example: ST-2026-00042
    """
    return f"ST-{year}-{sequence:05d}"


def run_factory(count: int, year: int, output_csv: str):
    with app.app_context():
        db.create_all()

        print(f"[Factory] Generating {count} tags for year {year}...")

        # Collect all slugs already in DB to avoid duplicates
        existing_slugs = {t.short_url_slug for t in Tag.query.with_entities(Tag.short_url_slug).all()}
        existing_serials = {t.serial_number for t in Tag.query.with_entities(Tag.serial_number).all()}

        # Find the highest existing sequence number for this year prefix
        prefix = f"ST-{year}-"
        max_seq = 0
        for sn in existing_serials:
            if sn.startswith(prefix):
                try:
                    seq = int(sn[len(prefix):])
                    max_seq = max(max_seq, seq)
                except ValueError:
                    pass

        new_tags    = []
        csv_rows    = []
        base_url    = "https://safe-tag.in/v/"

        for i in range(1, count + 1):
            sequence      = max_seq + i
            serial_number = generate_serial(year, sequence)
            slug          = generate_unique_slug(existing_slugs)
            public_url    = f"{base_url}{slug}"

            tag = Tag(
                serial_number  = serial_number,
                short_url_slug = slug,
                is_active      = False,
            )
            new_tags.append(tag)
            csv_rows.append({
                "serial_number": serial_number,
                "short_url_slug": slug,
                "public_url": public_url,
                "qr_data": public_url,           # QR encodes the URL
                "rfid_payload": serial_number,   # RFID chip stores the serial
            })

        # Bulk insert
        db.session.bulk_save_objects(new_tags)
        db.session.commit()
        print(f"[Factory] ✅ {count} tags inserted into database.")

        # Export CSV
        fieldnames = ["serial_number", "short_url_slug", "public_url", "qr_data", "rfid_payload"]
        with open(output_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)

        print(f"[Factory] ✅ CSV exported → {output_csv}")
        print(f"[Factory] Sample rows:")
        for row in csv_rows[:3]:
            print(f"          {row}")
        print(f"          ... ({count - 3} more rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Safe-Tag Factory: Batch generate tags.")
    parser.add_argument("--count",  type=int, default=1000,            help="Number of tags to generate (default: 1000)")
    parser.add_argument("--year",   type=int, default=datetime.now().year, help="Year prefix for serial numbers")
    parser.add_argument("--output", type=str, default="tags_batch.csv", help="Output CSV filename")
    args = parser.parse_args()

    run_factory(count=args.count, year=args.year, output_csv=args.output)
