from sources.parsers.geizhals import GeizhalsSource


TEST_CASES = [
    ("gpu", "RTX 4070 Ti Super"),
    ("gpu", "RTX 5070 Ti"),
    ("cpu", "Ryzen 7 7800X3D"),
    ("cpu", "Intel Core i7 14700K"),
    ("ram", "Corsair Vengeance 32GB DDR5 6000"),
    ("ram", "Kingston Fury 32GB DDR5 6000"),
    ("motherboard", "MSI B650 Tomahawk WIFI"),
    ("motherboard", "ASUS ROG Strix B650E-F"),
    ("ssd", "Samsung 990 Pro 2TB"),
    ("ssd", "WD Black SN850X 2TB"),
    ("psu", "be quiet Straight Power 12 850W"),
    ("psu", "Corsair RM850x"),
    ("cooler", "Arctic Liquid Freezer III 360"),
    ("cooler", "Noctua NH-D15"),
    ("case", "Fractal Design North"),
    ("case", "Lian Li O11 Dynamic EVO"),
]


def print_offer(offer: dict) -> None:
    price = offer.get("price")
    price_text = f"€{price:.2f}" if price is not None else "NO PRICE"

    name = offer.get("name", "NO NAME")
    url = offer.get("url", "NO URL")

    print(f"  {price_text:>10} | {name[:90]}")
    print(f"             {url}")


def main():
    src = GeizhalsSource()

    total_tests = 0
    passed_tests = 0
    total_offers = 0
    failed = []

    for component_type, query in TEST_CASES:
        total_tests += 1

        print("\n" + "=" * 100)
        print(f"[TEST] {component_type.upper()} | {query}")
        print("=" * 100)

        try:
            offers = src.search_product(
                query=query,
                component_type=component_type,
                follow_series=True,
            )
        except Exception as e:
            print(f"[ERROR] Parser crashed: {e}")
            failed.append((component_type, query, "crashed"))
            continue

        valid_offers = [
            o for o in offers
            if o.get("price") is not None
            and 10 <= o["price"] <= 10000
            and o.get("url")
        ]

        print(f"Offers found: {len(offers)}")
        print(f"Valid offers: {len(valid_offers)}")

        for offer in valid_offers[:5]:
            print_offer(offer)

        if valid_offers:
            passed_tests += 1
            total_offers += len(valid_offers)
        else:
            failed.append((component_type, query, "no valid offers"))

    print("\n" + "#" * 100)
    print("SUMMARY")
    print("#" * 100)
    print(f"Tests passed: {passed_tests}/{total_tests}")
    print(f"Total valid offers: {total_offers}")

    if failed:
        print("\nFailed / empty cases:")
        for component_type, query, reason in failed:
            print(f"  - {component_type} | {query} | {reason}")

    assert passed_tests >= 3, "Too few successful Geizhals parser tests"


if __name__ == "__main__":
    main()