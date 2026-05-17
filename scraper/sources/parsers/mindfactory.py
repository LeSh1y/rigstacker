from __future__ import annotations

import hashlib
import logging
import os
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))

from sources.analyzers import refresh_recommended_new_offer, refresh_recommended_used_offer
from sources.gpu_offer_filter import is_bad_gpu_offer, is_bad_gpu_offer_title

logger = logging.getLogger(__name__)

BASE_URL = 'https://www.mindfactory.de'
SEARCH_URL = f'{BASE_URL}/search_result.php'
DELAY = 1.0
TIMEOUT = 20
PRICE_MIN = 1.0
PRICE_MAX = 20_000.0
DEBUG = os.environ.get('DEBUG', '').lower() in ('1', 'true', 'yes')

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]

PRICE_RE = re.compile(r'(?:€\s*)?\d{1,4}(?:\.\d{3})*(?:,\d{2}|,-)?', re.I)
PRODUCT_HREF_RE = re.compile(r'product_info\.php', re.I)
ACCESSORY_RE = re.compile(
    r'\b(cable|kabel|adapter|antenne|antenna|bracket|holder|ersatzteil|replacement)\b',
    re.I,
)
BLOCKED_RE = re.compile(
    r'(captcha|cloudflare|access denied|zugriff verweigert|robot|bot detection|'
    r'checking your browser|ddos|blocked|forbidden)',
    re.I,
)


def _is_blocked_page(html: str) -> bool:
    head = html[:5000]
    return bool(BLOCKED_RE.search(head))


def _save_debug_html(name: str, html: str) -> None:
    if not DEBUG:
        return
    path = ROOT_DIR / 'debug' / f'mindfactory_{name}_{int(time.time())}.html'
    path.parent.mkdir(exist_ok=True)
    path.write_text(html, encoding='utf-8')
    logger.debug('[Mindfactory] Debug HTML saved to %s', path)


def _headers() -> dict:
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Referer': BASE_URL + '/',
    }


def _search_url(query: str) -> str:
    return f'{SEARCH_URL}?search_query={quote_plus(query)}'


def _fetch_html(url: str) -> str | None:
    try:
        response = requests.get(url, headers=_headers(), timeout=TIMEOUT)
        logger.info('[Mindfactory] HTTP %s for %s', response.status_code, url)
        logger.info('[Mindfactory] HTML size: %d', len(response.text or ''))
        response.raise_for_status()
        if _is_blocked_page(response.text or ''):
            _save_debug_html('blocked', response.text or '')
            raise RuntimeError('blocked/captcha page detected')
        return response.text
    except RuntimeError:
        raise
    except Exception as e:
        logger.warning('[Mindfactory] fetch failed for %s: %s', url, e)
        return None


def _parse_price(text: str) -> float | None:
    raw = text.strip()
    if not raw:
        return None

    cleaned = re.sub(r'[^\d.,-]', '', raw)
    if cleaned.endswith(',-'):
        cleaned = cleaned[:-2] + ',00'
    cleaned = cleaned.replace('-', '')

    if ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    elif cleaned.count('.') > 1:
        cleaned = cleaned.replace('.', '')

    try:
        price = float(cleaned)
    except ValueError:
        return None

    return price if PRICE_MIN <= price <= PRICE_MAX else None


def _extract_price_from_text(text: str) -> float | None:
    prices: list[float] = []
    for match in PRICE_RE.finditer(text):
        price = _parse_price(match.group(0))
        if price is not None:
            prices.append(price)
    return min(prices) if prices else None


def _extract_price_near(element, max_up: int = 6) -> float | None:
    cur = element
    for _ in range(max_up):
        if cur is None:
            break

        price_nodes = cur.find_all(
            class_=re.compile(r'(price|preis|pprice|productPrice)', re.I),
            limit=12,
        )
        for node in price_nodes:
            price = _extract_price_from_text(node.get_text(' ', strip=True))
            if price is not None:
                return price

        text = cur.get_text(' ', strip=True)
        if '€' in text:
            price = _extract_price_from_text(text)
            if price is not None:
                return price

        cur = cur.parent

    return None


def _clean_title(text: str) -> str:
    title = re.sub(r'\s+', ' ', text or '').strip()
    title = re.sub(r'^(Image|Bild):\s*', '', title, flags=re.I)
    title = re.sub(r'\s+Details$', '', title, flags=re.I)
    return title


def _norm_text(text: str) -> str:
    return re.sub(r'[^A-Z0-9]+', ' ', (text or '').upper()).strip()


def _has_token(text: str, token: str) -> bool:
    token = token.upper()
    return bool(re.search(rf'(?<![A-Z0-9]){re.escape(token)}(?![A-Z0-9])', text))


def _is_relevant_product(query: str, title: str) -> bool:
    if ACCESSORY_RE.search(title or ''):
        return False
    if is_bad_gpu_offer_title(title):
        return False

    query_norm = _norm_text(query)
    title_norm = _norm_text(title)

    if _has_token(query_norm, 'RTX'):
        if not _has_token(title_norm, 'RTX'):
            return False

        model = re.search(r'\b\d{4}\b', query_norm)
        if model is None or not _has_token(title_norm, model.group(0)):
            return False

        if _has_token(query_norm, 'TI') and not _has_token(title_norm, 'TI'):
            return False

        if _has_token(query_norm, 'SUPER') and not _has_token(title_norm, 'SUPER'):
            return False

    return True


