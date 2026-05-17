from __future__ import annotations

import re


GPU_BAD_OFFER_RE = re.compile(
    r'('
    r'water\s*blocks?|waterblock|ek[-\s]?quantum|backplate|'
    r'wasserk[üu]hl|wasserkuehl|k[üu]hler|kuehler|'
    r'notebook|gaming\s+pc|desktop|nuc|'
    r'nur\s+verpackung|ohne\s+gpu|empty\s+box|box\s+only'
    r')',
    re.I,
)


def is_bad_gpu_offer_title(title: str) -> bool:
    return bool(GPU_BAD_OFFER_RE.search(title or ''))


def is_bad_gpu_offer(component_type: str, title: str) -> bool:
    return (component_type or '').strip().lower() == 'gpu' and is_bad_gpu_offer_title(title)
