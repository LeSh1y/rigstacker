const request = require('supertest');
const app = require('../../src/app');
const db  = require('../../src/config/db');

afterAll(() => db.destroy());

describe('GET /api/gpus', () => {
  it('returns success with array of GPUs', async () => {
    const res = await request(app).get('/api/gpus');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('each GPU has required fields', async () => {
    const res = await request(app).get('/api/gpus');
    const gpu = res.body.data[0];
    expect(gpu).toHaveProperty('id');
    expect(gpu).toHaveProperty('name');
    expect(gpu).toHaveProperty('vram_gb');
    expect(gpu).toHaveProperty('tdp');
    expect(gpu).toHaveProperty('price_eur');
    expect(gpu).toHaveProperty('brand_name');
  });

  it('filters by maxPrice', async () => {
    const res = await request(app).get('/api/gpus?maxPrice=300');
    expect(res.status).toBe(200);
    res.body.data.forEach((gpu) => {
      expect(parseFloat(gpu.price_eur)).toBeLessThanOrEqual(300);
    });
  });

  it('filters by brand', async () => {
    const res = await request(app).get('/api/gpus?brand=Nvidia');
    expect(res.status).toBe(200);
    res.body.data.forEach((gpu) => {
      expect(gpu.brand_name).toContain('Nvidia');
    });
  });

  it('filters by minVram', async () => {
    const res = await request(app).get('/api/gpus?minVram=16');
    expect(res.status).toBe(200);
    res.body.data.forEach((gpu) => {
      expect(gpu.vram_gb).toBeGreaterThanOrEqual(16);
    });
  });

  it('returns 400 for invalid maxPrice', async () => {
    const res = await request(app).get('/api/gpus?maxPrice=notanumber');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('returns empty array when no GPUs match filters', async () => {
    const res = await request(app).get('/api/gpus?maxPrice=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/gpus/:id', () => {
  it('returns a single GPU by id', async () => {
    const res = await request(app).get('/api/gpus/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id', 1);
  });

  it('returns 404 for non-existent GPU', async () => {
    const res = await request(app).get('/api/gpus/99999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});