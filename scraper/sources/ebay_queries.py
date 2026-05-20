import re


SUPPORTED_EBAY_USED_TYPES = {'cpu', 'gpu', 'ram', 'mainboard', 'case', 'cooler'}


def normalize_component_type(component_type: str) -> str:
    value = (component_type or '').strip().lower()
    aliases = {
        'motherboard': 'mainboard',
        'mainboards': 'mainboard',
        'mobo': 'mainboard',
        'cases': 'case',
        'coolers': 'cooler',
    }
    return aliases.get(value, value)


def _compact_spaces(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def _dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        clean = _compact_spaces(value)
        key = clean.casefold()
        if clean and key not in seen:
            seen.add(key)
            result.append(clean)
    return result


def _chipset(name: str) -> str | None:
    match = re.search(r'\b([ABHXZ]\d{3}[A-Z]?)\b', name or '', re.I)
    return match.group(1).upper() if match else None


def _first_socket(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r'\b(AM[45]|LGA\s*\d{4})\b', value, re.I)
    return re.sub(r'\s+', '', match.group(1).upper()) if match else None


def build_ebay_queries(component_type: str, name: str, component: dict | None = None) -> list[str]:
    component = component or {}
    ctype = normalize_component_type(component_type)
    clean_name = _compact_spaces(name)

    if ctype == 'cpu':
        queries = [
            f'{clean_name} CPU',
            f'{clean_name} Prozessor',
        ]
    elif ctype == 'gpu':
        no_geforce = re.sub(r'\bGeForce\b', '', clean_name, flags=re.I)
        queries = [
            f'{clean_name} Grafikkarte',
            f'{no_geforce} GPU',
        ]
    elif ctype == 'ram':
        ram_type = component.get('ram_type')
        capacity = component.get('capacity_gb')
        speed = component.get('speed_mhz')
        detail = ' '.join(str(part) for part in (ram_type, f'{capacity}GB' if capacity else None, speed, 'RAM') if part)
        brandish = ' '.join(clean_name.split()[:3])
        queries = [
            detail,
            f'{brandish} {ram_type or ""} {capacity}GB'.strip() if capacity else clean_name,
        ]
    elif ctype == 'mainboard':
        chipset = _chipset(clean_name)
        socket = component.get('socket')
        queries = [
            f'{chipset or clean_name} {socket or ""} Mainboard',
            clean_name,
        ]
    elif ctype == 'case':
        form_factor = component.get('form_factor') or 'ATX'
        queries = [
            f'{clean_name} {form_factor} Gehäuse',
            f'{clean_name} PC Gehäuse',
        ]
    elif ctype == 'cooler':
        socket = _first_socket(component.get('supported_sockets'))
        queries = [
            f'{clean_name} CPU Kühler',
            f'{clean_name} {socket or ""}',
        ]
    else:
        queries = [clean_name]

    return _dedupe(queries)
