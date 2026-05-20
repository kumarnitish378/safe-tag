import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db, generate_batch


def main():
    parser = argparse.ArgumentParser(description="Generate SafeTag tag IDs and security keys.")
    parser.add_argument("--qty", type=int, required=True)
    parser.add_argument("--batch", required=True, dest="batch_name")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    with app.app_context():
        db.create_all()
        batch, rows = generate_batch(args.qty, args.batch_name)
        db.session.commit()
        filename = args.output or f"batch_{batch.id}_{args.batch_name.replace(' ', '_')}.csv"
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "tag_id",
                    "security_key",
                    "full_url",
                    "qr_data",
                    "rfid_payload",
                    "batch_id",
                    "batch_name",
                    "created_at",
                ],
            )
            writer.writeheader()
            writer.writerows(rows)
        print(f"Generated {len(rows)} tags in batch {batch.id}. CSV: {filename}")


if __name__ == "__main__":
    main()
