const db = require('../config/db');

const PSU_ACCESSORY_RE = /\b(kabel|cable|kabelersatz|stromkabel|adapter|replacement|austausch|connector|verlängerung|verlaengerung|extension|sata-laufwerkskabel|pci-e\s*cable|8pin|8-pin|6pin|6-pin|24pin|24-pin)\b/i;
const PSU_REAL_PRODUCT_RE = /\b(netzteil|psu|power\s+supply|atx|80\+|gold|platinum|watt|\d{3,4}\s*w)\b/i;
const PSU_MODEL_TOKEN_RE = /\b[A-Z]{1,12}\d{3,4}[A-Z]{0,4}\b/gi;
const GPU_BAD_OFFER_RE = /(water\s*blocks?|waterblock|ek[-\s]?quantum|backplate|wasserk[üu]hl|wasserkuehl|k[üu]hler|kuehler|notebook|gaming\s+pc|desktop|nuc|nur\s+verpackung|ohne\s+gpu|empty\s+box|box\s+only)/i;
const COOLER_CONFLICT_TOKENS = new Set(['SLIM', 'PRO', 'ELITE', 'RGB', 'XT', 'FX']);
const CASE_CONFLICT_TOKENS = new Set(['XL', 'MINI', 'MICRO']);

const TYPE_ALIASES = {
  motherboard: 'mainboard',
  mainboards: 'mainboard',
  mobo: 'mainboard',
  cases: 'case',
  ssd: 'storage',
};

const TABLE_MAP = {
  gpu: 'gpus',
  cpu: 'cpus',
  mainboard: 'mainboards',
  ram: 'ram_kits',
  psu: 'psus',
  case: 'cases',
  cooler: 'coolers',
  storage: 'storage',
};

function normalizeType(componentType) {
  const value = String(componentType || '').trim().toLowerCase();
  return TYPE_ALIASES[value] ?? value;
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function conditionFromOffer(offer, fallback = 'new') {
  return offer?.condition ?? fallback;
}

function normText(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return normText(value).split(/\s+/).filter(Boolean);
}

function containsSequence(haystack, needle) {
  if (needle.length === 0) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) return true;
  }
  return false;
}

function importantModelTokens(value) {
  const drop = new Set(['FRACTAL', 'DESIGN', 'BE', 'QUIET', 'CORSAIR', 'NOCTUA']);
  return tokens(value).filter((token) => !drop.has(token));
}

function versionTokens(values) {
  return new Set(values.filter((token) => /\d/.test(token)));
}

function hasSetDifference(left, right) {
  for (const value of left) {
    if (!right.has(value)) return true;
  }
  return false;
}

function intersection(values, allowed) {
  return new Set(values.filter((value) => allowed.has(value)));
}

function isValidPsuOfferTitle(title, component = {}) {
  const value = String(title ?? '');
  if (PSU_ACCESSORY_RE.test(value)) return false;
  if (!PSU_REAL_PRODUCT_RE.test(value)) return false;

  const tokens = new Set(value.match(PSU_MODEL_TOKEN_RE)?.map((token) => token.toUpperCase()) ?? []);
  if (tokens.size >= 3) return false;

  const wattage = Number(component.wattage);
  if (Number.isFinite(wattage) && wattage > 0) {
    const wattageRe = new RegExp(`(?<!\\d)${wattage}\\s*w?\\b`, 'i');
    if (!wattageRe.test(value)) return false;
  }

  return true;
}

function isValidCaseOrCoolerOfferTitle(title, component = {}, normalizedType) {
  const componentTokens = importantModelTokens(component.name);
  const titleTokens = importantModelTokens(title);
  if (componentTokens.length === 0 || titleTokens.length === 0) return false;
  if (!containsSequence(titleTokens, componentTokens)) return false;

  const componentVersions = versionTokens(componentTokens);
  const titleVersions = versionTokens(titleTokens);
  if (hasSetDifference(titleVersions, componentVersions)) return false;

  const conflictTokens = normalizedType === 'cooler' ? COOLER_CONFLICT_TOKENS : CASE_CONFLICT_TOKENS;
  const componentConflicts = intersection(componentTokens, conflictTokens);
  const titleConflicts = intersection(titleTokens, conflictTokens);
  if (hasSetDifference(titleConflicts, componentConflicts)) return false;

  return true;
}

function isBadGpuOfferTitle(title) {
  return GPU_BAD_OFFER_RE.test(String(title ?? ''));
}