def _product_id_from_url(url: str) -> str:
    match = re.search(r'_(\d+)\.html(?:$|[?#])', url)
    if match:
        return match.group(1)
    match = re.search(r'/(\d+)\.html(?:$|[?#])', url)
    if match:
        return match.group(1)
    return hashlib.md5(url.encode()).hexdigest()[:10]


def _title_from_link(link) -> str:
    title = (
        link.get('title', '').strip()
        or link.get('aria-label', '').strip()
        or link.get_text(' ', strip=True)
    )
    if title:
        return _clean_title(title)

    img = link.find('img')
    if img:
        return _clean_title(img.get('alt', '') or img.get('title', ''))

    return ''


def _parse_products(html: str, query: str = '') -> list[dict]:
    soup = BeautifulSoup(html, 'lxml')
    products: list[dict] = []
    seen: set[str] = set()

    for link in soup.find_all('a', href=PRODUCT_HREF_RE):
        href = link.get('href', '').split('#')[0].strip()
        if not href:
            continue

        url = urljoin(BASE_URL, href)
        url = url.split('?')[0]
        if url in seen:
            continue

        title = _title_from_link(link)
        if len(title) < 5 or title.lower() in {'zum warenkorb', 'zum merkzettel'}:
            continue
        if query and not _is_relevant_product(query, title):
            continue

        price = _extract_price_near(link)
        if price is None:
            continue

        seen.add(url)
        products.append({
            'external_id': f'mf-{_product_id_from_url(url)}',
            'title': title,
            'condition': 'new',
            'price_eur': price,
            'url': url,
            'seller_name': 'Mindfactory',
            'seller_rating': None,
        })

    logger.info('[Mindfactory] parsed %d products', len(products))
    if not products:
        logger.warning(
            '[Mindfactory] parsed 0 products for query="%s"; product_links=%d title="%s"',
            query,
            len(soup.find_all('a', href=PRODUCT_HREF_RE)),
            soup.title.get_text(' ', strip=True) if soup.title else 'NO TITLE',
        )
        if _is_blocked_page(html):
            _save_debug_html('blocked_zero_products', html)
            raise RuntimeError('blocked/captcha page detected')
        _save_debug_html('zero_products', html)
    return products


class MindfactorySource:
    def search(self, query: str) -> list[dict]:
        html = _fetch_html(_search_url(query))
        if html is None:
            return []
        time.sleep(DELAY)
        return _parse_products(html, query)

    def fetch_for_component(
        self,
        component_type,
        model_name,
        component_id,
        db,
        matcher=None,
        risk_scorer=None,
    ) -> dict:
        stats = {'new': 0, 'updated': 0, 'skipped': 0, 'errors': 0}
        touched_components: set[tuple[str, int]] = set()

        try:
            raw_items = self.search(model_name)
        except Exception as e:
            logger.error('[Mindfactory] search failed for %s: %s', model_name, e)
            stats['errors'] += 1
            return stats

        for item in raw_items:
            try:
                offer_component_type = component_type
                offer_component_id = component_id
                confidence = 0.90

                if matcher is not None:
                    match = matcher.match(item['title'], db)
                    if not match.get('matched'):
                        stats['skipped'] += 1
                        continue
                    offer_component_type = match['component_type']
                    offer_component_id = match['component_id']
                    confidence = match.get('confidence', confidence)

                if is_bad_gpu_offer(offer_component_type, item['title']):
                    stats['skipped'] += 1
                    logger.info('[Mindfactory] skip bad GPU offer: %s', item['title'])
                    continue

                risk = {'is_suspicious': False, 'risk_flags': []}
                if risk_scorer is not None:
                    risk = risk_scorer.score(item['title'])

                offer = {
                    **item,
                    'source': 'mindfactory',
                    'component_type': offer_component_type,
                    'component_id': offer_component_id,
                    'confidence_score': confidence,
                    'is_suspicious': risk.get('is_suspicious', False),
                    'risk_flags': risk.get('risk_flags', []),
                }

                result = db.upsert_offer(offer)
                touched_components.add((offer_component_type, offer_component_id))
                if result == 'updated':
                    stats['updated'] += 1
                else:
                    stats['new'] += 1
            except Exception as e:
                logger.error('[Mindfactory] error processing item: %s', e)
                stats['errors'] += 1

        touched_components.add((component_type, component_id))
        for offer_component_type, offer_component_id in touched_components:
            try:
                refresh_recommended_new_offer(db, offer_component_type, offer_component_id)
                refresh_recommended_used_offer(db, offer_component_type, offer_component_id)
            except Exception as e:
                logger.warning('[Mindfactory] recommendation update failed: %s', e)

        return stats


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    source = MindfactorySource()
    query = sys.argv[1] if len(sys.argv) > 1 else 'RTX 5070 Ti'
    for product in source.search(query)[:10]:
        print(f"{product['price_eur']:8.2f}  {product['title'][:80]}")
