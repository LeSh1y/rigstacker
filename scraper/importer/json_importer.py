import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import Database

REQUIRED_FIELDS = {"source", "component_type", "component_id", "title", "condition", "price_eur"}


def find_existing_offer(db, source, external_id, component_id, title):
    if external_id:
        return db.fetchone(
            "SELECT id FROM offers WHERE source=%s AND external_id=%s",
            (source, external_id),
        )
    return db.fetchone(
        "SELECT id FROM offers WHERE source=%s AND component_id=%s AND title=%s",
        (source, component_id, title),
    )


def import_offers(filepath):
    with open(filepath, encoding="utf-8") as f:
        offers = json.load(f)

    db = Database()
    db.connect()

    new_count = updated = failed = 0

    for offer in offers:
        missing = REQUIRED_FIELDS - offer.keys()
        if missing:
            print(f"  SKIP missing fields {missing}: {offer.get('title', '?')}")
            failed += 1
            continue

        source = offer["source"]
        external_id = offer.get("external_id")
        component_type = offer["component_type"]
        component_id = offer["component_id"]
        title = offer["title"]
        condition = offer["condition"]
        price_eur = float(offer["price_eur"])
        url = offer.get("url")
        seller_name = offer.get("seller_name")
        seller_rating = offer.get("seller_rating")

        try:
            existing = find_existing_offer(db, source, external_id, component_id, title)

            if existing:
                offer_id = existing["id"]
                db.execute(
                    """UPDATE offers
                       SET price_eur=%s, last_seen_at=NOW(), is_active=1
                       WHERE id=%s""",
                    (price_eur, offer_id),
                )
                updated += 1
            else:
                db.execute(
                    """INSERT INTO offers
                       (source, external_id, component_type, component_id,
                        title, `condition`, price_eur, url, seller_name, seller_rating,
                        is_active, created_at, last_seen_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,NOW(),NOW())""",
                    (source, external_id, component_type, component_id,
                     title, condition, price_eur, url, seller_name, seller_rating),
                )
                offer_id = db.cursor.lastrowid
                new_count += 1

            db.execute(
                """INSERT INTO price_history
                   (offer_id, component_type, component_id, source, `condition`, price_eur, recorded_at)
                   VALUES (%s, %s, %s, %s, %s, %s, NOW())""",
                (offer_id, component_type, component_id, source, condition, price_eur),
            )

        except Exception as e:
            print(f"  ERROR processing '{title}': {e}")
            failed += 1

    db.disconnect()
    print(f"\nDone: {new_count} new, {updated} updated, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description="Import offers from a JSON file")
    parser.add_argument("--file", required=True, help="Path to JSON file")
    args = parser.parse_args()
    import_offers(args.file)


if __name__ == "__main__":
    main()
