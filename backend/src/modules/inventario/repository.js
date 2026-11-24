import { pool } from '../../db/pool.js';

// ---------- Platillos ----------

const PLATILLO_COLUMNS = `
  p.id, p.nombre, p.categoria, p.precio, p.tipo, p.activo, p.imagen`;

/**
 * Catálogo con disponibilidad local: cuántas unidades alcanzan con el stock
 * de la sucursal (mínimo de stock / cantidad entre los insumos de la receta).
 * Con sucursalId null no se calcula la disponibilidad.
 */
export async function listPlatillos({ sucursalId, incluirInactivos, categoria }) {
  const { rows } = await pool.query(
    `SELECT ${PLATILLO_COLUMNS},
            CASE WHEN $1::int IS NULL THEN NULL ELSE disp.unidades END AS disponibles
     FROM platillos p
     LEFT JOIN LATERAL (
       SELECT CASE WHEN count(r.insumo_id) = 0 THEN 0
                   ELSE min(floor(COALESCE(inv.stock_actual, 0) / r.cantidad))::int END AS unidades
       FROM recetas r
       LEFT JOIN inventario_sucursal inv
              ON inv.insumo_id = r.insumo_id AND inv.sucursal_id = $1
       WHERE r.platillo_id = p.id
     ) disp ON true
     WHERE ($2::boolean OR p.activo)
       AND ($3::text IS NULL OR p.categoria = $3)
     ORDER BY p.categoria, p.nombre`,
    [sucursalId, incluirInactivos, categoria ?? null],
  );
  return rows;
}

export async function findPlatillo(id, db = pool) {
  const { rows } = await db.query(`SELECT ${PLATILLO_COLUMNS} FROM platillos p WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getReceta(platilloId, db = pool) {
  const { rows } = await db.query(
    `SELECT r.insumo_id AS "insumoId", i.nombre, i.unidad, r.cantidad
     FROM recetas r JOIN insumos i ON i.id = r.insumo_id
     WHERE r.platillo_id = $1 ORDER BY i.nombre`,
    [platilloId],
  );
  return rows;
}

export async function insertPlatillo(client, p) {
  const { rows } = await client.query(
    `INSERT INTO platillos (nombre, categoria, precio, tipo, activo, imagen)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [p.nombre, p.categoria ?? null, p.precio, p.tipo, p.activo ?? true, p.imagen ?? null],
  );
  return rows[0].id;
}

const PLATILLO_WRITABLE = ['nombre', 'categoria', 'precio', 'tipo', 'activo', 'imagen'];

export async function updatePlatillo(client, id, data) {
  const keys = Object.keys(data).filter((k) => PLATILLO_WRITABLE.includes(k));
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rowCount } = await client.query(
    `UPDATE platillos SET ${sets.join(', ')} WHERE id = $1`,
    [id, ...keys.map((k) => data[k])],
  );
  return rowCount > 0;
}

