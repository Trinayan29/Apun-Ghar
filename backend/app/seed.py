from .db import SessionLocal
from .models import Location

# Initial/development catalog only. NOT exhaustive. Canonical identity is (type, name).
SEED_LOCATIONS = [
    # Colleges / universities (real Guwahati institutions)
    {"type": "college", "name": "Assam Down Town University", "city": "Guwahati"},
    {"type": "college", "name": "Assam Don Bosco University", "city": "Guwahati"},
    {"type": "college", "name": "Gauhati University", "city": "Guwahati"},
    {"type": "college", "name": "Assam Engineering College", "city": "Guwahati"},
    {"type": "college", "name": "Cotton University", "city": "Guwahati"},
    {"type": "college", "name": "Indian Institute of Technology Guwahati", "city": "Guwahati"},
    {"type": "college", "name": "Gauhati Medical College", "city": "Guwahati"},
    {"type": "college", "name": "NEF College", "city": "Guwahati"},
    # Workplaces / major institutions (real anchors, not invented companies)
    {"type": "workplace", "name": "Assam Secretariat", "city": "Guwahati"},
    {"type": "workplace", "name": "GNRC Hospital", "city": "Guwahati"},
    {"type": "workplace", "name": "Gauhati High Court", "city": "Guwahati"},
    {"type": "workplace", "name": "Gauhati Medical College Hospital", "city": "Guwahati"},
    # Important areas
    {"type": "area", "name": "Six Mile", "city": "Guwahati"},
    {"type": "area", "name": "Beltola", "city": "Guwahati"},
    {"type": "area", "name": "Khanapara", "city": "Guwahati"},
    {"type": "area", "name": "Ganeshguri", "city": "Guwahati"},
    {"type": "area", "name": "Zoo Road", "city": "Guwahati"},
    {"type": "area", "name": "Jalukbari", "city": "Guwahati"},
    {"type": "area", "name": "Dispur", "city": "Guwahati"},
]

# Known inconsistent canonical names -> corrected canonical names.
# NOTE: ADTU means Assam Down Town University. It must never be attached to
# Assam Don Bosco University. No alias system here; acronym-aware search is a
# separate future feature.
RENAMES = {
    ("college", "Assam down town University"): "Assam Down Town University",
    ("college", "Assam Don Bosco University (ADTU)"): "Assam Don Bosco University",
}


def main() -> None:
    db = SessionLocal()
    try:
        inserted = 0
        renamed = 0
        for (old_type, old_name), new_name in RENAMES.items():
            row = (
                db.query(Location)
                .filter(Location.type == old_type, Location.name == old_name)
                .first()
            )
            if row is not None and row.name != new_name:
                exists = (
                    db.query(Location.id)
                    .filter(Location.type == old_type, Location.name == new_name)
                    .first()
                )
                if exists is None:
                    row.name = new_name
                    renamed += 1
        # SessionLocal uses autoflush=False, so flush renames before the
        # existence checks below; otherwise the checks cannot see them and
        # would insert a duplicate canonical row in the same run.
        db.flush()
        for item in SEED_LOCATIONS:
            exists = (
                db.query(Location.id)
                .filter(
                    Location.type == item["type"], Location.name == item["name"]
                )
                .first()
            )
            if exists is None:
                db.add(Location(**item))
                inserted += 1
        db.commit()
        print(f"seeded {inserted} locations, renamed {renamed}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
