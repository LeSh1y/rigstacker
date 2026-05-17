from __future__ import annotations

import argparse
import inspect
import logging
import random
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from db import Database, TABLE_MAP
from matcher.matcher import Matcher
from risk.risk_scorer import RiskScorer
from sources.parsers.ebay import EbaySource
from sources.parsers.geizhals import GeizhalsSource
from sources.parsers.mindfactory import MindfactorySource


SOURCE_DELAYS = {
    'mindfactory': (2.0, 2.0),
    'ebay': (1.0, 1.0),
    'geizhals': (10.0, 20.0),
}

SOURCE_CLASSES = {
    'mindfactory': MindfactorySource,
    'ebay': EbaySource,
    'geizhals': GeizhalsSource,
}

TYPE_ALIASES = {
    'motherboard': 'mainboard',
    'mainboards': 'mainboard',
    'mobo': 'mainboard',
    'ssd': 'storage',
    'storage': 'storage',
}

SUMMARY_KEYS = ('new', 'used', 'skipped', 'updated', 'processed', 'errors')


@dataclass
class Component:
    component_type: str
    name: str
    component_id: int


class GeizhalsRateLimitDetector(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.rate_limited = False

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage().lower()
        if (
            'http 403' in msg
            or '403 client error' in msg
            or 'blocked' in msg
            or 'challenge' in msg
        ):
            self.rate_limited = True

    def reset(self) -> None:
        self.rate_limited = False


def normalize_type(component_type: str) -> str:
    value = component_type.strip().lower()
    return TYPE_ALIASES.get(value, value)


def parse_types(raw: str | None) -> list[str]:
    if not raw:
        return list(TABLE_MAP.keys())

    types = []
    for item in raw.split(','):
        component_type = normalize_type(item)
        if component_type not in TABLE_MAP:
            raise SystemExit(f'Unknown component type: {item}')
        if component_type not in types:
            types.append(component_type)
    return types


def load_components(db: Database, component_types: list[str], limit: int | None) -> list[Component]:
    components: list[Component] = []

    for component_type in component_types:
        table = TABLE_MAP[component_type]
        query = f'SELECT id, name FROM {table} WHERE is_available = 1 ORDER BY id'
        params: tuple[Any, ...] = ()

        if limit is not None:
            remaining = limit - len(components)
            if remaining <= 0:
                break
            query += ' LIMIT %s'
            params = (remaining,)

        rows = db.fetchall(query, params)
        for row in rows:
            components.append(Component(component_type, row['name'], row['id']))

    return components


def selected_sources(source: str, skip_geizhals: bool) -> list[str]:
    if source == 'all':
        names = ['mindfactory', 'ebay', 'geizhals']
    else:
        names = [source]

    if skip_geizhals:
        names = [name for name in names if name != 'geizhals']

    return names


def call_fetch(
    source_name: str,
    source: Any,
    component: Component,
    db: Database,
    matcher: Matcher,
    risk_scorer: RiskScorer,
) -> dict:
    method = source.fetch_for_component
    params = inspect.signature(method).parameters

    kwargs = {}
    if 'matcher' in params:
        kwargs['matcher'] = matcher
    if 'risk_scorer' in params:
        kwargs['risk_scorer'] = risk_scorer

    if source_name == 'ebay':
        return method(
            component.component_type,
            component.name,
            component.component_id,
            db,
            matcher,
            risk_scorer,
        )

    return method(
        component.component_type,
        component.name,
        component.component_id,
        db,
        **kwargs,
    )


def delay_for(source_name: str) -> float:
    lo, hi = SOURCE_DELAYS[source_name]
    return lo if lo == hi else random.uniform(lo, hi)


def print_summary_row(source: str, component: Component, stats: dict) -> None:
    values = ' '.join(f'{key}={stats.get(key, 0)}' for key in SUMMARY_KEYS)
    print(f'[{source}] {component.component_type:<9} {component.name} | {values}')


def merge_stats(total: dict, stats: dict) -> None:
    for key in SUMMARY_KEYS:
        total[key] += stats.get(key, 0)


def run_source(
    source_name: str,
    components: list[Component],
    db: Database,
    matcher: Matcher,
    risk_scorer: RiskScorer,
    geizhals_safe: bool,
) -> dict:
    print(f'\n=== Running {source_name} ({len(components)} components) ===')
    source = SOURCE_CLASSES[source_name]()
    total = defaultdict(int)

    detector = None
    logger = None
    if source_name == 'geizhals':
      detector = GeizhalsRateLimitDetector()
      logger = logging.getLogger('sources.parsers.geizhals')
      logger.addHandler(detector)

    try:
        for i, component in enumerate(components, start=1):
            if detector:
                detector.reset()

            print(f'[{source_name}] {i}/{len(components)} {component.component_type}: {component.name}')

            try:
                stats = call_fetch(source_name, source, component, db, matcher, risk_scorer)
                if not isinstance(stats, dict):
                    stats = {'errors': 1}
            except Exception as e:
                stats = {'errors': 1}
                print(f'[{source_name}] ERROR {component.component_type} {component.name}: {e}')

            merge_stats(total, stats)
            print_summary_row(source_name, component, stats)

            if source_name == 'geizhals' and detector and detector.rate_limited:
                print('Geizhals rate-limited, stopping Geizhals run.')
                break

            if i < len(components):
                sleep_for = delay_for(source_name)
                if source_name == 'geizhals' and geizhals_safe:
                    sleep_for = max(sleep_for, 15.0)
                time.sleep(sleep_for)
    finally:
        if logger and detector:
            logger.removeHandler(detector)

    print(f'=== {source_name} total: {dict(total)} ===')
    return dict(total)


def main() -> None:
    parser = argparse.ArgumentParser(description='Run PC component scrapers once.')
    parser.add_argument('--source', choices=['mindfactory', 'geizhals', 'ebay', 'all'], default='all')
    parser.add_argument('--limit', type=int, default=None, help='Maximum total components to scrape.')
    parser.add_argument('--types', default=None, help='Comma-separated component types, e.g. gpu,cpu,ram.')
    parser.add_argument('--skip-geizhals', action='store_true')
    parser.add_argument('--geizhals-safe', action='store_true')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    component_types = parse_types(args.types)
    sources = selected_sources(args.source, args.skip_geizhals)

    db = Database()
    matcher = Matcher()
    risk_scorer = RiskScorer()
    totals: dict[str, dict] = {}

    try:
        db.connect()
        components = load_components(db, component_types, args.limit)
        print(f'Loaded {len(components)} components: {", ".join(component_types)}')

        if not components:
            print('No components found.')
            return

        for source_name in sources:
            totals[source_name] = run_source(
                source_name,
                components,
                db,
                matcher,
                risk_scorer,
                args.geizhals_safe,
            )

        print('\n=== Final summary ===')
        for source_name, stats in totals.items():
            values = ' '.join(f'{key}={stats.get(key, 0)}' for key in SUMMARY_KEYS)
            print(f'{source_name}: {values}')
    finally:
        db.disconnect()


if __name__ == '__main__':
    main()
