from __future__ import annotations

import logging
import json
import re
from datetime import datetime
from typing import Any

try:
    from db import TABLE_MAP
except Exception:
    TABLE_MAP = {
        'gpu': 'gpus',
        'cpu': 'cpus',
        'mainboard': 'mainboards',
        'ram': 'ram_kits',
        'psu': 'psus',
        'case': 'cases',
        'cooler': 'coolers',
        'storage': 'storage',
    }

logger = logging.getLogger(__name__)

try:
    from sources.gpu_offer_filter import is_bad_gpu_offer
except Exception:
    def is_bad_gpu_offer(component_type: str, title: str) -> bool:
        return False

OFFICIAL_NEW_SOURCES = {'geizhals', 'mindfactory'}
USED_CONDITIONS = {'used', 'refurbished', 'open_box'}
USED_ALLOWED = {
    'gpu': True,
    'case': True,
    'cooler': True,
    'cpu': True,
    'ram': True,
    'mainboard': True,
    'storage': True,
    'psu': True,
}
STRONG_BAD_USED_FLAGS = {
    'broken',
    'defect',
    'mining',
    'no_warranty',
    'parts_only',
    'damaged',
    'not_working',
    'auction_listing',
}
USED_DISCOUNT_THRESHOLDS = {
    'cpu': 0.15,
    'gpu': 0.20,
    'ram': 0.20,
    'mainboard': 0.25,
    'case': 0.25,
    'cooler': 0.20,
}
ACCESSORY_TITLE_RE = re.compile(
    r'\b('
    r'box|empty\s+box|ovp\s+leer|karton|fan|l[uü]fter|cooler|heatsink|backplate|'
    r'cable|adapter|bracket|mounting\s+kit|montagekit|holder|ersatzteil|replacement|parts|spare|'
    r'defekt|defective|broken|not\s+working|damaged|mining|for\s+parts|'
    r'ohne\s+garantie|no\s+warranty'
    r')\b',
    re.I,
)
PSU_ACCESSORY_RE = re.compile(
    r'\b('
    r'kabel|cable|kabelersatz|stromkabel|adapter|replacement|austausch|'
    r'connector|verl[aä]ngerung|extension|sata-laufwerkskabel|pci-e\s*cable|'
    r'8pin|8-pin|6pin|6-pin|24pin|24-pin'
    r')\b',
    re.I,
)
PSU_REAL_PRODUCT_RE = re.compile(
    r'\b(netzteil|psu|power\s+supply|atx|80\+|gold|platinum|watt|\d{3,4}\s*w)\b',
    re.I,
)
PSU_MODEL_TOKEN_RE = re.compile(r'\b[A-Z]{1,12}\d{3,4}[A-Z]{0,4}\b', re.I)
COOLER_CONFLICT_TOKENS = {'SLIM', 'PRO', 'ELITE', 'RGB', 'XT', 'FX'}
CASE_CONFLICT_TOKENS = {'XL', 'MINI', 'MICRO'}
TYPE_ALIASES = {
    'motherboard': 'mainboard',
    'mainboards': 'mainboard',
    'mobo': 'mainboard',
    'ssd': 'storage',
}
PRICE_MIN = 10.0
PRICE_MAX = 10_000.0


def _normalize_type(component_type: str) -> str:
    value = (component_type or '').strip().lower()
    return TYPE_ALIASES.get(value, value)


