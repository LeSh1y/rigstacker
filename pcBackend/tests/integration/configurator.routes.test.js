const request = require('supertest');
const app = require('../../src/app');
const db  = require('../../src/config/db');

afterAll(() => db.destroy());

describe('POST /api/configurator', () => {

  describe('Scenario 1 — budget only', () => {
    it('returns a complete compatible build for gaming €1500', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 1500, useCase: 'gaming' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data).toHaveProperty('build');
      expect(data).toHaveProperty('totalPrice');
      expect(data).toHaveProperty('compatible');
      expect(data).toHaveProperty('issues');
      expect(data).toHaveProperty('warnings');

      // Gaming build must have CPU and MB at minimum
      expect(data.build.cpu).not.toBeNull();
      expect(data.build.mainboard).not.toBeNull();
      expect(data.build.psu).not.toBeNull();

      // Should be compatible
      expect(data.compatible).toBe(true);
    });

    it('builds for office use case (no GPU)', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 1000, useCase: 'office' });

      expect(res.status).toBe(200);
      expect(res.body.data.build.gpu).toBeNull();
      expect(res.body.data.build.storage).not.toBeNull();
    });

    it('builds for workstation (CPU-heavy)', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 2000, useCase: 'workstation' });

      expect(res.status).toBe(200);
      expect(res.body.data.build.cpu).not.toBeNull();
      expect(res.body.data.build.ram).not.toBeNull();
    });
  });

  describe('Scenario 2 — single anchor', () => {
    it('respects anchored GPU', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 1500, useCase: 'gaming', anchorComponents: { gpu_id: 3 } });

      expect(res.status).toBe(200);
      expect(res.body.data.build.gpu.id).toBe(3); // RTX 5080
      expect(res.body.data.anchoredComponents).toContain('gpu');
      expect(res.body.data.budgetSpentAnchors).toBe(999);
    });

    it('respects anchored CPU and picks compatible MB', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 1500, useCase: 'gaming', anchorComponents: { cpu_id: 3 } });

      expect(res.status).toBe(200);
      expect(res.body.data.build.cpu.id).toBe(3); // Ryzen 9 9900X

      // MB должна поддерживать AM5
      const mb = res.body.data.build.mainboard;
      expect(mb.socket).toBe('AM5');
    });
  });

  describe('Scenario 3 — multiple anchors', () => {
    it('respects GPU + CPU anchors', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({
          budget: 2000,
          useCase: 'gaming',
          anchorComponents: { gpu_id: 2, cpu_id: 1 },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.build.gpu.id).toBe(2);
      expect(res.body.data.build.cpu.id).toBe(1);
      expect(res.body.data.anchoredComponents).toHaveLength(2);
    });
  });

  describe('Validation errors', () => {
    it('returns 400 for missing budget', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ useCase: 'gaming' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid useCase', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 1500, useCase: 'streaming' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for budget below minimum', async () => {
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 50, useCase: 'gaming' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 422 when anchor cost exceeds budget', async () => {
      // RTX 5080 = €999 > budget €500
      const res = await request(app)
        .post('/api/configurator')
        .send({ budget: 500, useCase: 'gaming', anchorComponents: { gpu_id: 3 } });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/exceeds budget/i);
    });
  });
});