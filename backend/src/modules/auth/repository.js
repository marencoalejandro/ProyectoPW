import { pool } from '../../db/pool.js';

// Columnas públicas del usuario: nunca password_hash ni salario_base.
const USER_COLUMNS = `
  u.id, u.nombre, u.email, u.rol, u.cargo,
  u.sucursal_id AS "sucursalId", s.nombre AS "sucursalNombre"`;

export async function findUserForLogin(email) {
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS}, u.password_hash AS "passwordHash", u.activo
     FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id
     WHERE lower(u.email) = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/** Usuario activo dueño de una sesión vigente, o null. */
export async function findActiveSessionUser(userId, sessionId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS}, ses.id AS "sessionId"
     FROM sesiones ses
     JOIN usuarios u ON u.id = ses.usuario_id
     LEFT JOIN sucursales s ON s.id = u.sucursal_id
     WHERE ses.id = $1 AND ses.usuario_id = $2
       AND ses.revocada_en IS NULL AND ses.expira_en > now()
       AND u.activo`,
    [sessionId, userId],
  );
  return rows[0] ?? null;
}

export async function createSession({ id, userId, refreshHash, days }) {
  await pool.query(
    `INSERT INTO sesiones (id, usuario_id, refresh_hash, expira_en)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [id, userId, refreshHash, days],
  );
}

/** Bloquea la sesión del refresh token vigente o del inmediatamente anterior. */
export async function lockSessionByRefreshHash(client, hash) {
  const { rows } = await client.query(
    `SELECT id, usuario_id AS "userId", refresh_hash AS "refreshHash",
            refresh_anterior_hash AS "previousHash",
            (expira_en <= now()) AS vencida,
            (revocada_en IS NOT NULL) AS revocada,
            (renovada_en > now() - interval '30 seconds') AS "renovadaRecien"
     FROM sesiones
     WHERE refresh_hash = $1 OR refresh_anterior_hash = $1
     FOR UPDATE`,
    [hash],
  );
  return rows[0] ?? null;
}

export async function rotateRefresh(client, sessionId, newHash) {
  await client.query(
    `UPDATE sesiones
     SET refresh_anterior_hash = refresh_hash, refresh_hash = $2, renovada_en = now()
     WHERE id = $1`,
    [sessionId, newHash],
  );
}

export async function revokeSession(sessionId, db = pool) {
  await db.query(
    'UPDATE sesiones SET revocada_en = now() WHERE id = $1 AND revocada_en IS NULL',
    [sessionId],
  );
}

export async function revokeSessionByRefreshHash(hash) {
  await pool.query(
    `UPDATE sesiones SET revocada_en = now()
     WHERE (refresh_hash = $1 OR refresh_anterior_hash = $1) AND revocada_en IS NULL`,
    [hash],
  );
}

/** Cierra todas las sesiones de un usuario (baja, cambio de contraseña o rol). */
export async function revokeAllForUser(userId, db = pool) {
  await db.query(
    'UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL',
    [userId],
  );
}
