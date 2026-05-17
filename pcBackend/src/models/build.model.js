const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const parse = (v) => {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
};

const parseObject = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const componentName = (item) => item?.name ?? item?.title ?? null;

const buildTitle = (snapshot, record) => {
  const useCase = snapshot?.useCase ?? record?.use_case ?? 'Custom';
  const label = String(useCase).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${label} Build`;
};

const summarizeBuild = (record) => {
  const snapshot = parseObject(record.snapshot);
  if (!snapshot?.sessionId) return null;

  const build = snapshot.build ?? {};
  const motherboard = build.motherboard ?? build.mainboard ?? build.mobo ?? null;

  return {
    id: record.build_id,
    title: snapshot.title ?? buildTitle(snapshot, record),
    useCase: snapshot.useCase ?? record.use_case ?? null,
    pricingMode: snapshot.pricingMode ?? 'new',
    totalPrice: snapshot.totalPrice ?? (record.total_price ? parseFloat(record.total_price) : null),
    budgetTotal: snapshot.budgetTotal ?? null,
    budgetOverflow: snapshot.budgetOverflow ?? null,
    compatible: snapshot.compatible ?? Boolean(record.compatible),
    buildHealthStatus: snapshot.buildHealth?.overallStatus ?? null,
    bottleneckStatus: snapshot.bottleneck?.status ?? snapshot.bottleneck?.verdict ?? null,
    components: {
      cpu: componentName(build.cpu),
      gpu: componentName(build.gpu),
      motherboard: componentName(motherboard),
      ram: componentName(build.ram),
      storage: componentName(build.storage ?? build.ssd),
      psu: componentName(build.psu),
      cooler: componentName(build.cooler),
      case: componentName(build.case ?? build.cases),
    },
    createdAt: record.created_at,
  };
};

 const fetchComponent = (table, id) => {
  if (!id) return Promise.resolve(null);
  return db(table)
    .join('brands', `${table}.brand_id`, 'brands.id')
    .select(`${table}.*`, 'brands.name as brand_name')
    .where(`${table}.id`, id)
    .first();
};

const BuildModel = {
  async listBySession(sessionId) {
    if (!sessionId) return [];

    const records = await db('builds')
      .whereNotNull('snapshot')
      .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.sessionId')) = ?", [sessionId])
      .orderBy('created_at', 'desc');

    return records
      .map(summarizeBuild)
      .filter(Boolean);
  },

  async save(data) {
    const buildId = uuidv4();
    const snapshot = data.build ? {
      id: buildId,
      sessionId: data.sessionId ?? null,
      draftBuildId: data.draftBuildId ?? null,
      build: data.build,
      totalPrice: data.totalPrice ?? null,
      budgetTotal: data.budgetTotal ?? null,
      budgetOverflow: data.budgetOverflow ?? null,
      useCase: data.useCase ?? null,
      pricingMode: data.pricingMode ?? 'new',
      compatible: data.compatible ?? true,
      issues: data.issues ?? [],
      warnings: data.warnings ?? [],
      bottleneck: data.bottleneck ?? null,
      buildHealth: data.buildHealth ?? null,
    } : null;

    const build = data.build ?? {};

    await db('builds').insert({
      build_id:     buildId,
      use_case:     data.useCase      ?? null,
      gpu_id:       data.gpu_id       ?? build.gpu?.id ?? null,
      cpu_id:       data.cpu_id       ?? build.cpu?.id ?? null,
      mainboard_id: data.mainboard_id ?? build.motherboard?.id ?? build.mainboard?.id ?? build.mobo?.id ?? null,
      ram_id:       data.ram_id       ?? build.ram?.id ?? null,
      psu_id:       data.psu_id       ?? build.psu?.id ?? null,
      case_id:      data.case_id      ?? build.case?.id ?? build.cases?.id ?? null,
      cooler_id:    data.cooler_id    ?? build.cooler?.id ?? null,
      storage_id:   data.storage_id   ?? build.storage?.id ?? build.ssd?.id ?? null,
      total_price:  data.totalPrice   ?? null,
      compatible:   data.compatible   ?? false,
      issues:       JSON.stringify(data.issues   ?? []),
      warnings:     JSON.stringify(data.warnings ?? []),
      snapshot:     snapshot ? JSON.stringify(snapshot) : null,
    });

    return buildId;
  },

  async findSessionId(buildId) {
    const record = await db('builds')
      .select('build_id', 'snapshot')
      .where({ build_id: buildId })
      .first();
    if (!record) return null;

    const snapshot = parseObject(record.snapshot);
    return {
      id: record.build_id,
      sessionId: snapshot?.sessionId ?? null,
    };
  },

  async deleteById(buildId) {
    return db('builds')
      .where({ build_id: buildId })
      .del();
  },

  async findExpanded(buildId) {
    const record = await db('builds').where({ build_id: buildId }).first();
    if (!record) return null;

    const snapshot = parseObject(record.snapshot);
    if (snapshot) {
      return {
        id: record.build_id,
        sessionId: snapshot.sessionId ?? null,
        draftBuildId: snapshot.draftBuildId ?? null,
        build: snapshot.build ?? {},
        totalPrice: snapshot.totalPrice ?? null,
        budgetTotal: snapshot.budgetTotal ?? null,
        budgetOverflow: snapshot.budgetOverflow ?? null,
        useCase: snapshot.useCase ?? record.use_case,
        pricingMode: snapshot.pricingMode ?? 'new',
        compatible: snapshot.compatible ?? Boolean(record.compatible),
        issues: snapshot.issues ?? parse(record.issues),
        warnings: snapshot.warnings ?? parse(record.warnings),
        bottleneck: snapshot.bottleneck ?? null,
        buildHealth: snapshot.buildHealth ?? null,
        createdAt: record.created_at,
      };
    }

     const [gpu, cpu, mainboard, ram, psu, pcCase, cooler, storage] = await Promise.all([
      fetchComponent('gpus',       record.gpu_id),
      fetchComponent('cpus',       record.cpu_id),
      fetchComponent('mainboards', record.mainboard_id),
      fetchComponent('ram_kits',   record.ram_id),
      fetchComponent('psus',       record.psu_id),
      fetchComponent('cases',      record.case_id),
      fetchComponent('coolers',    record.cooler_id),
      fetchComponent('storage',    record.storage_id),
    ]);

    return {
      id:         record.build_id,
      useCase:    record.use_case,
      build:      { gpu, cpu, mainboard, ram, psu, case: pcCase, cooler, storage },
      totalPrice: record.total_price ? parseFloat(record.total_price) : null,
      budgetTotal: null,
      budgetOverflow: null,
      pricingMode: 'new',
      compatible: Boolean(record.compatible),
      issues:     parse(record.issues),
      warnings:   parse(record.warnings),
      bottleneck:  null,
      buildHealth: null,
      createdAt:  record.created_at,
    };
  },
};

module.exports = BuildModel;
