import unittest

from sources.analyzers import analyze_used_offers
from sources.parsers.ebay import EbaySource


def offer(component_type, title, price, total_price=None, shipping_price=0, shipping_unknown=False, risk_flags=None):
    return {
        'source': 'ebay',
        'component_type': component_type,
        'component_id': 1,
        'title': title,
        'condition': 'used',
        'price_eur': price,
        'shipping_price': shipping_price,
        'total_price': total_price if total_price is not None else price + (shipping_price or 0),
        'shipping_unknown': shipping_unknown,
        'url': 'https://ebay.de/itm/test',
        'seller_name': 'seller',
        'seller_rating': 0.98,
        'is_active': 1,
        'is_suspicious': 0,
        'risk_flags': risk_flags or [],
    }


class EbayPricingAndUsedValueTest(unittest.TestCase):
    def test_item_price_plus_shipping_becomes_total_price(self):
        parsed = EbaySource().parse_item({
            'itemId': 'one',
            'title': 'Fractal Design Pop Air',
            'condition': 'USED',
            'price': {'value': '30.00'},
            'shippingOptions': [{'shippingCost': {'value': '35.00'}}],
        })
        self.assertEqual(parsed['price_eur'], 30.0)
        self.assertEqual(parsed['shipping_price'], 35.0)
        self.assertEqual(parsed['total_price'], 65.0)
        self.assertFalse(parsed['shipping_unknown'])

    def test_free_shipping_keeps_total_at_item_price(self):
        parsed = EbaySource().parse_item({
            'itemId': 'two',
            'title': 'Ryzen 5 7600',
            'condition': 'USED',
            'price': {'value': '90.00'},
            'shippingOptions': [{'shippingCost': {'value': '0.00'}}],
        })
        self.assertEqual(parsed['shipping_price'], 0.0)
        self.assertEqual(parsed['total_price'], 90.0)
        self.assertFalse(parsed['shipping_unknown'])

    def test_cpu_saves_10_percent_rejected(self):
        result = analyze_used_offers(
            [offer('cpu', 'AMD Ryzen 5 7600 CPU', 90, total_price=90)],
            'cpu',
            100,
            'Ryzen 5 7600',
        )
        self.assertIsNone(result)

    def test_cpu_saves_15_percent_accepted(self):
        result = analyze_used_offers(
            [offer('cpu', 'AMD Ryzen 5 7600 CPU', 85, total_price=85)],
            'cpu',
            100,
            'Ryzen 5 7600',
        )
        self.assertIsNotNone(result)
        self.assertEqual(result['price'], 85.0)

    def test_gpu_saves_15_percent_rejected(self):
        result = analyze_used_offers(
            [offer('gpu', 'NVIDIA GeForce RTX 4060 Grafikkarte', 340, total_price=340)],
            'gpu',
            400,
            'GeForce RTX 4060',
        )
        self.assertIsNone(result)

    def test_gpu_saves_20_percent_accepted(self):
        result = analyze_used_offers(
            [offer('gpu', 'NVIDIA GeForce RTX 4060 Grafikkarte', 320, total_price=320)],
            'gpu',
            400,
            'GeForce RTX 4060',
        )
        self.assertIsNotNone(result)

    def test_ram_saves_19_percent_rejected(self):
        result = analyze_used_offers(
            [offer('ram', 'Corsair Vengeance DDR5 32GB 6000 RAM', 81, total_price=81)],
            'ram',
            100,
            'Corsair Vengeance DDR5-6000 32GB',
        )
        self.assertIsNone(result)

    def test_ram_saves_20_percent_accepted(self):
        result = analyze_used_offers(
            [offer('ram', 'Corsair Vengeance DDR5 32GB 6000 RAM', 80, total_price=80)],
            'ram',
            100,
            'Corsair Vengeance DDR5-6000 32GB',
        )
        self.assertIsNotNone(result)

    def test_mainboard_saves_20_percent_rejected(self):
        result = analyze_used_offers(
            [offer('mainboard', 'MSI MAG B650 Tomahawk WiFi AM5 Mainboard', 160, total_price=160)],
            'mainboard',
            200,
            'MSI MAG B650 Tomahawk WiFi',
        )
        self.assertIsNone(result)

    def test_mainboard_saves_25_percent_accepted(self):
        result = analyze_used_offers(
            [offer('mainboard', 'MSI MAG B650 Tomahawk WiFi AM5 Mainboard', 150, total_price=150)],
            'mainboard',
            200,
            'MSI MAG B650 Tomahawk WiFi',
        )
        self.assertIsNotNone(result)

    def test_case_shipping_makes_deal_bad(self):
        result = analyze_used_offers(
            [offer('case', 'Fractal Design Pop Air ATX Gehäuse', 30, shipping_price=35, total_price=65)],
            'case',
            80,
            'Fractal Design Pop Air',
        )
        self.assertIsNone(result)

    def test_cooler_accessory_only_rejected(self):
        result = analyze_used_offers(
            [offer('cooler', 'Noctua NH-D15 mounting kit only', 20, total_price=20)],
            'cooler',
            100,
            'Noctua NH-D15',
        )
        self.assertIsNone(result)


if __name__ == '__main__':
    unittest.main()