function isBadGpuOffer(normalizedType, title) {
  return normalizedType === 'gpu' && isBadGpuOfferTitle(title);
}

function isValidOfficialOfferForComponent(offer, normalizedType, component) {
  if (!offer) return false;
  const price = numberOrNull(offer.price_eur);
  if (price == null || price < 10 || price > 10000) return false;
  if (!offer.url) return false;
  if (offer.condition !== 'new') return false;
  if (!['geizhals', 'mindfactory'].includes(offer.source)) return false;
  if (offer.is_suspicious === true || offer.is_suspicious === 1) return false;
  if (isBadGpuOffer(normalizedType, offer.title)) return false;
  if (normalizedType === 'psu' && !isValidPsuOfferTitle(offer.title, component)) return false;
  if ((normalizedType === 'case' || normalizedType === 'cooler') && !isValidCaseOrCoolerOfferTitle(
    offer.title,
    component,
    normalizedType,
  )) return false;
  return true;
}

function isValidUsedOfferForComponent(offer, normalizedType) {
  if (!offer) return false;
  const price = numberOrNull(offer.price_eur);
  if (price == null || price < 10 || price > 10000) return false;
  if (!offer.url) return false;
  if (offer.source !== 'ebay') return false;
  if (!['used', 'refurbished', 'open_box'].includes(offer.condition)) return false;
  if (offer.is_suspicious === true || offer.is_suspicious === 1) return false;
  if (isBadGpuOffer(normalizedType, offer.title)) return false;
  return true;
}

function serializeOffer(offer, fallbackPrice, fallbackTitle, fallbackSource = 'fallback') {
  if (!offer) return null;
  return {
    price: numberOrNull(offer.price_eur) ?? fallbackPrice,
    url: offer.url ?? null,
    title: offer.title ?? fallbackTitle,
    source: offer.source ?? fallbackSource,
    condition: conditionFromOffer(offer, 'new'),
  };
}

async function findLinkedOffer(normalizedType, componentId, offerId, externalId) {
  if (!offerId && !externalId) return null;

  const query = db('offers').where({
    component_type: normalizedType,
    component_id: componentId,
  });

  if (offerId) {
    query.where('id', offerId);
  } else {
    query.where('external_id', externalId);
  }

  return query.first();
}

async function findBestOfficialNewOffer(normalizedType, componentId, component) {
  const candidates = await db('offers')
    .where({
      component_type: normalizedType,
      component_id: componentId,
      condition: 'new',
      is_active: true,
      is_suspicious: false,
    })
    .whereIn('source', ['geizhals', 'mindfactory'])
    .whereNotNull('url')
    .where('url', '<>', '')
    .whereBetween('price_eur', [10, 10000])
    .orderBy('price_eur', 'asc')
    .limit(50);

  return candidates.find((offer) => isValidOfficialOfferForComponent(offer, normalizedType, component)) ?? null;
}