def _is_false(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return not value
    if isinstance(value, (int, float)):
        return value == 0
    if isinstance(value, str):
        return value.strip().lower() in {'', '0', 'false', 'no', 'none'}
    return False


def _is_active_offer(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() not in {'0', 'false', 'no'}
    return True


def _valid_price(value: Any) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if PRICE_MIN <= price <= PRICE_MAX else None


def _effective_used_price(offer: dict) -> float | None:
    total_price = _valid_price(offer.get('total_price'))
    if total_price is not None:
        return total_price
    return _valid_price(offer.get('price_eur'))


def _is_true(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes'}
    return False


def _reject_used(reason: str, component_type: str, title: str, **extra: Any) -> None:
    details = ' '.join(f'{key}={value}' for key, value in extra.items())
    logger.info('[UsedOfferAnalyzer] %s %s %s title="%s"', reason, component_type, details, title)


def _parse_risk_flags(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(flag).strip().lower() for flag in value if str(flag).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(flag).strip().lower() for flag in parsed if str(flag).strip()]
        except json.JSONDecodeError:
            pass
        return [flag.strip().lower() for flag in raw.split(',') if flag.strip()]
    return [str(value).strip().lower()] if str(value).strip() else []


def _seller_rating(value: Any) -> float:
    try:
        rating = float(value)
    except (TypeError, ValueError):
        return 0.0
    if rating > 1:
        rating = rating / 100
    return max(0.0, min(1.0, rating))


def _norm_text(text: str) -> str:
    return re.sub(r'[^A-Z0-9]+', ' ', (text or '').upper()).strip()


def _tokens(text: str) -> list[str]:
    return _norm_text(text).split()


def _has_token(text: str, token: str) -> bool:
    return bool(re.search(rf'(?<![A-Z0-9]){re.escape(token.upper())}(?![A-Z0-9])', text))


def _model_numbers(text: str) -> list[str]:
    return re.findall(r'\b\d{4}\b', _norm_text(text))


def _is_relevant_used_title(component_name: str, title: str, component_type: str) -> bool:
    if not title or ACCESSORY_TITLE_RE.search(title):
        return False

    normalized_type = _normalize_type(component_type)
    component_norm = _norm_text(component_name)
    title_norm = _norm_text(title)

    if normalized_type == 'gpu':
        family = None
        for candidate in ('RTX', 'RX', 'GTX'):
            if _has_token(component_norm, candidate):
                family = candidate
                break

        if family and not _has_token(title_norm, family):
            return False

        component_models = _model_numbers(component_norm)
        if component_models:
            model = component_models[0]
            if not _has_token(title_norm, model):
                return False

            title_models = set(_model_numbers(title_norm))
            different_models = {
                candidate
                for candidate in title_models
                if candidate != model and candidate[:2] == model[:2]
            }
            if different_models:
                return False

        component_has_ti = _has_token(component_norm, 'TI')
        title_has_ti = _has_token(title_norm, 'TI')
        if component_has_ti != title_has_ti:
            return False

        component_has_super = _has_token(component_norm, 'SUPER')
        title_has_super = _has_token(title_norm, 'SUPER')
        if component_has_super != title_has_super:
            return False

    return True


def _extract_wattage(component: dict | None = None) -> int | None:
    if not component:
        return None
    for key in ('wattage', 'tdp'):
        try:
            value = int(component.get(key))
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


def _is_valid_psu_offer_title(title: str, component: dict | None = None) -> bool:
    title = title or ''
    if PSU_ACCESSORY_RE.search(title):
        return False
    if not PSU_REAL_PRODUCT_RE.search(title):
        return False

    model_tokens = {token.upper() for token in PSU_MODEL_TOKEN_RE.findall(title)}
    if len(model_tokens) >= 3:
        return False

    wattage = _extract_wattage(component)
    if wattage:
        if not re.search(rf'(?<!\d){wattage}\s*w?\b', title, re.I):
            return False

    return True


def _contains_sequence(haystack: list[str], needle: list[str]) -> bool:
    if not needle:
        return False
    limit = len(haystack) - len(needle) + 1
    return any(haystack[i:i + len(needle)] == needle for i in range(max(0, limit)))


def _version_tokens(tokens: list[str]) -> set[str]:
    return {token for token in tokens if re.search(r'\d', token)}


def _important_model_tokens(name: str, component_type: str) -> list[str]:
    tokens = _tokens(name)
    drop = {'FRACTAL', 'DESIGN', 'BE', 'QUIET', 'CORSAIR', 'NOCTUA'}
    kept = [token for token in tokens if token not in drop and token != '']
    if component_type == 'cooler':
        return kept
    if component_type == 'case':
        return kept
    return tokens


def _is_valid_case_or_cooler_offer_title(
    title: str,
    component: dict | None,
    component_type: str,
) -> bool:
    component_name = (component or {}).get('name', '')
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

    conflict_tokens = COOLER_CONFLICT_TOKENS if component_type == 'cooler' else CASE_CONFLICT_TOKENS
    component_conflicts = set(component_tokens) & conflict_tokens
    title_conflicts = set(title_tokens) & conflict_tokens
    if title_conflicts - component_conflicts:
        return False

    return True


class NewOfferAnalyzer:
    def analyze(self, offers: list[dict], component_type: str, component: dict | None = None) -> dict | None:
        valid: list[tuple[float, dict]] = []
        normalized_type = _normalize_type(component_type)

        for offer in offers:
            if not _is_active_offer(offer.get('is_active')):
                continue
            source = (offer.get('source') or '').strip().lower()
            condition = (offer.get('condition') or '').strip().lower()
            url = (offer.get('url') or '').strip()
            price = _valid_price(offer.get('price_eur'))

            if source not in OFFICIAL_NEW_SOURCES:
                continue
            if condition != 'new':
                continue
            if not _is_false(offer.get('is_suspicious')):
                continue
            if price is None:
                continue
            if not url:
                continue
            if is_bad_gpu_offer(normalized_type, offer.get('title', '')):
                continue
            if normalized_type == 'psu' and not _is_valid_psu_offer_title(offer.get('title', ''), component):
                continue
            if normalized_type in ('case', 'cooler') and not _is_valid_case_or_cooler_offer_title(
                offer.get('title', ''),
                component,
                normalized_type,
            ):
                continue

            valid.append((price, offer))

        if not valid:
            return None

        price, offer = min(valid, key=lambda item: item[0])
        return {'price': price, 'offer': offer}


def analyze_new_offers(offers: list[dict], component_type: str, component: dict | None = None) -> dict | None:
    return NewOfferAnalyzer().analyze(offers, component_type, component)


class UsedOfferAnalyzer:
    def analyze(
        self,
        offers: list[dict],
        component_type: str,
        new_price: float | None,
        component_name: str = '',
    ) -> dict | None:
        normalized_type = _normalize_type(component_type)
        if not USED_ALLOWED.get(normalized_type, False):
            return None

        new_price_value = _valid_price(new_price)
        if new_price_value is None or new_price_value <= 0:
            return None

        scored: list[tuple[float, float, dict]] = []

        for offer in offers:
            if not _is_active_offer(offer.get('is_active')):
                continue
            source = (offer.get('source') or '').strip().lower()
            condition = (offer.get('condition') or '').strip().lower()
            url = (offer.get('url') or '').strip()
            title = offer.get('title', '')
            item_price = _valid_price(offer.get('price_eur'))
            used_price = _effective_used_price(offer)

            if source != 'ebay':
                continue
            if condition not in USED_CONDITIONS:
                continue
            if not _is_false(offer.get('is_suspicious')):
                _reject_used('rejected_bad_condition', normalized_type, title)
                continue
            if used_price is None:
                continue
            if not url:
                continue
            if is_bad_gpu_offer(normalized_type, title):
                _reject_used('rejected_bad_condition', normalized_type, title)
                continue
            if not _is_relevant_used_title(component_name, title, normalized_type):
                if ACCESSORY_TITLE_RE.search(title or ''):
                    _reject_used('rejected_accessory_only', normalized_type, title)
                continue

            risk_flags = _parse_risk_flags(offer.get('risk_flags'))
            if STRONG_BAD_USED_FLAGS.intersection(risk_flags):
                _reject_used('rejected_bad_condition', normalized_type, title, flags=','.join(risk_flags))
                continue

            if normalized_type == 'case':
                if _is_true(offer.get('shipping_unknown')):
                    _reject_used('rejected_shipping_unknown_for_case', normalized_type, title)
                    continue
                shipping_price = _valid_price(offer.get('shipping_price'))
                if shipping_price is not None and item_price is not None and shipping_price > item_price:
                    _reject_used(
                        'rejected_shipping_too_high',
                        normalized_type,
                        title,
                        item_price=item_price,
                        shipping_price=shipping_price,
                    )
                    continue
                if 'local_only' in risk_flags:
                    _reject_used('rejected_bad_condition', normalized_type, title, flags='local_only')
                    continue

            discount_pct = (new_price_value - used_price) / new_price_value
            threshold = USED_DISCOUNT_THRESHOLDS.get(normalized_type, 0.15)
            if discount_pct < threshold:
                _reject_used(
                    'rejected_insufficient_discount',
                    normalized_type,
                    title,
                    discount=round(discount_pct, 4),
                    required=threshold,
                )
                continue
            if normalized_type == 'gpu' and used_price < 0.45 * new_price_value:
                _reject_used('rejected_bad_condition', normalized_type, title)
                continue
            if normalized_type == 'gpu' and used_price > 0.95 * new_price_value:
                _reject_used('rejected_insufficient_discount', normalized_type, title)
                continue

            rating = _seller_rating(offer.get('seller_rating'))
            score = (discount_pct * 100) + (rating * 10) - (len(risk_flags) * 2)
            _reject_used(
                'accepted_used_value',
                normalized_type,
                title,
                total_price=used_price,
                discount=round(discount_pct, 4),
            )
            scored.append((score, discount_pct, {**offer, 'risk_flags': risk_flags}))

        if not scored:
            return None

        _, discount_pct, offer = max(scored, key=lambda item: item[0])
        effective_price = _effective_used_price(offer)
        return {
            'price': float(effective_price),
            'offer': offer,
            'discount_pct': discount_pct,
        }


def analyze_used_offers(
    offers: list[dict],
    component_type: str,
    new_price: float | None,
    component_name: str = '',
) -> dict | None:
    return UsedOfferAnalyzer().analyze(offers, component_type, new_price, component_name)


def _table_for_component(component_type: str) -> str | None:
    return TABLE_MAP.get(_normalize_type(component_type))


def _column_exists(db, table: str, column: str) -> bool:
    row = db.fetchone(
        '''
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        ''',
        (table, column),
    )
    return bool(row and row.get('count'))


def refresh_recommended_new_offer(db, component_type: str, component_id: int) -> dict | None:
    normalized_type = _normalize_type(component_type)
    table = _table_for_component(normalized_type)
    if not table:
        logger.warning('[NewOfferAnalyzer] unknown component type: %s', component_type)
        return None

    component_columns = 'id, name, wattage' if normalized_type == 'psu' else 'id, name'
    component = db.fetchone(
        f'SELECT {component_columns} FROM {table} WHERE id = %s',
        (component_id,),
    )

    offers = db.fetchall(
        '''
        SELECT id, source, external_id, component_type, component_id, title,
               `condition`, price_eur, url, seller_name, seller_rating,
               is_active, is_suspicious
        FROM offers
        WHERE component_type = %s AND component_id = %s
          AND COALESCE(is_active, 1) = 1
        ''',
        (normalized_type, component_id),
    )
    result = analyze_new_offers(offers, normalized_type, component)
    if result is None:
        logger.info(
            '[NewOfferAnalyzer] no valid official new offer for %s:%s',
            normalized_type,
            component_id,
        )
        return None

    offer = result['offer']
    column_values = {
        'recommended_new_price': result['price'],
        'recommended_new_source': offer.get('source'),
        'recommended_new_offer_id': offer.get('id'),
        'recommended_new_external_id': offer.get('external_id'),
        'price_updated_at': datetime.now(),
    }
    available = {
        column: value
        for column, value in column_values.items()
        if _column_exists(db, table, column)
    }

    if not available:
        logger.warning(
            '[NewOfferAnalyzer] recommendation columns missing on %s; run init_recommended_new_columns.py',
            table,
        )
        return result

    assignments = ', '.join(f'{column} = %s' for column in available)
    params = tuple(available.values()) + (component_id,)
    db.execute(f'UPDATE {table} SET {assignments} WHERE id = %s', params)

    logger.info(
        '[NewOfferAnalyzer] %s:%s recommended %s from %s',
        normalized_type,
        component_id,
        result['price'],
        offer.get('source'),
    )
    return result


def refresh_recommended_used_offer(db, component_type: str, component_id: int) -> dict | None:
    normalized_type = _normalize_type(component_type)
    table = _table_for_component(normalized_type)
    if not table:
        logger.warning('[UsedOfferAnalyzer] unknown component type: %s', component_type)
        return None

    if not USED_ALLOWED.get(normalized_type, False):
        return None

    component = db.fetchone(
        f'SELECT name, recommended_new_price FROM {table} WHERE id = %s',
        (component_id,),
    )
    new_price = component.get('recommended_new_price') if component else None
    component_name = component.get('name') if component else ''

    offers = db.fetchall(
        '''
        SELECT id, source, external_id, component_type, component_id, title,
               `condition`, price_eur, shipping_price, total_price, shipping_unknown,
               url, seller_name, seller_rating,
               is_active, is_suspicious, risk_flags
        FROM offers
        WHERE component_type = %s AND component_id = %s
          AND COALESCE(is_active, 1) = 1
        ''',
        (normalized_type, component_id),
    )
    result = analyze_used_offers(offers, normalized_type, new_price, component_name)
    if result is None:
        _clear_recommended_used_offer(db, table, component_id)
        logger.info(
            '[UsedOfferAnalyzer] no valid used offer for %s:%s',
            normalized_type,
            component_id,
        )
        return None

    offer = result['offer']
    column_values = {
        'recommended_used_price': result['price'],
        'recommended_used_source': offer.get('source'),
        'recommended_used_offer_id': offer.get('id'),
        'recommended_used_external_id': offer.get('external_id'),
        'recommended_used_discount': result['discount_pct'],
        'price_updated_at': datetime.now(),
    }
    available = {
        column: value
        for column, value in column_values.items()
        if _column_exists(db, table, column)
    }

    if not available:
        logger.warning(
            '[UsedOfferAnalyzer] recommendation columns missing on %s; run init_recommended_used_columns.py',
            table,
        )
        return result

    assignments = ', '.join(f'{column} = %s' for column in available)
    params = tuple(available.values()) + (component_id,)
    db.execute(f'UPDATE {table} SET {assignments} WHERE id = %s', params)

    logger.info(
        '[UsedOfferAnalyzer] %s:%s recommended %s from %s (discount %.1f%%)',
        normalized_type,
        component_id,
        result['price'],
        offer.get('source'),
        result['discount_pct'] * 100,
    )
    return result


def _clear_recommended_used_offer(db, table: str, component_id: int) -> None:
    column_values = {
        'recommended_used_price': None,
        'recommended_used_source': None,
        'recommended_used_offer_id': None,
        'recommended_used_external_id': None,
        'recommended_used_discount': None,
        'price_updated_at': datetime.now(),
    }
    available = {
        column: value
        for column, value in column_values.items()
        if _column_exists(db, table, column)
    }
    if not available:
        return

    assignments = ', '.join(f'{column} = %s' for column in available)
    params = tuple(available.values()) + (component_id,)
    db.execute(f'UPDATE {table} SET {assignments} WHERE id = %s', params)
