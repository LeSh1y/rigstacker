const db = require('../src/config/db');
const env = require('../src/config/env');

async function main() {
  console.log(`[DB test] host=${env.db.host} port=${env.db.port} database=${env.db.name} user=${env.db.user}`);

  try {
    const result = await db.raw('SELECT 1 AS ok').timeout(5000);
    const rows = Array.isArray(result) ? result[0] : result;
    console.log('[DB test] success:', JSON.stringify(rows));
    process.exitCode = 0;
  } catch (err) {
    console.error('[DB test] failure:', err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy().catch(() => {});
  }
}

main();
