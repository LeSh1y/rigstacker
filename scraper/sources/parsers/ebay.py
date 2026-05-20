import base64
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))

from config import EBAY_APP_ID, EBAY_CERT_ID
from sources.analyzers import refresh_recommended_new_offer, refresh_recommended_used_offer
from sources.ebay_matching import is_confident_match, is_supported_ebay_used_type, match_ebay_offer_to_component
from sources.ebay_queries import build_ebay_queries, normalize_component_type

logger = logging.getLogger(__name__)
EBAY_API_ENABLED = True

MOCK_OFFERS = [
    {
        'external_id': 'mock-001',
        'title': 'RTX 4070 Ti Super 16GB neu OVP',
        'condition': 'new',
        'price_eur': 539.00,
        'url': 'https://ebay.de/itm/mock-001',
        'seller_name': 'mock_seller_de',
        'seller_rating': 0.99,
    },
    {
        'external_id': 'mock-002',
        'title': 'RTX 4070 Ti Super gebraucht wenig benutzt',
        'condition': 'used',
        'price_eur': 410.00,
        'url': 'https://ebay.de/itm/mock-002',
        'seller_name': 'privat_mock',
        'seller_rating': 0.95,
    },
    {
        'external_id': 'mock-003',
        'title': 'RTX 4070 Ti Super Mining Karte ohne Garantie',
        'condition': 'used',
        'price_eur': 280.00,
        'url': 'https://ebay.de/itm/mock-003',
        'seller_name': 'sketchy_mock',
        'seller_rating': 0.71,
    },
]


def _float_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_shipping_price(item: dict) -> tuple[float | None, bool]:
    options = item.get('shippingOptions') or []
    prices = []

    for option in options:
        cost = option.get('shippingCost') or {}
        value = _float_or_none(cost.get('value'))
        if value is not None:
            prices.append(value)

    if prices:
        return min(prices), False

    if item.get('shippingOptions') == []:
        return None, True

    return None, True