const OfferModel = {
  async findByComponent(componentType, componentId, filters = {}) {
    const { condition, source, maxPrice, activeOnly = true } = filters;

    let query = db('offers').select('offers.*').where('offers.component_type', componentType).where('offers.component_id', componentId);

    if (activeOnly !== 'false' && activeOnly !== false) {
      query = query.where('offers.is_active', true);
    }
    if (condition) {
      query = query.where('offers.condition', condition);
    }
    if (source) {
      query = query.where('offers.source', source);
    }
    if (maxPrice) {
      query = query.where('offers.price_eur', '<=', maxPrice);
    }

    return query.orderBy('offers.price_eur', 'asc');
  },

  async findPriceHistory(componentType, componentId, filters = {}) {
    const { source, condition, days = 30 } = filters;

    let query = db('price_history')
      .select('price_history.*')
      .where('price_history.component_type', componentType)
      .where('price_history.component_id', componentId)
      .whereRaw('price_history.recorded_at >= NOW() - INTERVAL ? DAY', [Number(days)]);

    if (source) {
      query = query.where('price_history.source', source);
    }
    if (condition) {
      query = query.where('price_history.condition', condition);
    }

    return query.orderBy('price_history.recorded_at', 'desc');
  },

  async getMarketSummary(componentType, componentId) {
    const baseWhere = { component_type: componentType, component_id: componentId, is_active: true, is_suspicious: false };

    const [newMin] = await db('offers')
      .where({ ...baseWhere, condition: 'new' })
      .whereIn('source', ['geizhals', 'mindfactory'])
      .min('price_eur as value');

    const [usedSafeMin] = await db('offers')
      .where({ ...baseWhere, is_overpriced: false })
      .whereIn('condition', ['used', 'refurbished'])
      .min('price_eur as value');

    const allPrices = await db('offers').where(baseWhere).pluck('price_eur');

    let market_median = null;
    if (allPrices.length > 0) {
      const sorted = allPrices.map(Number).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      market_median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    const [{ total }] = await db('offers').where(baseWhere).count('id as total');
    const sources = await db('offers').where(baseWhere).distinct('source').pluck('source');
    const [{ last_updated }] = await db('offers').where(baseWhere).max('last_seen_at as last_updated');

    return {
      new_min_price: newMin.value !== undefined ? newMin.value : null,
      used_safe_min_price: usedSafeMin.value !== undefined ? usedSafeMin.value : null,
      market_median,
      total_offers: Number(total),
      sources,
      last_updated,
    };
  },

  async getRecommendation(componentType, componentId, mode = 'new') {
    const normalizedType = normalizeType(componentType);
    const table = TABLE_MAP[normalizedType];
    if (!table) {
      const err = new Error(`Unknown component type: ${componentType}`);
      err.statusCode = 400;
      throw err;
    }

    const component = await db(table)
      .where({ id: componentId })
      .first();

    if (!component) {
      const err = new Error('Component not found');
      err.statusCode = 404;
      throw err;
    }

    const selectedMode = mode === 'best_value' ? 'best_value' : 'new';
    const usedPrice = numberOrNull(component.recommended_used_price);
    const newPrice = numberOrNull(component.recommended_new_price);
    const fallbackPrice = numberOrNull(component.price_eur ?? component.price);

    if (selectedMode === 'best_value' && usedPrice != null) {
      const usedOffer = await findLinkedOffer(
        normalizedType,
        componentId,
        component.recommended_used_offer_id,
        component.recommended_used_external_id,
      );

      if (isValidUsedOfferForComponent(usedOffer, normalizedType)) {
        return {
          mode: selectedMode,
          recommended_price: usedPrice,
          recommended_condition: conditionFromOffer(usedOffer, 'used'),
          recommended_source: usedOffer?.source ?? component.recommended_used_source ?? 'ebay',
          discount_pct: numberOrNull(component.recommended_used_discount),
          best_offer: serializeOffer(
            usedOffer,
            usedPrice,
            component.name,
            component.recommended_used_source ?? 'ebay',
          ),
        };
      }
    }

    let newOffer = await findLinkedOffer(
      normalizedType,
      componentId,
      component.recommended_new_offer_id,
      component.recommended_new_external_id,
    );
    let effectiveNewPrice = newPrice;
    let effectiveNewSource = component.recommended_new_source;

    if (newOffer && !isValidOfficialOfferForComponent(newOffer, normalizedType, component)) {
      newOffer = null;
      effectiveNewPrice = null;
      effectiveNewSource = null;
    }

    if (effectiveNewPrice == null || !newOffer) {
      const bestOfficial = await findBestOfficialNewOffer(normalizedType, componentId, component);
      if (bestOfficial) {
        newOffer = bestOfficial;
        effectiveNewPrice = numberOrNull(bestOfficial.price_eur);
        effectiveNewSource = bestOfficial.source;
      } else if (!newOffer) {
        effectiveNewPrice = null;
        effectiveNewSource = null;
      }
    }

    if (effectiveNewPrice != null) {
      return {
        mode: selectedMode,
        recommended_price: effectiveNewPrice,
        recommended_condition: 'new',
        recommended_source: newOffer?.source ?? effectiveNewSource ?? 'fallback',
        discount_pct: null,
        best_offer: serializeOffer(newOffer, effectiveNewPrice, component.name, effectiveNewSource ?? 'fallback'),
      };
    }

    if (fallbackPrice != null) {
      const fallbackOffer = {
        price_eur: fallbackPrice,
        url: null,
        title: component.name,
        source: 'fallback',
        condition: 'new',
      };

      return {
        mode: selectedMode,
        recommended_price: fallbackPrice,
        recommended_condition: 'new',
        recommended_source: 'fallback',
        discount_pct: null,
        best_offer: serializeOffer(fallbackOffer, fallbackPrice, component.name, 'fallback'),
      };
    }

    return {
      mode: selectedMode,
      recommended_price: null,
      recommended_condition: 'new',
      recommended_source: 'fallback',
      discount_pct: null,
      best_offer: null,
    };
  },
};

module.exports = OfferModel;
