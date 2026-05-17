import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CONFIDENCE_THRESHOLD

GPU_MODELS = [
    'RTX 5090', 'RTX 5080', 'RTX 5070 Ti', 'RTX 5070', 'RTX 5060',
    'RTX 4090', 'RTX 4080 Super', 'RTX 4080', 'RTX 4070 Ti Super', 'RTX 4070 Ti',
    'RTX 4070 Super', 'RTX 4070', 'RTX 4060 Ti', 'RTX 4060',
    'RX 7900 XTX', 'RX 7900 XT', 'RX 7800 XT', 'RX 7700 XT', 'RX 7600',
    'Arc B580', 'Arc B570', 'Arc A770', 'Arc A750',
]

CPU_MODELS = [
    'Ryzen 9 9950X', 'Ryzen 9 9900X', 'Ryzen 7 9700X', 'Ryzen 5 9600X',
    'Ryzen 5 7600X', 'Ryzen 5 7600',
    'Core i9-14900K', 'Core i9-14900', 'Core i7-14700K', 'Core i5-14600K',
    'Core i5-13600K', 'Core i9-13900K',
]

MODEL_LISTS = {
    'gpu': GPU_MODELS,
    'cpu': CPU_MODELS,
}

TYPE_KEYWORDS = {
    'gpu': ['rtx', 'radeon', 'geforce', 'rx ', 'arc b', 'arc a', 'grafikkarte', 'graphics'],
    'cpu': ['ryzen', 'core i', 'intel', 'processor', 'prozessor'],
    'ram': ['ddr4', 'ddr5', 'dimm', 'ram', 'arbeitsspeicher'],
    'psu': ['watt', 'netzteil', 'power supply', 'psu', 'gold', 'platinum'],
}


class Matcher:
    def normalize(self, title: str) -> str:
        t = title.lower()
        t = re.sub(r'[^a-z0-9 ]', ' ', t)
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    def detect_type(self, title: str) -> str | None:
        norm = self.normalize(title)
        for component_type, keywords in TYPE_KEYWORDS.items():
            if any(kw in norm for kw in keywords):
                return component_type
        return None

    def find_model(self, title: str, component_type: str) -> tuple[str, float]:
        models = MODEL_LISTS.get(component_type, [])
        norm = self.normalize(title)
        for model in models:
            model_norm = self.normalize(model)
            if model_norm in norm:
                # Longer model names are more specific → higher base confidence
                specificity = min(len(model_norm) / 20.0, 1.0)
                # Shorter titles tend to be more focused listings
                brevity = max(0.0, 1.0 - len(norm) / 200.0)
                confidence = round(0.6 + 0.3 * specificity + 0.1 * brevity, 3)
                confidence = min(confidence, 1.0)
                return model, confidence
        return None, 0.0

    def match(self, title: str, db) -> dict:
        component_type = self.detect_type(title)
        if not component_type:
            return {'matched': False, 'reason': 'unknown_type'}

        model, confidence = self.find_model(title, component_type)
        if not model:
            return {'matched': False, 'reason': 'no_model_found'}

        component = db.get_component_id(component_type, model)
        if not component:
            return {'matched': False, 'reason': 'not_in_db'}

        return {
            'matched': confidence >= CONFIDENCE_THRESHOLD,
            'component_type': component_type,
            'component_id': component['id'],
            'model': model,
            'confidence': confidence,
        }

 