class EbaySource:
    TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
    SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

    def __init__(self):
        self._token = None
        self._token_expires = None

    def get_token(self) -> str:
        if self._token and datetime.now() < self._token_expires:
            return self._token

        if not EBAY_APP_ID or not EBAY_CERT_ID:
            raise RuntimeError('Missing EBAY_APP_ID or EBAY_CERT_ID')

        credentials = base64.b64encode(f'{EBAY_APP_ID}:{EBAY_CERT_ID}'.encode()).decode()

        response = requests.post(
            self.TOKEN_URL,
            headers={
                'Authorization': f'Basic {credentials}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={
                'grant_type': 'client_credentials',
                'scope': 'https://api.ebay.com/oauth/api_scope',
            },
            timeout=20,
        )

        response.raise_for_status()
        data = response.json()

        self._token = data['access_token']
        self._token_expires = datetime.now() + timedelta(seconds=data['expires_in'] - 60)
        return self._token

    def search(self, query: str, limit: int = 50) -> list:
        token = self.get_token()
        response = requests.get(
            self.SEARCH_URL,
            headers={
                'Authorization': f'Bearer {token}',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE',
            },
            params={
                'q': query,
                'filter': 'deliveryCountry:DE',
                'limit': limit,
            },
            timeout=20,
        )
        response.raise_for_status()
        return response.json().get('itemSummaries', [])

    def parse_item(self, item: dict) -> dict:
        condition_map = {
            'NEW': 'new',
            'LIKE_NEW': 'open_box',
            'USED': 'used',
            'REFURBISHED': 'refurbished',
        }
        raw_condition = item.get('condition', 'USED').upper()
        item_price = float(item.get('price', {}).get('value', 0))
        shipping_price, shipping_unknown = _extract_shipping_price(item)
        total_price = item_price + (shipping_price or 0)

        return {
            'external_id': item.get('itemId'),
            'title': item.get('title', ''),
            'condition': condition_map.get(raw_condition, 'used'),
            'price_eur': item_price,
            'shipping_price': shipping_price,
            'total_price': total_price,
            'shipping_unknown': shipping_unknown,
            'url': item.get('itemWebUrl', ''),
            'seller_name': item.get('seller', {}).get('username', ''),
            'seller_rating': float(item.get('seller', {}).get('feedbackPercentage', 0)) / 100,
            'buying_options': item.get('buyingOptions') or [],
        }

    def fetch_for_component(self, component_type, model_name, component_id, db, matcher, risk_scorer) -> dict:
        stats = {'new': 0, 'used': 0, 'skipped': 0, 'errors': 0}
        touched_components: set[tuple[str, int]] = set()
        component_type = normalize_component_type(component_type)

        if not is_supported_ebay_used_type(component_type):
            logger.info('[eBay] skipped unsupported component type: %s', component_type)
            return stats

        target_component = None
        if hasattr(db, 'get_component_details'):
            target_component = db.get_component_details(component_type, component_id)
        if not target_component:
            target_component = {'id': component_id, 'name': model_name}

        if not EBAY_API_ENABLED:
            print(f'[eBay] MOCK MODE - returning sample data for {model_name}')
            raw_items = MOCK_OFFERS
        else:
            try:
                raw_items = []
                seen_ids = set()
                queries = build_ebay_queries(component_type, model_name, target_component)
                for query in queries:
                    logger.info('[eBay] query %s:%s "%s"', component_type, component_id, query)
                    results = self.search(query, limit=25)
                    for result in results:
                        item = self.parse_item(result)
                        external_id = item.get('external_id')
                        if external_id and external_id in seen_ids:
                            continue
                        if external_id:
                            seen_ids.add(external_id)
                        raw_items.append(item)
            except Exception as e:
                print(f'[eBay] API error: {e}')
                stats['errors'] += 1
                return stats

        for item in raw_items:
            try:
                match = match_ebay_offer_to_component(item['title'], component_type, target_component)
                if not is_confident_match(match):
                    stats['skipped'] += 1
                    logger.info(
                        '[eBay] %s %s:%s confidence=%.2f title="%s"',
                        match.reason,
                        component_type,
                        component_id,
                        match.confidence,
                        item['title'],
                    )
                    continue

                logger.info(
                    '[eBay] %s %s:%s confidence=%.2f title="%s"',
                    match.reason,
                    component_type,
                    component_id,
                    match.confidence,
                    item['title'],
                )

                risk = risk_scorer.score(item['title'])
                buying_options = {
                    str(option).upper()
                    for option in item.get('buying_options', [])
                }
                if item['condition'] in {'used', 'refurbished', 'open_box'} and not (
                    {'FIXED_PRICE', 'BUY_IT_NOW'} & buying_options
                ):
                    risk['risk_flags'].append('auction_listing')

                offer = {
                    **item,
                    'source': 'ebay',
                    'component_type': component_type,
                    'component_id': component_id,
                    'confidence_score': match.confidence,
                    'is_suspicious': risk['is_suspicious'],
                    'risk_flags': risk['risk_flags'],
                }

                db.upsert_offer(offer)
                touched_components.add((component_type, component_id))

                if item['condition'] == 'new':
                    stats['new'] += 1
                else:
                    stats['used'] += 1

            except Exception as e:
                print(f'[eBay] Error processing item: {e}')
                stats['errors'] += 1

        touched_components.add((component_type, component_id))
        for offer_component_type, offer_component_id in touched_components:
            try:
                refresh_recommended_new_offer(db, offer_component_type, offer_component_id)
                refresh_recommended_used_offer(db, offer_component_type, offer_component_id)
            except Exception as e:
                print(f'[eBay] recommendation update failed: {e}')

        return stats


if __name__ == '__main__':
    from matcher.matcher import Matcher
    from risk.risk_scorer import RiskScorer
    from db import Database

    db = Database()
    db.connect()

    source = EbaySource()
    matcher = Matcher()
    risk = RiskScorer()

    stats = source.fetch_for_component('gpu', 'RTX 4070 Ti Super', 2, db, matcher, risk)
    print(f'Done: {stats}')

    db.disconnect()
