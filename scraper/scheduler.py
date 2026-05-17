from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime

import schedule

from db import Database
from matcher.matcher import Matcher
from risk.risk_scorer import RiskScorer
from run_scrapers_once import load_components, parse_types, run_source


DEFAULT_TYPES = parse_types(None)
SOURCE_JOBS = (
    ('ebay', False),
    ('mindfactory', False),
    ('geizhals', True),
)


def log(message: str) -> None:
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {message}', flush=True)


def run_scheduled_source(source_name: str, geizhals_safe: bool = False, limit: int | None = None) -> dict:
    log(f'Starting {source_name} scraper job')

    db = Database()
    matcher = Matcher()
    risk_scorer = RiskScorer()

    try:
        db.connect()
        components = load_components(db, DEFAULT_TYPES, limit=limit)
        log(f'{source_name}: loaded {len(components)} DB components')

        if not components:
            log(f'{source_name}: no components found, skipping')
            return {'errors': 0}

        stats = run_source(
            source_name=source_name,
            components=components,
            db=db,
            matcher=matcher,
            risk_scorer=risk_scorer,
            geizhals_safe=geizhals_safe,
        )
        log(f'{source_name}: finished {stats}')
        return stats
    except Exception as e:
        log(f'{source_name}: job failed but scheduler continues: {e}')
        return {'errors': 1}
    finally:
        try:
            db.disconnect()
        except Exception as e:
            log(f'{source_name}: DB disconnect failed: {e}')


def run_once(limit: int) -> None:
    log('Running scheduler once')
    for source_name, geizhals_safe in SOURCE_JOBS:
        run_scheduled_source(source_name, geizhals_safe=geizhals_safe, limit=limit)
    log('Scheduler once run complete')


def configure_schedule() -> None:
    schedule.every(6).hours.do(run_scheduled_source, 'ebay', geizhals_safe=False)
    schedule.every(12).hours.do(run_scheduled_source, 'mindfactory', geizhals_safe=False)
    schedule.every(1).days.do(run_scheduled_source, 'geizhals', geizhals_safe=True)


def main() -> None:
    parser = argparse.ArgumentParser(description='Periodic scraper scheduler.')
    parser.add_argument('--once', action='store_true', help='Run all scheduled scraper jobs once and exit.')
    parser.add_argument('--once-limit', type=int, default=3, help='Component limit per source for --once testing.')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    if args.once:
        run_once(args.once_limit)
        return

    configure_schedule()
    log('Scheduler started: ebay every 6h, mindfactory every 12h, geizhals daily')

    while True:
        try:
            schedule.run_pending()
        except Exception as e:
            log(f'Scheduler loop error, continuing: {e}')
        time.sleep(60)


if __name__ == '__main__':
    main()
