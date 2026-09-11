from .db import SessionLocal
from .models import Location

SEED_LOCATIONS = [
    {"type": "college", "name": "Assam down town University", "city": "Guwahati"},
    {"type": "college", "name": "Assam Don Bosco University (ADTU)", "city": "Guwahati"},
    {"type": "area", "name": "Six Mile", "city": "Guwahati"},
]


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(Location).count() == 0:
            db.add_all(Location(**row) for row in SEED_LOCATIONS)
            db.commit()
            print(f"seeded {len(SEED_LOCATIONS)} locations")
        else:
            print("locations already seeded, skipping")
    finally:
        db.close()


if __name__ == "__main__":
    main()
