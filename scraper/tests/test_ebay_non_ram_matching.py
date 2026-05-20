import unittest

from sources.ebay_matching import match_ebay_offer_to_component


TARGET_MAINBOARD = {
    'name': 'MSI MAG B650 Tomahawk WiFi',
    'socket': 'AM5',
}

TARGET_CASE = {
    'name': 'Fractal Design Pop Air',
    'form_factor': 'ATX',
}

TARGET_COOLER = {
    'name': 'Noctua NH-D15',
    'supported_sockets': '["AM5","AM4"]',
}


class EbayNonRamMatchingTest(unittest.TestCase):
    def assert_match(self, component_type, component, title, matched, reason):
        result = match_ebay_offer_to_component(title, component_type, component)
        self.assertEqual(result.matched, matched)
        self.assertEqual(result.reason, reason)

    def test_mainboard_accepts_exact_model_with_socket(self):
        self.assert_match(
            'mainboard',
            TARGET_MAINBOARD,
            'MSI MAG B650 Tomahawk WiFi AM5 Mainboard',
            True,
            'accepted_exact_match',
        )

    def test_mainboard_rejects_wrong_chipset_b760(self):
        self.assert_match(
            'mainboard',
            TARGET_MAINBOARD,
            'MSI MAG B760 Tomahawk WiFi Mainboard',
            False,
            'rejected_wrong_generation',
        )

    def test_mainboard_rejects_wrong_chipset_z790(self):
        self.assert_match(
            'mainboard',
            TARGET_MAINBOARD,
            'MSI MAG Z790 Tomahawk WiFi Mainboard',
            False,
            'rejected_wrong_generation',
        )

    def test_mainboard_rejects_visible_wrong_socket(self):
        self.assert_match(
            'mainboard',
            TARGET_MAINBOARD,
            'MSI MAG B650 Tomahawk WiFi LGA1700 Mainboard',
            False,
            'rejected_wrong_generation',
        )

    def test_mainboard_rejects_accessory_only_io_shield(self):
        self.assert_match(
            'mainboard',
            TARGET_MAINBOARD,
            'MSI B650 Tomahawk I/O shield only',
            False,
            'rejected_accessory_only',
        )

    def test_case_accepts_exact_model(self):
        self.assert_match(
            'case',
            TARGET_CASE,
            'Fractal Design Pop Air ATX Gehäuse',
            True,
            'accepted_exact_match',
        )

    def test_case_rejects_glass_panel_only(self):
        self.assert_match(
            'case',
            TARGET_CASE,
            'Fractal Pop Air glass panel only',
            False,
            'rejected_accessory_only',
        )

    def test_case_rejects_meshify(self):
        self.assert_match('case', TARGET_CASE, 'Fractal Design Meshify 2 Gehäuse', False, 'rejected_wrong_model')

    def test_case_rejects_define(self):
        self.assert_match('case', TARGET_CASE, 'Fractal Design Define 7 Gehäuse', False, 'rejected_wrong_model')

    def test_case_rejects_corsair_4000d(self):
        self.assert_match('case', TARGET_CASE, 'Corsair 4000D Airflow Gehäuse', False, 'rejected_wrong_model')

    def test_cooler_accepts_exact_model_with_socket(self):
        self.assert_match(
            'cooler',
            TARGET_COOLER,
            'Noctua NH-D15 CPU Kühler AM5',
            True,
            'accepted_exact_match',
        )

    def test_cooler_rejects_fan_only(self):
        self.assert_match('cooler', TARGET_COOLER, 'Noctua NH-D15 fan only', False, 'rejected_accessory_only')

    def test_cooler_rejects_mounting_kit_only(self):
        self.assert_match('cooler', TARGET_COOLER, 'Noctua NH-D15 mounting kit only', False, 'rejected_accessory_only')

    def test_cooler_rejects_bracket_only(self):
        self.assert_match('cooler', TARGET_COOLER, 'Noctua NH-D15 bracket only', False, 'rejected_accessory_only')

    def test_cooler_rejects_nh_u12s(self):
        self.assert_match('cooler', TARGET_COOLER, 'Noctua NH-U12S CPU Kühler', False, 'rejected_wrong_model')

    def test_cooler_rejects_pure_rock(self):
        self.assert_match('cooler', TARGET_COOLER, 'be quiet Pure Rock 2 CPU Kühler', False, 'rejected_wrong_model')

    def test_cooler_rejects_peerless_assassin(self):
        self.assert_match('cooler', TARGET_COOLER, 'Thermalright Peerless Assassin 120 SE', False, 'rejected_wrong_model')

    def test_cooler_rejects_visible_incompatible_socket_only_listing(self):
        self.assert_match(
            'cooler',
            TARGET_COOLER,
            'Noctua NH-D15 LGA1700 mounting kit only',
            False,
            'rejected_accessory_only',
        )


if __name__ == '__main__':
    unittest.main()
