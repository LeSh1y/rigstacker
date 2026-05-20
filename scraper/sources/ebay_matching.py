import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from config import CONFIDENCE_THRESHOLD
from sources.ebay_queries import normalize_component_type


BAD_CONDITION_RE = re.compile(
    r'\b('
    r'defekt|defective|for\s+parts|bastler|nur\s+verpackung|only\s+box|box\s+only|'
    r'empty\s+box|ersatzteile'
    r')\b',
    re.I,
)

ACCESSORY_ONLY_RE = re.compile(
    r'\b('
    r'zubeh[oö]r\s+only|bracket|halterung|mounting\s+kit|montagekit|adapter|kabel|cable|'
    r'fan\s+only|lüfter\s+only|luefter\s+only|glass\s+panel|seitenfenster|'
    r'side\s+panel|front\s+panel|tray|schrauben|screws|backplate|waterblock|'
    r'wasserkuehler|wasserk[üu]hler'
    r')\b',
    re.I,
)

IO_SHIELD_ONLY_RE = re.compile(r'\b(?:i\s*/?\s*o|io)\s+shield\s+only\b', re.I)

GPU_MODEL_RE = re.compile(
    r'\b('
    r'RTX\s+\d{4}(?:\s+Ti)?(?:\s+Super)?|'
    r'RX\s+\d{4}(?:\s+XT)?(?:\s+XTX)?|'
    r'Arc\s+[AB]\d{3}'
    r')\b',
    re.I,
)

CPU_MODEL_RE = re.compile(
    r'\b('
    r'Ryzen\s+[3579]\s+\d{4}(?:X3D|X)?|'
    r'Core\s+i[3579][-\s]?\d{5}[A-Z]*|'
    r'i[3579][-\s]?\d{5}[A-Z]*'
    r')\b',
    re.I,
)

DDR_RE = re.compile(r'\bDDR\s*([45])\b', re.I)
CAPACITY_RE = re.compile(r'\b(\d+)\s*(?:GB|G)\b', re.I)
KIT_RE = re.compile(r'\b(\d+)\s*x\s*(\d+)\s*(?:GB|G)\b', re.I)
SPEED_RE = re.compile(r'\b(?:DDR[45][-\s]*)?([1-9]\d{3})\s*(?:MHz|MT/s)?\b', re.I)
CHIPSET_RE = re.compile(r'\b([ABHXZ]\d{3}[A-Z]?)\b', re.I)
SOCKET_RE = re.compile(r'\b(AM[45]|LGA\s*\d{4})\b', re.I)

DROP_TOKENS = {
    'AMD', 'INTEL', 'GEFORCE', 'NVIDIA', 'RADEON', 'ASUS', 'MSI', 'GIGABYTE',
    'CORSAIR', 'GSKILL', 'G', 'SKILL', 'KINGSTON', 'FRACTAL', 'DESIGN',
    'BE', 'QUIET', 'NOCTUA', 'ARCTIC', 'THERMALRIGHT', 'CPU', 'GPU',
    'RAM', 'DDR4', 'DDR5', 'MAINBOARD', 'MOTHERBOARD', 'GEHAEUSE', 'GEHÄUSE',
    'CASE', 'COOLER', 'KUEHLER', 'KÜHLER', 'PC', 'WIFI', 'WI', 'FI',
}


@dataclass
class EbayMatchResult:
    matched: bool
    reason: str
    confidence: float = 0.0


