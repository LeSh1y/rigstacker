const mockFirstByTable = {};
const mockRowsByTable = {};

function mockCreateQuery(table) {
  return {
    table,
    where() { return this; },
    orWhereNull() { return this; },
    whereIn() { return this; },
    whereNotNull() { return this; },
    whereBetween() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    async first() {
      const value = mockFirstByTable[table];
      return typeof value === 'function' ? value() : value;
    },
    then(resolve, reject) {
      return Promise.resolve(mockRowsByTable[table] ?? []).then(resolve, reject);
    },
  };
}

jest.mock('../../../src/config/db', () => jest.fn((table) => mockCreateQuery(table)));

const OfferModel = require('../../../src/models/offer.model');

describe('OfferModel best-value lifecycle safety', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFirstByTable)) delete mockFirstByTable[key];
    for (const key of Object.keys(mockRowsByTable)) delete mockRowsByTable[key];
  });

  it('ignores inactive used linked offer and falls back to new recommendation', async () => {
    mockFirstByTable.ram_kits = {
      id: 1,
      name: 'Corsair Vengeance DDR5-6000 32GB',
      price_eur: 120,
      recommended_new_price: 100,
      recommended_new_source: 'geizhals',
      recommended_used_price: 70,
      recommended_used_source: 'ebay',
      recommended_used_offer_id: 55,
      recommended_used_external_id: 'used-55',
      recommended_used_discount: 0.3,
    };
    mockFirstByTable.offers = {
      id: 55,
      source: 'ebay',
      condition: 'used',
      price_eur: 70,
      total_price: 70,
      url: 'https://ebay.de/itm/used-55',
      title: 'Corsair Vengeance DDR5 32GB 6000 RAM',
      is_active: 0,
      is_suspicious: 0,
    };
    mockRowsByTable.offers = [];

    const result = await OfferModel.getRecommendation('ram', 1, 'best_value');

    expect(result.recommended_condition).toBe('new');
    expect(result.recommended_price).toBe(120);
    expect(result.recommended_source).toBe('fallback');
  });
});
