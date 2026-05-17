import sys
import base64
from pathlib import Path
from datetime import datetime, timedelta

import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))

from config import EBAY_APP_ID, EBAY_CERT_ID
from sources.analyzers import refresh_recommended_new_offer, refresh_recommended_used_offer
from sources.gpu_offer_filter import is_bad_gpu_offer
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
            raise RuntimeError("Missing EBAY_APP_ID or EBAY_CERT_ID")
        
        credentials = base64.b64encode(
            f'{EBAY_APP_ID}:{EBAY_CERT_ID}'.encode()
        ).decode()
        

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
            }
        )
        response.raise_for_status()
        return response.json().get('itemSummaries', [])

    def parse_item(self, item: dict) -> dict:
        condition_map = {
            'NEW':          'new',
            'LIKE_NEW':     'open_box',
            'USED':         'used',
            'REFURBISHED':  'refurbished',
        }
        raw_condition = item.get('condition', 'USED').upper()

        return {
            'external_id':   item.get('itemId'),
            'title':         item.get('title', ''),
            'condition':     condition_map.get(raw_condition, 'used'),
            'price_eur':     float(item.get('price', {}).get('value', 0)),
            'url':           item.get('itemWebUrl', ''),
            'seller_name':   item.get('seller', {}).get('username', ''),
            'seller_rating': float(item.get('seller', {}).get('feedbackPercentage', 0)) / 100,
            'buying_options': item.get('buyingOptions') or [],
        }

    def fetch_for_component(self, component_type, model_name, component_id, db, matcher, risk_scorer) -> dict:
        stats = {'new': 0, 'used': 0, 'skipped': 0, 'errors': 0}
        touched_components: set[tuple[str, int]] = set()

        # Мок пока нет доступа к API
        if not EBAY_API_ENABLED:
            print(f'[eBay] MOCK MODE — returning sample data for {model_name}')
            raw_items = MOCK_OFFERS
        else:
            try:
                results = self.search(f'{model_name} {component_type}')
                raw_items = [self.parse_item(i) for i in results]
            except Exception as e:
                print(f'[eBay] API error: {e}')
                stats['errors'] += 1
                return stats

        for item in raw_items:
            try:
                match = matcher.match(item['title'], db)
                if not match['matched']:
                    stats['skipped'] += 1
                    continue

                if is_bad_gpu_offer(match['component_type'], item['title']):
                    stats['skipped'] += 1
                    print(f"[eBay] skip bad GPU offer: {item['title']}")
                    continue

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
                    'source':           'ebay',
                    'component_type':   match['component_type'],
                    'component_id':     match['component_id'],
                    'confidence_score': match['confidence'],
                    'is_suspicious':    risk['is_suspicious'],
                    'risk_flags':       risk['risk_flags'],
                }

                db.upsert_offer(offer)
                touched_components.add((match['component_type'], match['component_id']))

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

    source  = EbaySource()
    matcher = Matcher()
    risk    = RiskScorer()

    stats = source.fetch_for_component('gpu', 'RTX 4070 Ti Super', 2, db, matcher, risk)
    print(f'Done: {stats}')

    db.disconnect()
