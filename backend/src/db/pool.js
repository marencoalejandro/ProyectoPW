import pg from 'pg';
import { env } from '../config/env.js';

// NUMERIC llega como texto (por defecto en pg). Se conserva así para no
// perder centavos con float; los cálculos de dinero se hacen en SQL o en
// centavos enteros (ver lib/money.js).

// DATE (OID 1082) llega como texto AAAA-MM-DD. Sin esto pg lo convierte en
// Date a medianoche local y JSON lo serializa como "…T06:00:00.000Z".
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Las columnas TIMESTAMP (sin zona) se interpretan en hora de El Salvador.
  options: `-c timezone=${env.db.timezone}`,
});

pool.on('error', (error) => {
  // Error de un cliente inactivo (p. ej. la BD se reinició). No tumba el proceso.
  console.error('[db] Error en un cliente inactivo del pool:', error.message);
});

/**
 * Ejecuta `work(client)` dentro de una transacción con un único cliente.
 * Todos los repositorios de la operación deben recibir ese mismo `client`:
 * una llamada a pool.query quedaría fuera de la transacción.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexión pudo haberse perdido; el error original es el relevante.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkConnection() {
  const { rows } = await pool.query('SELECT current_database() AS db, now() AS ahora');
  return rows[0];
}
