import { pool } from '../../db/pool.js';

const TURNO_COLUMNS = `
  t.id, t.sucursal_id AS "sucursalId", s.nombre AS sucursal,
  t.usuario_id AS "usuarioId", u.nombre AS cajero,
  t.monto_inicial AS "montoInicial", t.estado,
  t.abierto_en AS "abiertoEn", t.cerrado_en AS "cerradoEn",
  t.efectivo_contado AS "efectivoContado",
  t.tarjeta_reportada AS "tarjetaReportada",
  t.bitcoin_reportado AS "bitcoinReportado"`;

const TURNO_FROM = `
  FROM turnos_caja t
  JOIN sucursales s ON s.id = t.sucursal_id
  JOIN usuarios u ON u.id = t.usuario_id`;

export async function findSucursalActiva(sucursalId) {
  const { rows } = await pool.query('SELECT id FROM sucursales WHERE id = $1 AND activa', [sucursalId]);
  return rows[0] ?? null;
}

export async function insertTurno({ sucursalId, usuarioId, montoInicial }) {
  const { rows } = await pool.query(
    `INSERT INTO turnos_caja (sucursal_id, usuario_id, monto_inicial)
     VALUES ($1, $2, $3) RETURNING id`,
    [sucursalId, usuarioId, montoInicial],
  );
  return rows[0].id;
}

export async function findTurno(id, db = pool) {
  const { rows } = await db.query(`SELECT ${TURNO_COLUMNS} ${TURNO_FROM} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findTurnoAbierto(usuarioId, sucursalId) {
  const { rows } = await pool.query(
    `SELECT ${TURNO_COLUMNS} ${TURNO_FROM}
     WHERE t.usuario_id = $1 AND t.sucursal_id = $2 AND t.estado = 'ABIERTO'`,
    [usuarioId, sucursalId],
  );
  return rows[0] ?? null;
}

export async function listTurnos({ sucursalId, estado, desde, hasta, limit }) {
  const { rows } = await pool.query(
    `SELECT ${TURNO_COLUMNS} ${TURNO_FROM}
     WHERE ($1::int IS NULL OR t.sucursal_id = $1)
       AND ($2::text IS NULL OR t.estado = $2)
       AND ($3::date IS NULL OR t.abierto_en >= $3::date)
       AND ($4::date IS NULL OR t.abierto_en < $4::date + 1)
     ORDER BY t.abierto_en DESC
     LIMIT $5`,
    [sucursalId, estado ?? null, desde ?? null, hasta ?? null, limit],
  );
  return rows;
}

/**
 * Bloquea el turno. Ventas y cierre bloquean la misma fila, así un cobro
 * concurrente queda dentro del turno o se rechaza por turno cerrado.
 */
export async function lockTurno(client, id) {
  const { rows } = await client.query(
    `SELECT id, sucursal_id AS "sucursalId", usuario_id AS "usuarioId",
            monto_inicial AS "montoInicial", estado
     FROM turnos_caja WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Ventas vigentes del turno por método de pago (montos en texto). Las
 * anuladas no cuentan para el arqueo; se informan aparte en ANULADAS.
 */
export async function totalesPorMetodo(id, db = pool) {
  const { rows } = await db.query(
    `SELECT m.metodo, COALESCE(sum(v.total), 0)::numeric(12,2) AS total, count(v.id)::int AS ventas
     FROM unnest(ARRAY['EFECTIVO', 'TARJETA', 'BITCOIN']) AS m(metodo)
     LEFT JOIN ventas v ON v.metodo_pago = m.metodo AND v.turno_id = $1 AND v.anulada_en IS NULL
     GROUP BY m.metodo
     UNION ALL
     SELECT 'ANULADAS', COALESCE(sum(total), 0)::numeric(12,2), count(*)::int
     FROM ventas WHERE turno_id = $1 AND anulada_en IS NOT NULL`,
    [id],
  );
  return Object.fromEntries(rows.map((r) => [r.metodo, { total: r.total, ventas: r.ventas }]));
}

export async function cerrarTurno(client, id, { efectivoContado, tarjetaReportada, bitcoinReportado }) {
  await client.query(
    `UPDATE turnos_caja
     SET estado = 'CERRADO', cerrado_en = CURRENT_TIMESTAMP,
         efectivo_contado = $2, tarjeta_reportada = $3, bitcoin_reportado = $4
     WHERE id = $1`,
    [id, efectivoContado, tarjetaReportada, bitcoinReportado],
  );
}
