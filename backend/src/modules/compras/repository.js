import { pool } from '../../db/pool.js';

// ---------- Proveedores ----------

export async function listProveedores() {
  const { rows } = await pool.query('SELECT id, nombre, nit FROM proveedores ORDER BY nombre');
  return rows;
}

export async function findProveedor(id, db = pool) {
  const { rows } = await db.query('SELECT id, nombre, nit FROM proveedores WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertProveedor({ nombre, nit }) {
  const { rows } = await pool.query(
    'INSERT INTO proveedores (nombre, nit) VALUES ($1, $2) RETURNING id, nombre, nit',
    [nombre, nit ?? null],
  );
  return rows[0];
}

export async function updateProveedor(id, data) {
  const keys = Object.keys(data).filter((k) => ['nombre', 'nit'].includes(k));
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await pool.query(
    `UPDATE proveedores SET ${sets.join(', ')} WHERE id = $1 RETURNING id, nombre, nit`,
    [id, ...keys.map((k) => data[k])],
  );
  return rows[0] ?? null;
}

// ---------- Compras ----------

const COMPRA_COLUMNS = `
  c.id, c.sucursal_id AS "sucursalId", s.nombre AS sucursal,
  c.proveedor_id AS "proveedorId", p.nombre AS proveedor,
  c.numero_factura AS "numeroFactura", c.total, c.estado_pago AS "estadoPago",
  c.fecha_vencimiento AS "fechaVencimiento", c.fecha_pago AS "fechaPago",
  c.creado_en AS "creadoEn",
  (c.estado_pago = 'PENDIENTE' AND c.fecha_vencimiento < CURRENT_DATE) AS vencida`;

const COMPRA_FROM = `
  FROM compras c
  JOIN sucursales s ON s.id = c.sucursal_id
  JOIN proveedores p ON p.id = c.proveedor_id`;

export async function insertCompra(client, c) {
  // El total se calcula en PostgreSQL con NUMERIC exacto: Σ cantidad × costo.
  const { rows } = await client.query(
    `INSERT INTO compras (sucursal_id, proveedor_id, numero_factura, total, estado_pago,
                          fecha_vencimiento, fecha_pago)
     SELECT $1, $2, $3, round(sum(x.cantidad * x.costo), 2), $4, $5, $6
     FROM unnest($7::numeric[], $8::numeric[]) AS x(cantidad, costo)
     RETURNING id`,
    [
      c.sucursalId, c.proveedorId, c.numeroFactura, c.estadoPago, c.fechaVencimiento, c.fechaPago,
      c.items.map((i) => i.cantidad), c.items.map((i) => i.costoUnitario),
    ],
  );
  return rows[0].id;
}

export async function insertDetalle(client, compraId, items) {
  await client.query(
    `INSERT INTO detalle_compra (compra_id, insumo_id, cantidad, costo_unitario)
     SELECT $1, x.insumo_id, x.cantidad, x.costo
     FROM unnest($2::int[], $3::numeric[], $4::numeric[]) AS x(insumo_id, cantidad, costo)`,
    [compraId, items.map((i) => i.insumoId), items.map((i) => i.cantidad), items.map((i) => i.costoUnitario)],
  );
}

/**
 * Suma lo comprado al stock de la sucursal. Si el insumo aún no tenía fila
 * en esa sucursal, la crea. Se procesa en orden de insumo_id, igual que las
 * ventas, para no interbloquearse con ellas.
 */
export async function sumarStock(client, sucursalId, items) {
  const ordenados = [...items].sort((a, b) => a.insumoId - b.insumoId);
  const { rows } = await client.query(
    `INSERT INTO inventario_sucursal (sucursal_id, insumo_id, stock_actual, stock_minimo)
     SELECT $1, x.insumo_id, x.cantidad, 0
     FROM unnest($2::int[], $3::numeric[]) WITH ORDINALITY AS x(insumo_id, cantidad, orden)
     ORDER BY x.orden
     ON CONFLICT (sucursal_id, insumo_id)
     DO UPDATE SET stock_actual = inventario_sucursal.stock_actual + EXCLUDED.stock_actual
     RETURNING insumo_id AS "insumoId", stock_actual AS "stockResultante"`,
    [sucursalId, ordenados.map((i) => i.insumoId), ordenados.map((i) => i.cantidad)],
  );
  const cantidades = new Map(items.map((i) => [i.insumoId, i.cantidad]));
  return rows.map((r) => ({ ...r, cantidad: cantidades.get(r.insumoId) }));
}

export async function findCompra(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COMPRA_COLUMNS} ${COMPRA_FROM} WHERE c.id = $1`, [id]);
  const compra = rows[0];
  if (!compra) return null;
  const detalle = await db.query(
    `SELECT d.insumo_id AS "insumoId", i.nombre AS insumo, i.unidad, d.cantidad,
            d.costo_unitario AS "costoUnitario",
            round(d.cantidad * d.costo_unitario, 2) AS subtotal
     FROM detalle_compra d JOIN insumos i ON i.id = d.insumo_id
     WHERE d.compra_id = $1 ORDER BY d.id`,
    [id],
  );
  return { ...compra, items: detalle.rows };
}

export async function listCompras({ sucursalId, estadoPago, proveedorId, limit }) {
  const params = [sucursalId, estadoPago ?? null, proveedorId ?? null];
  const where = `
     WHERE ($1::int IS NULL OR c.sucursal_id = $1)
       AND ($2::text IS NULL OR c.estado_pago = $2)
       AND ($3::int IS NULL OR c.proveedor_id = $3)`;
  const { rows } = await pool.query(
    `SELECT ${COMPRA_COLUMNS} ${COMPRA_FROM} ${where}
     ORDER BY c.estado_pago DESC, c.fecha_vencimiento NULLS LAST, c.creado_en DESC
     LIMIT $4`,
    [...params, limit],
  );
  const resumen = await pool.query(
    `SELECT count(*)::int AS cantidad, COALESCE(sum(c.total), 0)::numeric(12,2) AS total,
            COALESCE(sum(c.total) FILTER (WHERE c.estado_pago = 'PENDIENTE'), 0)::numeric(12,2) AS "totalPendiente"
     FROM compras c ${where}`,
    params,
  );
  return { items: rows, resumen: resumen.rows[0] };
}

export async function lockCompra(client, id) {
  const { rows } = await client.query(
    `SELECT id, sucursal_id AS "sucursalId", estado_pago AS "estadoPago",
            creado_en::date AS "fechaCompra"
     FROM compras WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

export async function marcarPagada(client, id, fechaPago) {
  await client.query(
    `UPDATE compras SET estado_pago = 'PAGADA', fecha_pago = COALESCE($2::date, CURRENT_DATE)
     WHERE id = $1`,
    [id, fechaPago ?? null],
  );
}