def _normalize(value: Any) -> str:
    text = str(value or '').upper()
    text = text.replace('Ä', 'AE').replace('Ö', 'OE').replace('Ü', 'UE').replace('ß', 'SS')
    text = re.sub(r'[^A-Z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _canonical_model(value: str) -> str:
    return _normalize(value).replace(' ', '')


def _contains_exact_name(title: str, name: str) -> bool:
    return _canonical_model(name) in _canonical_model(title)


def _extract(regex: re.Pattern, text: str) -> str | None:
    match = regex.search(text or '')
    return _canonical_model(match.group(1)) if match else None


def _tokens(value: str) -> list[str]:
    return [token for token in _normalize(value).split() if token and token not in DROP_TOKENS]


def _important_tokens(value: str) -> list[str]:
    return [token for token in _tokens(value) if len(token) > 1 and not token.isdigit()]


def _contains_token_sequence(title: str, name: str) -> bool:
    title_tokens = _tokens(title)
    name_tokens = _important_tokens(name)
    if not name_tokens:
        return False
    for index in range(0, len(title_tokens) - len(name_tokens) + 1):
        if title_tokens[index:index + len(name_tokens)] == name_tokens:
            return True
    overlap = set(name_tokens) & set(title_tokens)
    required = max(1, min(len(name_tokens), 2))
    return len(overlap) >= required


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = int(value)
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _json_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    try:
        parsed = json.loads(value or '[]')
    except (TypeError, ValueError):
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _extract_ram_total_capacity(value: str) -> int | None:
    text = value or ''
    kit_match = KIT_RE.search(text)
    if kit_match:
        return int(kit_match.group(1)) * int(kit_match.group(2))

    capacity_match = CAPACITY_RE.search(text)
    return int(capacity_match.group(1)) if capacity_match else None


def _ram_target_capacity(component: dict, name: str) -> int | None:
    return _as_int(component.get('capacity_gb')) or _extract_ram_total_capacity(name)


def _ram_capacity_matches(title: str, expected: int | None) -> bool:
    if not expected:
        return True

    listing_total = _extract_ram_total_capacity(title)
    return listing_total is not None and listing_total == expected


def _ram_speed_matches(title: str, expected: int | None) -> bool:
    if not expected:
        return True
    speeds = {int(match.group(1)) for match in SPEED_RE.finditer(title or '')}
    return not speeds or expected in speeds


def _ram_type_matches(title: str, expected: str | None) -> bool:
    if not expected:
        return True
    match = DDR_RE.search(title or '')
    return not match or f'DDR{match.group(1)}'.upper() == str(expected).upper()


def _ram_model_tokens(value: str) -> set[str]:
    tokens = set()
    for token in _tokens(value):
        if re.fullmatch(r'\d+', token):
            continue
        if re.fullmatch(r'\d+GB?', token):
            continue
        if re.fullmatch(r'[1-9]\d{3}', token):
            continue
        tokens.add(token)
    return tokens


def _ram_model_matches(title: str, name: str) -> bool:
    target_tokens = _ram_model_tokens(name)
    if not target_tokens:
        return True
    return bool(target_tokens & _ram_model_tokens(title))


def _chipset(value: str) -> str | None:
    match = CHIPSET_RE.search(value or '')
    return match.group(1).upper() if match else None


def _socket(value: str) -> str | None:
    match = SOCKET_RE.search(value or '')
    return re.sub(r'\s+', '', match.group(1).upper()) if match else None


def _bad_listing_reason(title: str) -> str | None:
    if BAD_CONDITION_RE.search(title or ''):
        return 'rejected_bad_condition'
    if ACCESSORY_ONLY_RE.search(title or '') or IO_SHIELD_ONLY_RE.search(title or ''):
        return 'rejected_accessory_only'
    return None


def match_ebay_offer_to_component(title: str, component_type: str, component: dict) -> EbayMatchResult:
    ctype = normalize_component_type(component_type)
    name = component.get('name', '')

    bad_reason = _bad_listing_reason(title)
    if bad_reason:
        return EbayMatchResult(False, bad_reason)

    if ctype == 'cpu':
        title_model = _extract(CPU_MODEL_RE, title)
        target_model = _extract(CPU_MODEL_RE, name)
        if not title_model or not target_model or title_model != target_model:
            return EbayMatchResult(False, 'rejected_wrong_model')
        return EbayMatchResult(True, 'accepted_exact_match', 0.95)

    if ctype == 'gpu':
        title_model = _extract(GPU_MODEL_RE, title)
        target_model = _extract(GPU_MODEL_RE, name)
        if not title_model or not target_model or title_model != target_model:
            return EbayMatchResult(False, 'rejected_wrong_model')
        return EbayMatchResult(True, 'accepted_exact_match', 0.95)

    if ctype == 'ram':
        if not _ram_type_matches(title, component.get('ram_type')):
            return EbayMatchResult(False, 'rejected_wrong_generation')
        if not _ram_capacity_matches(title, _ram_target_capacity(component, name)):
            return EbayMatchResult(False, 'rejected_wrong_capacity')
        if not _ram_speed_matches(title, _as_int(component.get('speed_mhz'))):
            return EbayMatchResult(False, 'rejected_wrong_model')
        if not _ram_model_matches(title, name):
            return EbayMatchResult(False, 'rejected_low_confidence', 0.55)
        return EbayMatchResult(True, 'accepted_exact_match', 0.9)

    if ctype == 'mainboard':
        target_chipset = _chipset(name)
        title_chipset = _chipset(title)
        if target_chipset and title_chipset and target_chipset != title_chipset:
            return EbayMatchResult(False, 'rejected_wrong_generation')
        target_socket = _socket(component.get('socket') or '')
        title_socket = _socket(title)
        if target_socket and title_socket and target_socket != title_socket:
            return EbayMatchResult(False, 'rejected_wrong_generation')
        if not _contains_token_sequence(title, name):
            return EbayMatchResult(False, 'rejected_wrong_model')
        return EbayMatchResult(True, 'accepted_exact_match', 0.88)

    if ctype in {'case', 'cooler'}:
        if not _contains_token_sequence(title, name):
            return EbayMatchResult(False, 'rejected_wrong_model')
        if ctype == 'cooler':
            title_socket = _socket(title)
            sockets = {_socket(socket) for socket in _json_list(component.get('supported_sockets'))}
            sockets.discard(None)
            if title_socket and sockets and title_socket not in sockets:
                return EbayMatchResult(False, 'rejected_wrong_generation')
        return EbayMatchResult(True, 'accepted_exact_match', 0.86)

    return EbayMatchResult(False, 'rejected_low_confidence')


def is_supported_ebay_used_type(component_type: str) -> bool:
    return normalize_component_type(component_type) in {'cpu', 'gpu', 'ram', 'mainboard', 'case', 'cooler'}


def is_confident_match(match: EbayMatchResult) -> bool:
    return match.matched and match.confidence >= CONFIDENCE_THRESHOLD
