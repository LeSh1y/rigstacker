const db = require('../config/db');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

function searchTable(table, q, limit = 5) {
  return db(table)
    .join('brands', `${table}.brand_id`, 'brands.id')
    .select(`${table}.id`, `${table}.name`, `${table}.price_eur`, 'brands.name as brand_name')
    .where(`${table}.is_available`, true)
    .where(`${table}.name`, 'like', `%${q}%`)
    .limit(limit)
    .orderBy(`${table}.price_eur`, 'asc')
    .timeout(5000);
}

const TYPE_TO_RESULT = {
  gpu: ['gpus', 'gpus'],
  cpu: ['cpus', 'cpus'],
  mobo: ['mainboards', 'mainboards'],
  motherboard: ['mainboards', 'mainboards'],
  mainboard: ['mainboards', 'mainboards'],
  ram: ['ram_kits', 'ram'],
  psu: ['psus', 'psus'],
  case: ['cases', 'cases'],
  cases: ['cases', 'cases'],
  cooler: ['coolers', 'coolers'],
  storage: ['storage', 'storage'],
  ssd: ['storage', 'storage'],
};

const search = asyncHandler(async (req, res) => {
  const { q, type } = req.query;

  let rows;
  try {
    if (type && TYPE_TO_RESULT[type]) {
      const [table, key] = TYPE_TO_RESULT[type];
      const found = await searchTable(table, q, 8);
      const results = { gpus: [], cpus: [], mainboards: [], ram: [], psus: [], cases: [], coolers: [], storage: [] };
      results[key] = found;
      return apiResponse.success(res, { query: q, type, total: found.length, results });
    }

    rows = await Promise.all([
      searchTable('gpus', q),
      searchTable('cpus', q),
      searchTable('mainboards', q),
      searchTable('ram_kits', q),
      searchTable('psus', q),
      searchTable('cases', q),
      searchTable('coolers', q),
      searchTable('storage', q),
    ]);
  } catch (err) {
    const message = String(err?.message || err || 'Search failed');
    const isTimeout = /timeout|timedout|etimedout|econnrefused|pool/i.test(message);
    return apiResponse.error(
      res,
      isTimeout ? 'Search service temporarily unavailable' : 'Search failed',
      isTimeout ? 503 : 500,
    );
  }

  const [gpus, cpus, mainboards, ram, psus, cases, coolers, storage] = rows;

  const results = { gpus, cpus, mainboards, ram, psus, cases, coolers, storage };
  const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  return apiResponse.success(res, { query: q, total, results });
});

module.exports = { search };