export async function lockPlatillo(client, id) {
  const { rows } = await client.query('SELECT id, tipo FROM platillos WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ?? null;
}

export async function replaceReceta(client, platilloId, items) {
  await client.query('DELETE FROM recetas WHERE platillo_id = $1', [platilloId]);
  await client.query(
    `INSERT INTO recetas (platillo_id, insumo_id, cantidad)
     SELECT $1, x.insumo_id, x.cantidad
     FROM unnest($2::int[], $3::numeric[]) AS x(insumo_id, cantidad)`,
    [platilloId, items.map((i) => i.insumoId), items.map((i) => i.cantidad)],
  );
}

// ---------- Insumos ----------

export async function listInsumos({ incluirInactivos }) {
  const { rows } = await pool.query(
    `SELECT id, nombre, unidad, activo FROM insumos
     WHERE ($1::boolean OR activo) ORDER BY nombre`,
    [incluirInactivos],
  );
  return rows;
}

export async function findInsumosByIds(ids, db = pool) {
  const { rows } = await db.query(
    'SELECT id, nombre, unidad, activo FROM insumos WHERE id = ANY($1::int[])',
    [ids],
  );
  return rows;
}

export async function insertInsumo(client, { nombre, unidad }) {
  const { rows } = await client.query(
    'INSERT INTO insumos (nombre, unidad) VALUES ($1, $2) RETURNING id, nombre, unidad, activo',
    [nombre, unidad],
  );
  return rows[0];
}

/** Crea la fila de stock del insumo nuevo en todas las sucursales. */
export async function createStockRows(client, insumoId, stockMinimo) {
  await client.query(
    `INSERT INTO inventario_sucursal (sucursal_id, insumo_id, stock_actual, stock_minimo)
     SELECT s.id, $1, 0, $2 FROM sucursales s
     ON CONFLICT (sucursal_id, insumo_id) DO NOTHING`,
    [insumoId, stockMinimo],
  );
}

export async function updateInsumo(id, data) {
  const keys = Object.keys(data).filter((k) => ['nombre', 'activo'].includes(k));
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await pool.query(
    `UPDATE insumos SET ${sets.join(', ')} WHERE id = $1 RETURNING id, nombre, unidad, activo`,
    [id, ...keys.map((k) => data[k])],
  );
  return rows[0] ?? null;
}

// ---------- Stock por sucursal ----------

const STOCK_SELECT = `
  SELECT inv.sucursal_id AS "sucursalId", s.nombre AS "sucursal",
         inv.insumo_id AS "insumoId", i.nombre AS insumo, i.unidad,
         inv.stock_actual AS "stockActual", inv.stock_minimo AS "stockMinimo",
         (inv.stock_actual <= inv.stock_minimo) AS alerta,
         (inv.stock_actual = 0) AS agotado
  FROM inventario_sucursal inv
  JOIN insumos i ON i.id = inv.insumo_id
  JOIN sucursales s ON s.id = inv.sucursal_id`;

/** estado: 'alertas' (stock ≤ mínimo), 'agotados' (stock 0) o undefined (todos). */
export async function listStock({ sucursalId, estado }) {
  const { rows } = await pool.query(
    `${STOCK_SELECT}
     WHERE i.activo
       AND ($1::int IS NULL OR inv.sucursal_id = $1)
       AND ($2::text IS NULL
            OR ($2 = 'alertas' AND inv.stock_actual <= inv.stock_minimo)
            OR ($2 = 'agotados' AND inv.stock_actual = 0))
     ORDER BY inv.sucursal_id, i.nombre`,
    [sucursalId, estado ?? null],
  );
  return rows;
}

/** Alertas de los insumos indicados en una sucursal (tras vender o comprar). */
export async function alertasDe(db, sucursalId, insumoIds) {
  const { rows } = await db.query(
    `${STOCK_SELECT}
     WHERE inv.sucursal_id = $1 AND inv.insumo_id = ANY($2::int[])
       AND inv.stock_actual <= inv.stock_minimo
     ORDER BY i.nombre`,
    [sucursalId, insumoIds],
  );
  return rows;
}

export async function updateStockMinimo(sucursalId, insumoId, stockMinimo) {
  const { rows } = await pool.query(
    `UPDATE inventario_sucursal SET stock_minimo = $3
     WHERE sucursal_id = $1 AND insumo_id = $2
     RETURNING sucursal_id AS "sucursalId", insumo_id AS "insumoId",
               stock_actual AS "stockActual", stock_minimo AS "stockMinimo",
               (stock_actual <= stock_minimo) AS alerta`,
    [sucursalId, insumoId, stockMinimo],
  );
  return rows[0] ?? null;
}

// ---------- Movimientos (kardex) ----------

/**
 * Registra movimientos de un mismo origen.
 * filas: [{ insumoId, cantidad (con signo), stockResultante }]
 */
export async function registrarMovimientos(client, { sucursalId, tipo, usuarioId, ventaId, compraId, motivo, nota }, filas) {
  if (!filas.length) return;
  await client.query(
    `INSERT INTO movimientos_inventario
       (sucursal_id, insumo_id, tipo, motivo, cantidad, stock_resultante, nota, venta_id, compra_id, usuario_id)
     SELECT $1, f.insumo_id, $2, $3, f.cantidad, f.stock, $4, $5, $6, $7
     FROM unnest($8::int[], $9::numeric[], $10::numeric[]) AS f(insumo_id, cantidad, stock)`,
    [
      sucursalId, tipo, motivo ?? null, nota ?? null, ventaId ?? null, compraId ?? null, usuarioId,
      filas.map((f) => f.insumoId), filas.map((f) => f.cantidad), filas.map((f) => f.stockResultante),
    ],
  );
}

export async function lockStockRow(client, sucursalId, insumoId) {
  const { rows } = await client.query(
    `SELECT inv.stock_actual AS "stockActual", i.nombre, i.unidad, i.activo
     FROM inventario_sucursal inv JOIN insumos i ON i.id = inv.insumo_id
     WHERE inv.sucursal_id = $1 AND inv.insumo_id = $2
     FOR UPDATE OF inv`,
    [sucursalId, insumoId],
  );
  return rows[0] ?? null;
}

/** Suma `cantidad` (con signo) al stock y devuelve la fila resultante. */
export async function aplicarCantidad(client, sucursalId, insumoId, cantidad) {
  const { rows } = await client.query(
    `UPDATE inventario_sucursal SET stock_actual = stock_actual + $3::numeric
     WHERE sucursal_id = $1 AND insumo_id = $2
     RETURNING insumo_id AS "insumoId", $3::numeric AS cantidad,
               stock_actual AS "stockResultante", stock_minimo AS "stockMinimo",
               (stock_actual <= stock_minimo) AS alerta`,
    [sucursalId, insumoId, cantidad],
  );
  return rows[0];
}

/** Diferencia exacta (NUMERIC) entre un conteo físico y el stock actual. */
export async function diferencia(client, contado, actual) {
  const { rows } = await client.query('SELECT ($1::numeric - $2::numeric) AS d', [contado, actual]);
  return rows[0].d;
}

export async function listMovimientos({ sucursalId, insumoId, tipo, desde, hasta, limit }) {
  const { rows } = await pool.query(
    `SELECT m.id, m.sucursal_id AS "sucursalId", s.nombre AS sucursal,
            m.insumo_id AS "insumoId", i.nombre AS insumo, i.unidad,
            m.tipo, m.motivo, m.cantidad, m.stock_resultante AS "stockResultante", m.nota,
            m.venta_id AS "ventaId", m.compra_id AS "compraId",
            m.usuario_id AS "usuarioId", u.nombre AS usuario, m.creado_en AS "creadoEn"
     FROM movimientos_inventario m
     JOIN insumos i ON i.id = m.insumo_id
     JOIN sucursales s ON s.id = m.sucursal_id
     JOIN usuarios u ON u.id = m.usuario_id
     WHERE ($1::int IS NULL OR m.sucursal_id = $1)
       AND ($2::int IS NULL OR m.insumo_id = $2)
       AND ($3::text IS NULL OR m.tipo = $3)
       AND ($4::date IS NULL OR m.creado_en >= $4::date)
       AND ($5::date IS NULL OR m.creado_en < $5::date + 1)
     ORDER BY m.creado_en DESC, m.id DESC
     LIMIT $6`,
    [sucursalId, insumoId ?? null, tipo ?? null, desde ?? null, hasta ?? null, limit],
  );
  return rows;
}
