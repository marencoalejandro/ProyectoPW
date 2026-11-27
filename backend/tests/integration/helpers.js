// Utilidades para las pruebas de integración. Usan una base PostgreSQL real
// (DB_NAME_TEST del .env), que se BORRA y se recrea con esquema, migraciones
// y datos de demo al comienzo de cada archivo de prueba.
process.env.NODE_ENV = 'test';

const { env } = await import('../../src/config/env.js');
const { dropDatabase, ensureDatabase, migrate, runSqlFile } = await import('../../scripts/lib/migrator.js');
const { createApp } = await import('../../src/app.js');
const { pool } = await import('../../src/db/pool.js');
const { default: request } = await import('supertest');

export { pool, env };
export const PREFIX = env.apiPrefix;
export const PASSWORD = 'Admin1234'; // contraseña de los usuarios de database/seeds.sql

const silent = () => {};

export async function resetDatabase() {
  if (!/test/i.test(env.db.database)) {
    throw new Error(`Por seguridad, DB_NAME_TEST debe contener "test" (actual: ${env.db.database}).`);
  }
  await dropDatabase(env.db, silent);
  await ensureDatabase(env.db, silent);
  await migrate(env.db, { log: silent });
  await runSqlFile(env.db, 'reset.sql', silent);
  await runSqlFile(env.db, 'seeds.sql', silent);
}

let app;
export function getApp() {
  app ??= createApp();
  return app;
}

/** Cliente HTTP con cookies propias (como un navegador) y token CSRF. */
export async function newBrowser() {
  const agent = request.agent(getApp());
  const { body } = await agent.get(`${PREFIX}/auth/csrf`).expect(200);
  const csrf = body.csrfToken;
  const url = (path) => `${PREFIX}${path}`;
  return {
    agent,
    csrf,
    get: (path) => agent.get(url(path)),
    post: (path, data = {}) => agent.post(url(path)).set('X-CSRF-Token', csrf).send(data),
    put: (path, data = {}) => agent.put(url(path)).set('X-CSRF-Token', csrf).send(data),
  };
}

export async function loginAs(email, password = PASSWORD) {
  const browser = await newBrowser();
  const res = await browser.post('/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login de ${email} falló: ${res.status} ${JSON.stringify(res.body)}`);
  browser.user = res.body.user;
  return browser;
}

export async function query(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function stock(sucursalId, insumoNombre) {
  const [row] = await query(
    `SELECT inv.stock_actual FROM inventario_sucursal inv JOIN insumos i ON i.id = inv.insumo_id
     WHERE inv.sucursal_id = $1 AND i.nombre = $2`,
    [sucursalId, insumoNombre],
  );
  return Number(row.stock_actual);
}

export async function idPlatillo(nombre) {
  const [row] = await query('SELECT id FROM platillos WHERE nombre = $1', [nombre]);
  return row.id;
}

export async function closePool() {
  await pool.end();
}
