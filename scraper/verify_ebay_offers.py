from __future__ import annotations

import argparse
import logging

from db import Database
from sources.ebay_availability import EbayAvailabilityAnalyzer


def main() -> None:
    parser = argparse.ArgumentParser(description='Verify stale active eBay offers.')
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--older-than-hours', type=int, default=12)
    parser.add_argument('--timeout', type=int, default=15)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    db = Database()
    try:
        db.connect()
        analyzer = EbayAvailabilityAnalyzer(db, timeout=args.timeout)
        stats = analyzer.run(older_than_hours=args.older_than_hours, limit=args.limit)
    finally:
        db.disconnect()

    summary = ' '.join(f'{key}={value}' for key, value in stats.items())
    print(f'[eBay availability] {summary}')


if __name__ == '__main__':
    main()
