const picker = require('../../../src/services/configurator/component.picker');

describe('component.picker best-value used categories', () => {
  const component = {
    price_eur: 120,
    recommended_new_price: 100,
    recommended_used_price: 70,
    recommended_used_discount: 0.3,
  };

  it.each([
    ['ram'],
    ['mainboard'],
    ['motherboard'],
    ['case'],
    ['cooler'],
  ])('best value can use used %s', (componentType) => {
    expect(picker.effectivePrice(component, componentType, 'best_value')).toBe(70);
  });

  it('best value does not use used PSU', () => {
    expect(picker.effectivePrice(component, 'psu', 'best_value')).toBe(100);
  });

  it('best value does not use used storage', () => {
    expect(picker.effectivePrice(component, 'storage', 'best_value')).toBe(100);
  });
});
