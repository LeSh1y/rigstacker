from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

TERMINAL_STATES = {'sold', 'ended', 'not_found', 'unavailable'}

CAPTCHA_OR_BLOCKED_RE = re.compile(
    r'(captcha|verify\s+you\s+are\s+a\s+human|security\s+measure|access\s+denied|blocked|'
    r'bot\s+detection|unusual\s+activity|bitte\s+best.tigen|bitte\s+bestaetigen|'
    r'sicherheits.berpr.fung|sicherheitsueberpruefung)',
    re.I,
)

SOLD_RE = re.compile(
    r'(dieses\s+angebot\s+wurde\s+verkauft|artikel\s+wurde\s+verkauft|'
    r'originalangebot\s+ansehen|this\s+item\s+has\s+sold|this\s+listing\s+sold|item\s+sold|sold\s+out)',
    re.I,
)

ENDED_RE = re.compile(
    r'(dieses\s+angebot\s+wurde\s+beendet|angebot\s+beendet|angebot\s+ist\s+beendet|'
    r'this\s+listing\s+has\s+ended|this\s+item\s+has\s+ended|listing\s+ended|ended\s+on)',
    re.I,
)

UNAVAILABLE_RE = re.compile(
    r'(dieser\s+artikel\s+ist\s+nicht\s+verf.gbar|dieser\s+artikel\s+ist\s+nicht\s+verfuegbar|'
    r'nicht\s+mehr\s+verf.gbar|nicht\s+mehr\s+verfuegbar|'
    r'dieses\s+angebot\s+ist\s+nicht\s+mehr\s+verf.gbar|dieses\s+angebot\s+ist\s+nicht\s+mehr\s+verfuegbar|'
    r'artikel\s+nicht\s+verf.gbar|artikel\s+nicht\s+verfuegbar|'
    r'this\s+item\s+is\s+not\s+available|item\s+not\s+available|no\s+longer\s+available|'
    r'currently\s+unavailable)',
    re.I,
)

NOT_FOUND_RE = re.compile(
    r'(seite\s+nicht\s+gefunden|artikel\s+nicht\s+gefunden|angebot\s+nicht\s+gefunden|'
    r'we\s+looked\s+everywhere|page\s+not\s+found|item\s+not\s+found|listing\s+not\s+found)',
    re.I,
)

ACTIVE_RE = re.compile(
    r'(sofort-kaufen|in\s+den\s+warenkorb|preisvorschlag|gebot\s+abgeben|'
    r'buy\s+it\s+now|add\s+to\s+cart|make\s+offer|place\s+bid)',
    re.I,
)


@dataclass
class AvailabilityResult:
    state: str
    reason: str | None = None
    status_code: int | None = None


def _page_text(html: str) -> str:
    soup = BeautifulSoup(html or '', 'html.parser')
    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()
    title = soup.title.string if soup.title and soup.title.string else ''
    body = soup.get_text(' ', strip=True)
    return f'{title} {body}'


def _normalize_text(text: str) -> str:
    normalized = (text or '').casefold()
    return (
        normalized
        .replace('ä', 'ae')
        .replace('ö', 'oe')
        .replace('ü', 'ue')
        .replace('ß', 'ss')
    )


def detect_ebay_availability(status_code: int, html: str) -> AvailabilityResult:
    if status_code in {404, 410}:
        return AvailabilityResult('not_found', 'http_not_found', status_code)

    if status_code in {401, 403, 429, 500, 502, 503, 504}:
        return AvailabilityResult('unknown', f'http_{status_code}', status_code)

    text = _page_text(html)
    normalized_text = _normalize_text(text)
    if not text:
        return AvailabilityResult('unknown', 'empty_page', status_code)

    if CAPTCHA_OR_BLOCKED_RE.search(text) or CAPTCHA_OR_BLOCKED_RE.search(normalized_text):
        return AvailabilityResult('unknown', 'captcha_or_blocked', status_code)

    if NOT_FOUND_RE.search(text) or NOT_FOUND_RE.search(normalized_text):
        return AvailabilityResult('not_found', 'not_found_text', status_code)
    if SOLD_RE.search(text) or SOLD_RE.search(normalized_text):
        return AvailabilityResult('sold', 'sold_text', status_code)
    if ENDED_RE.search(text) or ENDED_RE.search(normalized_text):
        return AvailabilityResult('ended', 'ended_text', status_code)
    if UNAVAILABLE_RE.search(text) or UNAVAILABLE_RE.search(normalized_text):
        return AvailabilityResult('unavailable', 'unavailable_text', status_code)
    if ACTIVE_RE.search(text) or ACTIVE_RE.search(normalized_text):
        return AvailabilityResult('active', 'active_purchase_signal', status_code)

    return AvailabilityResult('unknown', 'no_clear_signal', status_code)


class EbayAvailabilityAnalyzer:
    def __init__(self, db, session: requests.Session | None = None, timeout: int = 15):
        self.db = db
        self.session = session or requests.Session()
        self.timeout = timeout

    def check_url(self, url: str) -> AvailabilityResult:
        response = self.session.get(
            url,
            headers={
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/124.0 Safari/537.36'
                ),
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.7,en;q=0.6',
            },
            timeout=self.timeout,
        )
        return detect_ebay_availability(response.status_code, response.text)

    def check_offer(self, offer: dict) -> AvailabilityResult:
        url = (offer.get('url') or '').strip()
        external_id = offer.get('external_id')

        logger.info('checked source=ebay external_id=%s url=%s', external_id, url)

        if not external_id:
            logger.info('skipped_unknown source=ebay reason=missing_external_id url=%s', url)
            return AvailabilityResult('unknown', 'missing_external_id')

        if not url:
            logger.info('skipped_unknown source=ebay external_id=%s reason=missing_url', external_id)
            return AvailabilityResult('unknown', 'missing_url')

        try:
            result = self.check_url(url)
        except requests.RequestException as exc:
            logger.warning('error source=ebay external_id=%s reason=%s', external_id, exc)
            return AvailabilityResult('unknown', 'request_error')

        if result.state in TERMINAL_STATES:
            self.db.mark_offer_inactive('ebay', external_id, result.state)
            logger.info(
                '%s source=ebay external_id=%s reason=%s status=%s',
                result.state,
                external_id,
                result.reason,
                result.status_code,
            )
        elif result.state == 'active':
            self.db.mark_offer_active('ebay', external_id)
            logger.info(
                'active source=ebay external_id=%s reason=%s status=%s',
                external_id,
                result.reason,
                result.status_code,
            )
        else:
            logger.info(
                'skipped_unknown source=ebay external_id=%s reason=%s status=%s',
                external_id,
                result.reason,
                result.status_code,
            )

        return result

    def run(self, older_than_hours: int = 12, limit: int = 100) -> dict[str, int]:
        offers = self.db.get_stale_active_offers(
            source='ebay',
            older_than_hours=older_than_hours,
            limit=limit,
        )
        stats = {
            'checked': 0,
            'active': 0,
            'sold': 0,
            'ended': 0,
            'not_found': 0,
            'unavailable': 0,
            'skipped_unknown': 0,
            'error': 0,
        }

        for offer in offers:
            stats['checked'] += 1
            result = self.check_offer(offer)
            if result.state in {'active', 'sold', 'ended', 'not_found', 'unavailable'}:
                stats[result.state] += 1
            elif result.reason == 'request_error':
                stats['error'] += 1
            else:
                stats['skipped_unknown'] += 1

        return stats
