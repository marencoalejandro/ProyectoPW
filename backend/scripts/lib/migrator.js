import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATABASE_DIR = path.resolve(here, '../../../database');
const MIGRATIONS_DIR = path.join(DATABASE_DIR, 'migrations');

// schema.sql ya contiene estas migraciones históricas. En una base nueva se
// registran sin ejecutarse; en una base previa se comprueba si ya están.
const BASELINE = {
  '20261110_cuadre_medios.sql': `
    SELECT count(*) = 2 AS aplicada FROM pg_attribute
    WHERE attrelid = 'public.turnos_caja'::regclass AND NOT attisdropped
      AND attname IN ('tarjeta_reportada', 'bitcoin_reportado')`,
  // Algunas bases previas tienen la unicidad como índice y no como restricción.
  '20261119_validaciones_compras.sql': `
    SELECT to_regclass('public.compras_proveedor_factura_key') IS NOT NULL AS aplicada`,
};

function clientConfig(db, database) {
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database,
    ssl: db.ssl ? { rejectUnauthorized: true } : false,
    options: `-c timezone=${db.timezone}`,
  };
}

async function connect(db, database, log) {
  const client = new pg.Client(clientConfig(db, database));
  client.on('notice', (notice) => log(`  aviso: ${notice.message}`));
  await client.connect();
  return client;
}

export async function ensureDatabase(db, log = console.log) {
  const admin = await connect(db, 'postgres', log);
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.database]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(db.database)} ENCODING 'UTF8' TEMPLATE template0`);
      log(`Base ${db.database} creada.`);
    }
  } finally {
    await admin.end();
  }
}

export async function dropDatabase(db, log = console.log) {
  const admin = await connect(db, 'postgres', log);
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(db.database)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

async function runInTransaction(client, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// Un archivo que ya trae BEGIN/COMMIT propios se ejecuta tal cual.
const hasOwnTransaction = (sql) => /^\s*BEGIN\s*;/im.test(sql);

async function exists(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Boolean(rows[0]?.existe ?? rows[0]?.aplicada);
}

/**
 * Instala el esquema base si la base está vacía y aplica, en orden y una
 * sola vez, las migraciones pendientes de database/migrations/.
 */
export async function migrate(db, { allowBaseline = true, log = console.log } = {}) {
  const client = await connect(db, db.database, log);
  try {
    const hasTables = await exists(
      client,
      "SELECT to_regclass('public.sucursales') IS NOT NULL AS existe",
    );
    const hasRegistry = await exists(
      client,
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe",
    );

    if (!hasTables) {
      if (!allowBaseline) throw new Error('La base está vacía: usa npm run db:setup.');
      log('Instalando esquema base (database/schema.sql)…');
      const schema = await readFile(path.join(DATABASE_DIR, 'schema.sql'), 'utf8');
      await runInTransaction(client, schema);
    }

    if (!hasRegistry) {
      await client.query(`
        CREATE TABLE schema_migrations (
          nombre VARCHAR(200) PRIMARY KEY,
          aplicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
    }

    // Migraciones históricas que ya estén reflejadas en la base se registran
    // sin ejecutarse (en una base nueva, schema.sql ya las incluye).
    const registradas = new Set(
      (await client.query('SELECT nombre FROM schema_migrations')).rows.map((r) => r.nombre),
    );
    for (const [name, check] of Object.entries(BASELINE)) {
      if (registradas.has(name)) continue;
      if (!hasTables || (await exists(client, check))) {
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [name]);
        log(`  ${name}: ya incluida en la base.`);
      }
    }

    const { rows } = await client.query('SELECT nombre FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.nombre));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const pending = files.filter((file) => !applied.has(file));

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log(`Aplicando ${file}…`);
      if (hasOwnTransaction(sql)) {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [file]);
      } else {
        await runInTransaction(
          client,
          `${sql}\n;INSERT INTO schema_migrations (nombre) VALUES (${client.escapeLiteral(file)});`,
        );
      }
    }
    log(pending.length ? `${pending.length} migración(es) aplicada(s).` : 'Sin migraciones pendientes.');
  } finally {
    await client.end();
  }
}

export async function runSqlFile(db, file, log = console.log) {
  const client = await connect(db, db.database, log);
  try {
    const sql = await readFile(path.join(DATABASE_DIR, file), 'utf8');
    if (hasOwnTransaction(sql)) await client.query(sql);
    else await runInTransaction(client, sql);
  } finally {
    await client.end();
  }
}
