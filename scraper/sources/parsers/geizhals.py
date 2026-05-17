"""
Geizhals scraper — двухшаговая стратегия + три уровня обхода защиты.

Шаг 1: поисковая страница → конкретные (a-URL) + серийные (v-URL) карточки.
Шаг 2: для каждого v-URL заходим внутрь и собираем все конкретные товары.

Уровни обхода Cloudflare:
  1. curl_cffi   — имитирует TLS Chrome (быстро, без браузера)
  2. Playwright  — настоящий браузер + stealth (медленно, надёжно)
  3. Autocomplete API — /ac/ JSON без защиты (нет цен, только URL)

Установка:
    pip install curl-cffi beautifulsoup4 lxml
    pip install playwright && playwright install chromium
    pip install playwright-stealth
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import random
import time
import sys
from datetime import datetime
from pathlib import Path
from statistics import median
from urllib.parse import quote_plus, urljoin, urlencode

try:
    from curl_cffi.requests import Session as CurlSession
    _HAS_CURL_CFFI = True
except ImportError:
    _HAS_CURL_CFFI = False

try:
    from playwright.sync_api import sync_playwright
    _HAS_PLAYWRIGHT = True
except ImportError:
    _HAS_PLAYWRIGHT = False

try:
    from playwright_stealth import stealth_sync
    _HAS_STEALTH = True
except ImportError:
    _HAS_STEALTH = False

import requests
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))

from sources.analyzers import refresh_recommended_new_offer, refresh_recommended_used_offer
from sources.gpu_offer_filter import is_bad_gpu_offer

logger = logging.getLogger(__name__)

BASE_URL     = 'https://geizhals.de'
DELAY        = 2
DELAY_SERIES = 1
PRICE_MIN    = 10.0
PRICE_MAX    = 10_000.0
DEBUG        = os.environ.get('DEBUG', '').lower() in ('1', 'true')
CURL_IMPERSONATE = os.environ.get('CURL_IMPERSONATE', 'chrome124')

CATEGORY_URLS: dict[str, str] = {
    'gpu': f'{BASE_URL}/?cat=gra16_512&in=de',
    'cpu': f'{BASE_URL}/?cat=cpu&in=de',
    'ram': f'{BASE_URL}/?cat=ram&in=de',
}

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _is_series_url(url: str) -> bool:
    """v-URL: страница серии/бренда. /msi-geforce-rtx-...-v150923.html"""
    return bool(re.search(r'-v\d{4,}\.html$', url))


def _is_product_url(url: str) -> bool:
    """a-URL: конкретный товар. /msi-geforce-rtx-...-a3101212.html"""
    return bool(re.search(r'-a\d{4,}\.html$', url))


def _search_url(query: str, component_type: str) -> str:
    q    = quote_plus(query)
    base = CATEGORY_URLS.get(component_type, BASE_URL)
    sep  = '&' if '?' in base else '?'
    return f'{base}{sep}fs={q}&in=de'


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def _parse_price(text: str) -> float | None:
    clean = re.sub(r'[^\d.,]', '', text.strip())
    if not clean:
        return None
    if ',' in clean:
        clean = clean.replace('.', '').replace(',', '.')
    elif clean.count('.') > 1:
        clean = clean.replace('.', '')
    try:
        v = float(clean)
        return v if PRICE_MIN <= v <= PRICE_MAX else None
    except ValueError:
        return None
        
_PRICE_RE = re.compile(r'(?:ab\s*)?(?:€\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|\d{2,5},\d{2}', re.I)


def _extract_price_from_text(text: str) -> float | None:
    for m in _PRICE_RE.finditer(text):
        price = _parse_price(m.group(0))
        if price is not None:
            return price
    return None


_ACCESSORY_RE = re.compile(
    r'\b(antenna|antenne|cable|kabel|adapter|bracket|holder|halter\w*|replacement|'
    r'ersatz\w*|cover|screw|schraube\w*)\b',
    re.I,
)
_PSU_ACCESSORY_RE = re.compile(
    r'\b(kabel|cable|kabelersatz|stromkabel|adapter|replacement|austausch|'
    r'connector|verl[aä]ngerung|extension|sata-laufwerkskabel|pci-e\s*cable|'
    r'8pin|8-pin|6pin|6-pin|24pin|24-pin)\b',
    re.I,
)
_PSU_REAL_PRODUCT_RE = re.compile(
    r'\b(netzteil|psu|power\s+supply|atx|80\+|gold|platinum|watt|\d{3,4}\s*w)\b',
    re.I,
)
_PSU_MODEL_TOKEN_RE = re.compile(r'\b[A-Z]{1,12}\d{3,4}[A-Z]{0,4}\b', re.I)
_COOLER_CONFLICT_TOKENS = {'SLIM', 'PRO', 'ELITE', 'RGB', 'XT', 'FX'}
_CASE_CONFLICT_TOKENS = {'XL', 'MINI', 'MICRO'}


def _is_accessory(name: str) -> bool:
    return bool(_ACCESSORY_RE.search(name or ''))


def _is_valid_psu_offer_title(title: str, wattage: int | None = None) -> bool:
    title = title or ''
    if _PSU_ACCESSORY_RE.search(title):
        return False
    if not _PSU_REAL_PRODUCT_RE.search(title):
        return False

    model_tokens = {token.upper() for token in _PSU_MODEL_TOKEN_RE.findall(title)}
    if len(model_tokens) >= 3:
        return False

    if wattage and not re.search(rf'(?<!\d){wattage}\s*w?\b', title, re.I):
        return False

    return True


def _tokens(text: str) -> list[str]:
    return _norm_text(text).split()


def _contains_sequence(haystack: list[str], needle: list[str]) -> bool:
    if not needle:
        return False
    limit = len(haystack) - len(needle) + 1
    return any(haystack[i:i + len(needle)] == needle for i in range(max(0, limit)))


def _version_tokens(tokens: list[str]) -> set[str]:
    return {token for token in tokens if re.search(r'\d', token)}


def _important_model_tokens(name: str, component_type: str) -> list[str]:
    drop = {'FRACTAL', 'DESIGN', 'BE', 'QUIET', 'CORSAIR', 'NOCTUA'}
    return [token for token in _tokens(name) if token not in drop and token]


def _is_valid_case_or_cooler_offer_title(title: str, component_name: str, component_type: str) -> bool:
    component_tokens = _important_model_tokens(component_name, component_type)
    title_tokens = _important_model_tokens(title, component_type)
    if not component_tokens or not title_tokens:
        return False
    if not _contains_sequence(title_tokens, component_tokens):
        return False

    component_versions = _version_tokens(component_tokens)
    title_versions = _version_tokens(title_tokens)
    if title_versions - component_versions:
        return False

    conflicts = _COOLER_CONFLICT_TOKENS if component_type == 'cooler' else _CASE_CONFLICT_TOKENS
    if (set(title_tokens) & conflicts) - (set(component_tokens) & conflicts):
        return False

    return True


def _norm_text(text: str) -> str:
    return re.sub(r'[^A-Z0-9]+', ' ', (text or '').upper()).strip()


def _compact_text(text: str) -> str:
    return re.sub(r'[^A-Z0-9]+', '', (text or '').upper())


def _has_token(text: str, token: str) -> bool:
    token = token.upper()
    return bool(re.search(rf'(?<![A-Z0-9]){re.escape(token)}(?![A-Z0-9])', text))


def _tokens_with_digits(query: str) -> list[str]:
    return re.findall(r'\b[A-Z]*\d+[A-Z0-9]*\b', _norm_text(query))


def _score_required_tokens(name: str, required: list[str]) -> float:
    if not required:
        return 1.0

    norm_name = _norm_text(name)
    compact_name = _compact_text(name)
    hits = 0
    for token in required:
        compact_token = _compact_text(token)
        if _has_token(norm_name, compact_token) or compact_token in compact_name:
            hits += 1

    return hits / len(required)


def _relevance_score(query: str, name: str, component_type: str) -> float:
    if _is_accessory(name):
        return 0.0

    ctype = (component_type or '').lower()
    norm_query = _norm_text(query)
    norm_name = _norm_text(name)

    if ctype == 'cpu' and _has_token(norm_name, 'KOMPLETTSYSTEM'):
        return 0.0

    if ctype in ('motherboard', 'mainboard'):
        for unrelated in ('ARBEITSSPEICHER', 'SPEICHER', 'MEMORY', 'RAM'):
            if _has_token(norm_name, unrelated):
                return 0.0

    if ctype == 'gpu':
        if _has_token(norm_query, 'RTX'):
            if not _has_token(norm_name, 'RTX'):
                return 0.0

            model = re.search(r'\b\d{4}\b', norm_query)
            if model is None or not _has_token(norm_name, model.group(0)):
                return 0.0

            query_has_ti = _has_token(norm_query, 'TI')
            name_has_ti = _has_token(norm_name, 'TI')
            if query_has_ti and not name_has_ti:
                return 0.0
            if not query_has_ti and name_has_ti:
                return 0.0

            query_has_super = _has_token(norm_query, 'SUPER')
            name_has_super = _has_token(norm_name, 'SUPER')
            if query_has_super and not name_has_super:
                return 0.0
            if not query_has_super and name_has_super:
                return 0.0

            return 1.0

        required = []
        for family in ('RTX', 'GTX', 'RX'):
            if _has_token(norm_query, family):
                required.append(family)
                break
        required.extend(re.findall(r'\b\d{4}\b', norm_query))
        for suffix in ('TI', 'SUPER', 'XT', 'XTX'):
            if _has_token(norm_query, suffix):
                required.append(suffix)
        return _score_required_tokens(name, required)

    if ctype == 'cpu':
        models = _tokens_with_digits(query)
        model = max(models, key=len) if models else ''
        return _score_required_tokens(name, [model]) if model else 1.0

    if ctype == 'ram':
        required = []
        ddr = re.search(r'\bDDR\d\b', norm_query)
        if ddr:
            required.append(ddr.group(0))
        required.extend(re.findall(r'\b\d+\s*GB\b|\b\d{4,5}\b', norm_query))
        return _score_required_tokens(name, required)

    if ctype == 'ssd':
        required = re.findall(r'\b\d+\s*TB\b|\b\d+\s*GB\b', norm_query)
        model_tokens = [
            t for t in re.findall(r'\b[A-Z]*\d+[A-Z0-9]*\b|\bPRO\b|\bEVO\b|\bPLUS\b', norm_query)
            if not re.fullmatch(r'\d+\s*(TB|GB)', t)
        ]
        required.extend(model_tokens[:3])
        return _score_required_tokens(name, required)

    if ctype == 'psu':
        if not _is_valid_psu_offer_title(name):
            return 0.0
        wattage = re.search(r'\b\d{3,4}\s*W\b', norm_query)
        if wattage:
            return _score_required_tokens(name, [wattage.group(0)])
        wattage_model = re.search(r'\b[A-Z]*\d{3,4}[A-Z]*\b', norm_query)
        return _score_required_tokens(name, [wattage_model.group(0)]) if wattage_model else 1.0

    if ctype in ('case', 'cooler'):
        return 1.0 if _is_valid_case_or_cooler_offer_title(name, query, ctype) else 0.0

    if ctype in ('motherboard', 'mainboard'):
        required = re.findall(r'\b(?:B650E?|Z790|X670E?|A620|B760|Z890|X870E?)\b', norm_query)
        for token in ('TOMAHAWK', 'STRIX', 'ROG', 'PRIME', 'AORUS', 'MORTAR'):
            if _has_token(norm_query, token):
                required.append(token)
        return _score_required_tokens(name, required)

    return 1.0


def _fetch_product_price(url: str) -> float | None:
    html = _fetch_html(url)
    if html is None:
        return None

    soup = BeautifulSoup(html, 'lxml')
    product_match = re.search(r'-a\d{4,}\.html$', url)
    product_slug = product_match.group(0) if product_match else ''
    prices: list[float] = []
    for selector in ('div.offer', 'tr.offer', '.offer', '.gh_price', 'span.price', '.price'):
        for node in soup.select(selector):
            linked_product = node.find_parent('a', href=re.compile(r'-a\d{4,}\.html'))
            if linked_product is not None:
                href = linked_product.get('href', '').split('?')[0].split('#')[0].strip()
                if product_slug and product_slug not in href:
                    continue

            price = _extract_price_from_text(node.get_text(' ', strip=True))
            if price is not None:
                prices.append(price)

    return min(prices) if prices else None


def _extract_price_near(el, max_up: int = 8) -> float | None:
    cur = el

    for _ in range(max_up):
        if cur is None:
            break

        price_nodes = cur.find_all(class_=re.compile(r'(price|preis)', re.I), limit=10)
        for node in price_nodes:
            price = _extract_price_from_text(node.get_text(' ', strip=True))
            if price is not None:
                return price

        price = _extract_price_from_text(cur.get_text(' ', strip=True))
        if price is not None:
            return price

        cur = cur.parent

    return None        



def _url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:6]


def _is_blocked(text: str) -> bool:
    lower = text[:4000].lower()
    return any(s in lower for s in [
        'cf-browser-verification', 'challenge-form',
        'checking your browser', 'just a moment', 'enable javascript',
    ])


def _save_debug_html(name: str, html: str) -> None:
    if not DEBUG:
        return
    path = ROOT_DIR / 'debug' / f'{name}_{int(time.time())}.html'
    path.parent.mkdir(exist_ok=True)
    path.write_text(html, encoding='utf-8')
    logger.debug('[Geizhals] Debug HTML → %s', path)


# ---------------------------------------------------------------------------
# Card parsing
# ---------------------------------------------------------------------------

_CARD_CLASS_RE = re.compile(r'(galleryview__item|listview__item|gl-item|product)', re.I)

def _find_cards(soup: BeautifulSoup) -> list:
    """Ищем карточки товаров: сначала точными селекторами, потом fallback."""
    for sel in (
        'article.galleryview__item',
        'div.galleryview__item',
        'article.listview__item',
        'li.listview__item',
        'article.gl-item',
        'li.gl-item',
    ):
        cards = soup.select(sel)
        if cards:
            logger.debug('[Geizhals] Карточки через селектор "%s": %d', sel, len(cards))
            return cards

    # Fallback: span.price → ближайший контейнер
    seen, cards = set(), []
    for price_el in soup.select('span.price'):
        card = price_el.find_parent(['article', 'li', 'div'], class_=_CARD_CLASS_RE)
        if card is not None and id(card) not in seen:
            seen.add(id(card))
            cards.append(card)
    if cards:
        logger.debug('[Geizhals] Карточки через span.price fallback: %d', len(cards))
    return cards


def _extract_card(card, base_query: str) -> dict | None:
    card_text = card.get_text(' ', strip=True)
    if 'keine Angebote' in card_text or 'Angebot' not in card_text:
        return None

    # Цена
    price_el = card.select_one('span.price') or card.find(
        class_=re.compile(r'^price$', re.I)
    )
    price = _parse_price(price_el.get_text()) if price_el else None

    # Ссылка
    link_el = (card.select_one('a.listview__name')
               or card.select_one('a[href*=".html"]')
               or card.select_one('a[href]'))
    if link_el is None:
        return None
    href = link_el.get('href', '').split('?')[0].split('#')[0].strip()
    if not href:
        return None
    url = urljoin(BASE_URL, href)

    # Название
    name_el = (card.select_one('.listview__name')
               or card.select_one('.gl-name')
               or card.select_one('h3, h2')
               or link_el)
    name = name_el.get_text(' ', strip=True) if name_el else base_query

    return {'name': name, 'price': price, 'url': url,
            'is_series': _is_series_url(url)}

def _extract_from_links(html: str, query: str) -> tuple[list[dict], list[dict]]:
    soup = BeautifulSoup(html, 'lxml')

    specific = []
    series = []
    seen = set()

    for a in soup.find_all('a', href=re.compile(r'-(a|v)\d{4,}\.html')):
        href = a.get('href', '').split('?')[0].split('#')[0].strip()
        if not href:
            continue

        url = urljoin(BASE_URL, href)

        if url in seen:
            continue
        seen.add(url)

        is_series = _is_series_url(url)

        container = a.find_parent(['article', 'li', 'div', 'tr']) or a.parent
        text = container.get_text(' ', strip=True) if container else a.get_text(' ', strip=True)

        name = (
        a.get('title', '').strip()
        or a.get('aria-label', '').strip()
        or a.get_text(' ', strip=True)
        or query
        )

        if 'Bewertung' in name or len(name) < 5:
            name = query

        price = _extract_price_near(a)

        if price is None:
            matches = re.findall(r'[\d.]+,\d{2}', text)
            for m in matches:
                price = _parse_price(m)
                if price is not None:
                    break

        item = {
            'name': name,
            'price': price,
            'url': url,
            'is_series': is_series,
        }

        if is_series:
            series.append(item)
        elif price is not None:
            specific.append(item)

    logger.info('[Geizhals] link fallback: %d concrete, %d series', len(specific), len(series))
    return specific, series


def _parse_page(html: str, query: str) -> tuple[list[dict], list[dict]]:
    soup = BeautifulSoup(html, 'lxml')
    cards = _find_cards(soup)
    logger.debug('[Geizhals] _parse_page: %d карточек', len(cards))

    specific, series = [], []
    seen: set[str] = set()

    for card in cards:
        item = _extract_card(card, query)
        if item is None or item['url'] in seen:
            continue

        seen.add(item['url'])

        if item['is_series']:
            series.append(item)
        elif item['price'] is not None:
            specific.append(item)

    if not specific and not series:
        logger.warning('[Geizhals] card parser found nothing, using link fallback')
        return _extract_from_links(html, query)

    return specific, series


# ---------------------------------------------------------------------------
# Series page: step 2
# ---------------------------------------------------------------------------

def _parse_series_page(html: str, series_name: str) -> list[dict]:
    """
    Внутри серийной страницы (v-URL) ищем конкретные товары (a-URL).
    Используем два прохода: сначала обычный _parse_page, потом href-сканирование.
    """
    # Проход 1: стандартные карточки
    specific, _ = _parse_page(html, series_name)
    if specific:
        return specific

    # Проход 2: все ссылки вида -aNNNNNN.html
    soup = BeautifulSoup(html, 'lxml')
    seen, products = set(), []

    for a in soup.find_all('a', href=re.compile(r'-a\d{4,}\.html')):
        href = a.get('href', '').split('?')[0].split('#')[0].strip()
        url  = urljoin(BASE_URL, href)
        if url in seen:
            continue
        seen.add(url)

        price = None
        container = a.find_parent(['li', 'tr', 'div', 'article'])
        if container:
            pel = container.find(class_=re.compile(r'price', re.I))
            if pel:
                price = _parse_price(pel.get_text())

        name = a.get_text(' ', strip=True) or series_name
        products.append({'name': name, 'price': price,
                         'url': url, 'is_series': False})

    logger.debug(
        '[Geizhals] Серия "%s": найдено %d товаров',
        series_name[:50], len(products),
    )
    return products


# ---------------------------------------------------------------------------
# Transport — уровни 1/2
# ---------------------------------------------------------------------------

def _fetch_curl(url: str) -> str | None:
    if not _HAS_CURL_CFFI:
        return None
    try:
        with CurlSession(impersonate=CURL_IMPERSONATE) as s:
            r = s.get(url, headers={
                'Accept-Language': 'de-DE,de;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }, timeout=20, allow_redirects=True)
        if r.status_code == 200 and not _is_blocked(r.text):
            logger.debug('[Geizhals] curl_cffi OK %d bytes', len(r.text))
            return r.text
        logger.warning('[Geizhals] curl_cffi HTTP %d', r.status_code)
    except Exception as e:
        logger.warning('[Geizhals] curl_cffi: %s', e)
    return None


def _fetch_playwright(url: str) -> str | None:
    if not _HAS_PLAYWRIGHT:
        return None
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=[
                '--disable-blink-features=AutomationControlled', '--no-sandbox',
            ])
            ctx  = browser.new_context(user_agent=random.choice(USER_AGENTS),
                                       locale='de-DE',
                                       viewport={'width': 1366, 'height': 768},
                                       extra_http_headers={'Accept-Language': 'de-DE,de;q=0.9'})
            page = ctx.new_page()
            if _HAS_STEALTH:
                stealth_sync(page)
            else:
                page.add_init_script(
                    "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
                )
            page.goto(url, wait_until='domcontentloaded', timeout=30_000)
            try:
                page.wait_for_selector('span.price', timeout=8_000)
            except Exception:
                pass
            html = page.content()
            browser.close()
        if not _is_blocked(html):
            logger.debug('[Geizhals] playwright OK %d bytes', len(html))
            return html
    except Exception as e:
        logger.warning('[Geizhals] playwright: %s', e)
    return None


def _fetch_html(url: str) -> str | None:
    html = _fetch_curl(url)
    if html:
        return html
    time.sleep(2)
    return _fetch_playwright(url)


def _fetch_autocomplete(query: str, component_type: str) -> list[dict]:
    cat_map = {'gpu': 'gra16_512', 'cpu': 'cpu', 'ram': 'ram'}
    params  = {'query': query, 'context': cat_map.get(component_type, ''),
                'locale': 'de', 'country': 'de'}
    try:
        r = requests.get(f'{BASE_URL}/ac/?' + urlencode(params),
                         headers={'User-Agent': random.choice(USER_AGENTS),
                                  'Accept': 'application/json, */*',
                                  'X-Requested-With': 'XMLHttpRequest'},
                         timeout=10)
        r.raise_for_status()
        data  = r.json()
        items = data if isinstance(data, list) else data.get('products', [])
    except Exception as e:
        logger.error('[Geizhals] autocomplete: %s', e)
        return []

    offers = []
    for item in items[:20]:
        name = item.get('name') or item.get('title', '')
        url  = item.get('url') or item.get('href', '')
        if url and not url.startswith('http'):
            url = urljoin(BASE_URL, url)
        if name and url:
            offers.append({'name': name, 'price': None,
                           'url': url, 'is_series': False})
    logger.info('[Geizhals] autocomplete: %d результатов', len(offers))
    return offers


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class GeizhalsSource:
    """
    Двухшаговый парсер Geizhals.

    Шаг 1: поиск → список карточек (конкретные + серийные)
    Шаг 2: для серийных страниц заходим внутрь → все SKU бренда

    Это важно: на поисковой странице показывается только 1 карточка
    от каждого бренда (напр. только одна MSI RTX 4070 Ti Super).
    Внутри серийной страницы — все 10+ вариантов (GAMING X, VENTUS, и т.д.)
    """

    def search_product(
        self,
        query: str,
        component_type: str = '',
        follow_series: bool = True,
        max_series: int = 10,
    ) -> list[dict]:
        """
        Возвращает список {'name', 'price', 'url'}, отсортированный по цене.
        follow_series=False — быстрый режим, только первая страница.
        """
        url  = _search_url(query, component_type)
        html = _fetch_html(url)
        
        
        if html:
            _save_debug_html('search_initial', html)
            soup = BeautifulSoup(html, 'lxml')
            logger.info('[Geizhals] URL: %s', url)
            logger.info('[Geizhals] HTML size: %d', len(html))
            logger.info('[Geizhals] title: %s', soup.title.get_text(' ', strip=True) if soup.title else 'NO TITLE')
            logger.info('[Geizhals] a-urls: %d', len(soup.find_all('a', href=re.compile(r'-a\d{4,}\.html'))))
            logger.info('[Geizhals] v-urls: %d', len(soup.find_all('a', href=re.compile(r'-v\d{4,}\.html'))))
            logger.info('[Geizhals] price-like: %d', len(soup.find_all(class_=re.compile(r'price', re.I))))

        if html is None:
            logger.error('[Geizhals] Нет HTML → autocomplete fallback')
            return _fetch_autocomplete(query, component_type)

        specific, series = _parse_page(html, query)
        specific = [
            p for p in specific
            if _relevance_score(query, f"{p.get('name', '')} {p.get('url', '')}", component_type) >= 1.0
        ]
        series = [
            s for s in series
            if _relevance_score(query, f"{s.get('name', '')} {s.get('url', '')}", component_type) >= 1.0
        ]
        logger.info('[Geizhals] Шаг 1: %d конкретных, %d серий', len(specific), len(series))

        if follow_series and series:
            seen = {p['url'] for p in specific}
            for i, s in enumerate(series[:max_series]):
                logger.info(
                    '[Geizhals] Шаг 2 (%d/%d): %s',
                    i + 1, min(len(series), max_series), s['url'],
                )
                time.sleep(DELAY_SERIES)
                s_html = _fetch_html(s['url'])
                if s_html is None:
                    continue

                _save_debug_html(f'series_{i}', s_html)
                products = _parse_series_page(s_html, s['name'])
                added = 0
                for p in products:
                    if p['url'] in seen:
                        logger.debug('[Geizhals] skip duplicate: %s', p['url'])
                        continue

                    if _relevance_score(query, f"{p.get('name', '')} {p.get('url', '')}", component_type) < 1.0:
                        logger.debug('[Geizhals] skip irrelevant: %s | %s', p.get('name'), p.get('url'))
                        continue

                    if p.get('price') is None:
                        logger.debug('[Geizhals] fetch product price: %s | %s', p.get('name'), p.get('url'))
                        p["price"] = _fetch_product_price(p["url"])

                    if p.get('price') is None:
                        logger.debug('[Geizhals] skip no price after product fetch: %s | %s', p.get('name'), p.get('url'))
                        continue

                    seen.add(p['url'])
                    specific.append(p)
                    added += 1
                logger.info('[Geizhals] → +%d товаров (серия: %s)', added, s['name'][:40])

        if not specific:
            logger.warning('[Geizhals] Ничего → autocomplete fallback')
            return _fetch_autocomplete(query, component_type)

        specific.sort(key=lambda x: x['price'] or 9_999)
        logger.info('[Geizhals] Итого: %d товаров', len(specific))
        return specific

    # ------------------------------------------------------------------
    # DB
    # ------------------------------------------------------------------

    def fetch_for_component(self, component_type, model_name, component_id, db):
        stats = {'new': 0, 'updated': 0, 'processed': 0, 'errors': 0}
        psu_wattage = None
        if component_type == 'psu':
            try:
                row = db.fetchone('SELECT wattage FROM psus WHERE id = %s', (component_id,))
                psu_wattage = int(row['wattage']) if row and row.get('wattage') else None
            except Exception as e:
                logger.warning('[Geizhals] PSU wattage lookup failed: %s', e)

        try:
            db.execute(
                'INSERT INTO source_runs (source, status, offers_found, offers_new, '
                'offers_updated, started_at, finished_at) VALUES (%s,%s,0,0,0,%s,NULL)',
                ('geizhals', 'running', datetime.now()),
            )
            run_id = db.cursor.lastrowid
        except Exception:
            run_id = None

        try:
            offers_data = self.search_product(model_name, component_type)
        except Exception as e:
            logger.error('[Geizhals] fetch failed: %s', e)
            stats['errors'] += 1
            self._finish_run(db, run_id, 'error', stats, str(e))
            return stats

        collected: list[dict] = []
        for item in offers_data:
            if item.get('price') is None:
                continue
            if is_bad_gpu_offer(component_type, item.get('name', '')):
                logger.info('[Geizhals] skip bad GPU offer: %s', item.get('name'))
                continue
            if component_type == 'psu' and not _is_valid_psu_offer_title(item.get('name', ''), psu_wattage):
                logger.info('[Geizhals] skip PSU accessory/non-PSU: %s', item.get('name'))
                continue
            if component_type in ('case', 'cooler') and not _is_valid_case_or_cooler_offer_title(
                item.get('name', ''),
                model_name,
                component_type,
            ):
                logger.info('[Geizhals] skip wrong %s variant: %s', component_type, item.get('name'))
                continue
            try:
                external_id = f"gz-{component_type}-{component_id}-{_url_hash(item['url'])}"
                offer = {
                    'source': 'geizhals', 'external_id': external_id,
                    'component_type': component_type, 'component_id': component_id,
                    'title': item['name'], 'condition': 'new',
                    'price_eur': item['price'], 'url': item['url'],
                    'seller_name': 'Geizhals', 'seller_rating': None,
                    'confidence_score': 0.90, 'is_suspicious': False, 'risk_flags': [],
                }
                result = db.upsert_offer(offer)
                stats['updated' if result == 'updated' else 'new'] += 1
                collected.append(offer)
            except Exception as e:
                logger.error('[Geizhals] DB: %s', e)
                stats['errors'] += 1

        if len(collected) >= 3:
            prices = [o['price_eur'] for o in collected]
            threshold = median(prices) * 1.3
            for o in collected:
                if o['price_eur'] > threshold:
                    try:
                        db.execute(
                            'UPDATE offers SET is_suspicious=1 WHERE source=%s AND external_id=%s',
                            ('geizhals', o['external_id']),
                        )
                    except Exception:
                        pass

        try:
            refresh_recommended_new_offer(db, component_type, component_id)
            refresh_recommended_used_offer(db, component_type, component_id)
        except Exception as e:
            logger.warning('[Geizhals] recommendation update failed: %s', e)

        time.sleep(DELAY)
        self._finish_run(db, run_id, 'success', stats, None)
        return stats

    def _finish_run(self, db, run_id, status, stats, error_message):
        if run_id is None:
            return
        total = stats.get('new', 0) + stats.get('processed', 0) + stats.get('updated', 0)
        try:
            db.execute(
                'UPDATE source_runs SET status=%s, offers_found=%s, offers_new=%s, '
                'offers_updated=%s, finished_at=NOW(), error_message=%s WHERE id=%s',
                (status, total, stats['new'], stats['updated'], error_message, run_id),
            )
        except Exception as e:
            logger.warning('[Geizhals] run update: %s', e)


# ---------------------------------------------------------------------------
# Debug helper
# ---------------------------------------------------------------------------

def _debug_page(html: str) -> None:
    soup  = BeautifulSoup(html, 'lxml')
    cards = _find_cards(soup)
    print(f'\n[DEBUG] Всего карточек: {len(cards)}')
    for i, card in enumerate(cards):
        item = _extract_card(card, '?')
        if item:
            t = 'СЕРИЯ ' if item['is_series'] else 'товар '
            p = f'€{item["price"]:.2f}' if item['price'] else '    — '
            print(f'  [{i+1:2d}] {t} {p}  {item["url"][-65:]}')
        else:
            cls = ' '.join(card.get('class', []))[:60]
            print(f'  [{i+1:2d}] SKIP  "{cls}"')

    print('\n[DEBUG] article.* классы:')
    for el in soup.find_all('article')[:8]:
        print(f'  {" ".join(el.get("class",[]))[:80]}')
    print('[DEBUG] li с span.price:')
    for el in soup.find_all('li'):
        if el.find('span', class_='price'):
            print(f'  {" ".join(el.get("class",[]))[:80]}')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    logging.basicConfig(
        level=logging.DEBUG if DEBUG else logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
    )

    print('Уровни:')
    print(f'  curl_cffi  : {"✓" if _HAS_CURL_CFFI else "✗  pip install curl-cffi"}')
    print(f'  playwright : {"✓" if _HAS_PLAYWRIGHT else "✗  pip install playwright && playwright install chromium"}')
    print(f'  stealth    : {"✓" if _HAS_STEALTH else "✗  pip install playwright-stealth"}')
    print()

    query     = sys.argv[1] if len(sys.argv) > 1 else 'RTX 4070 Ti Super'
    ctype     = sys.argv[2] if len(sys.argv) > 2 else 'gpu'
    no_series = '--no-series' in sys.argv

    print(f'Ищем: "{query}" (тип={ctype}, follow_series={not no_series})\n')

    # DEBUG: показать структуру поисковой страницы
    if DEBUG:
        _html = _fetch_html(_search_url(query, ctype))
        if _html:
            _debug_page(_html)
        print()

    src    = GeizhalsSource()
    offers = src.search_product(query, ctype, follow_series=not no_series)

    print(f'\n{"─"*72}')
    print(f'Итого: {len(offers)} предложений')
    print(f'{"─"*72}')
    for o in offers:
        p = f'€{o["price"]:.2f}' if o.get('price') else '   —   '
        print(f'  {p:>10}  {o["name"][:62]}')
