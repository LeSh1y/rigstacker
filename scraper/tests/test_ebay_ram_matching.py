import unittest

from sources.ebay_matching import match_ebay_offer_to_component


TARGET_32_DDR5_6000 = {
    'name': 'Corsair Vengeance DDR5-6000 32GB',
    'ram_type': 'DDR5',
    'capacity_gb': 32,
    'speed_mhz': 6000,
}

TARGET_16_DDR5_6000 = {
    'name': 'Corsair Vengeance DDR5-6000 16GB',
    'ram_type': 'DDR5',
    'capacity_gb': 16,
    'speed_mhz': 6000,
}

TARGET_32_DDR4_3600 = {
    'name': 'Corsair Vengeance DDR4-3600 32GB',
    'ram_type': 'DDR4',
    'capacity_gb': 32,
    'speed_mhz': 3600,
}


class EbayRamMatchingTest(unittest.TestCase):
    def assert_ram_match(self, component, title, matched, reason):
        result = match_ebay_offer_to_component(title, 'ram', component)
        self.assertEqual(result.matched, matched)
        self.assertEqual(result.reason, reason)

    def test_target_32gb_rejects_64gb_2x32gb(self):
        self.assert_ram_match(
            TARGET_32_DDR5_6000,
            'Corsair Vengeance RGB 64GB Kit (2x32GB) DDR5-6000',
            False,
            'rejected_wrong_capacity',
        )

    def test_target_16gb_rejects_32gb_2x16gb(self):
        self.assert_ram_match(
            TARGET_16_DDR5_6000,
            'Corsair Vengeance RGB DDR5 RAM-Kit 32GB (2x16GB) 6000',
            False,
            'rejected_wrong_capacity',
        )

    def test_target_32gb_accepts_32gb_2x16gb(self):
        self.assert_ram_match(
            TARGET_32_DDR5_6000,
            'Corsair Vengeance RGB DDR5 RAM-Kit 32GB (2x16GB) 6000',
            True,
            'accepted_exact_match',
        )

    def test_target_32gb_accepts_4x8gb(self):
        self.assert_ram_match(
            TARGET_32_DDR5_6000,
            'Corsair Vengeance DDR5 4x8GB 6000 RAM',
            True,
            'accepted_exact_match',
        )

    def test_target_ddr5_rejects_ddr4(self):
        self.assert_ram_match(
            TARGET_32_DDR5_6000,
            'Corsair Vengeance DDR4 32GB 6000 RAM',
            False,
            'rejected_wrong_generation',
        )

    def test_target_ddr4_rejects_ddr5(self):
        self.assert_ram_match(
            TARGET_32_DDR4_3600,
            'Corsair Vengeance DDR5 32GB 3600 RAM',
            False,
            'rejected_wrong_generation',
        )

    def test_target_6000_rejects_5600(self):
        self.assert_ram_match(
            TARGET_32_DDR5_6000,
            'Corsair Vengeance DDR5 32GB 5600 RAM',
            False,
            'rejected_wrong_model',
        )

    def test_target_3600_rejects_2666(self):
        self.assert_ram_match(
            TARGET_32_DDR4_3600,
            'Corsair Vengeance DDR4 32GB 2666 RAM',
            False,
            'rejected_wrong_model',
        )


if __name__ == '__main__':
    unittest.main()
