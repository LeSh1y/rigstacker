RISK_KEYWORDS = {
    'mining':      ['mining', 'miner', 'kryptomining'],
    'defect':      ['defekt', 'kaputt', 'bastler', 'nicht funktionsfähig', 'defective'],
    'no_display':  ['kein bild', 'kein signal', 'no display', 'no signal'],
    'no_warranty': ['ohne garantie', 'keine garantie', 'no warranty'],
    'local_only':  ['nur abholung', 'kein versand', 'local pickup only'],
    'coil_whine':  ['spulenfiepen', 'coil whine'],
    'for_parts':   ['for parts', 'ersatzteile', 'schlachtware'],
    'damaged':     ['beschädigt', 'kratzer', 'damaged', 'dellen'],
    'gpu_accessory_or_system': [
        'waterblock', 'water blocks', 'water block', 'ek-quantum', 'backplate',
        'wasserkühl', 'wasserkuehl', 'kühler', 'kuehler',
        'notebook', 'gaming pc', 'desktop', 'nuc',
        'nur verpackung', 'ohne gpu', 'empty box', 'box only',
    ],
}


class RiskScorer:
    def score(self, title: str, description: str = '') -> dict:
        text = (title + ' ' + description).lower()
        found_flags = [
            flag
            for flag, keywords in RISK_KEYWORDS.items()
            if any(kw in text for kw in keywords)
        ]

        is_suspicious = len(found_flags) > 0
        risk_level = 'high' if len(found_flags) >= 2 else ('medium' if found_flags else 'low')

        return {
            'risk_flags': found_flags,
            'is_suspicious': is_suspicious,
            'risk_level': risk_level,
        }

 
