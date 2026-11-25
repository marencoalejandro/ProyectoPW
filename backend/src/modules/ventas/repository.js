import { pool } from '../../db/pool.js';

// Todas las funciones que reciben `client` se ejecutan dentro de la
// transacción de la venta (ver service.js).

export async function findByClave(clave, db = pool) {
  const { rows } = await db.query(
    'SELECT id, hash_operacion AS hash FROM ventas WHERE clave_operacion = $1',
    [clave],
  );
  return rows[0] ?? null;
}

export async function findPlatillos(client, ids) {
  const { rows } = await client.query(
    'SELECT id, nombre, precio, activo FROM platillos WHERE id = ANY($1::int[])',
    [ids],
  );
  return rows;
}

export async function findClienteActivo(client, id) {
  const { rows } = await client.query(
    'SELECT id, nombre, nit, nrc FROM cliente WHERE id = $1 AND activo',
    [id],
  );
  return rows[0] ?? null;
}

/** Platillos del pedido que no tienen receta (no se pueden descontar). */
export async function platillosSinReceta(client, platilloIds) {
  const { rows } = await client.query(
    `SELECT p.id, p.nombre FROM platillos p
     WHERE p.id = ANY($1::int[])
       AND NOT EXISTS (SELECT 1 FROM recetas r WHERE r.platillo_id = p.id)`,
    [platilloIds],
  );
  return rows;
}

/**
 * Consumo total del pedido agrupado por insumo. Si dos productos usan el
 * mismo insumo (p. ej. leche), se suma antes de descontar.
 */
export async function consumoPorInsumo(client, items) {
  const { rows } = await client.query(
    `SELECT r.insumo_id AS "insumoId", i.nombre, i.unidad,
            sum(r.cantidad * x.cantidad) AS requerido
     FROM unnest($1::int[], $2::int[]) AS x(platillo_id, cantidad)
     JOIN recetas r ON r.platillo_id = x.platillo_id
     JOIN insumos i ON i.id = r.insumo_id
     GROUP BY r.insumo_id, i.nombre, i.unidad
     ORDER BY r.insumo_id`,
    [items.map((i) => i.platilloId), items.map((i) => i.cantidad)],
  );
  return rows;
}

/**
 * Bloquea las filas de stock de la sucursal en orden de insumo. Todas las
 * ventas bloquean en el mismo orden, así dos cajeros no se interbloquean.
 */
export async function lockStock(client, sucursalId, insumoIds) {
  const { rows } = await client.query(
    `SELECT insumo_id AS "insumoId", stock_actual AS "stockActual"
     FROM inventario_sucursal
     WHERE sucursal_id = $1 AND insumo_id = ANY($2::int[])
     ORDER BY insumo_id
     FOR UPDATE`,
    [sucursalId, insumoIds],
  );
  return rows;
}

/** Descuenta el consumo y devuelve {insumoId, cantidad (negativa), stockResultante}. */
export async function descontarStock(client, sucursalId, consumo) {
  const { rows } = await client.query(
    `UPDATE inventario_sucursal inv
     SET stock_actual = inv.stock_actual - c.requerido
     FROM unnest($2::int[], $3::numeric[]) AS c(insumo_id, requerido)
     WHERE inv.sucursal_id = $1 AND inv.insumo_id = c.insumo_id
     RETURNING inv.insumo_id AS "insumoId", (-c.requerido) AS cantidad,
               inv.stock_actual AS "stockResultante"`,
    [sucursalId, consumo.map((c) => c.insumoId), consumo.map((c) => c.requerido)],
  );
  return rows;
}

/** Bloquea la venta para anularla. */
export async function lockVenta(client, id) {
  const { rows } = await client.query(
    `SELECT id, sucursal_id AS "sucursalId", turno_id AS "turnoId", anulada_en AS "anuladaEn"
     FROM ventas WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Salidas de inventario que registró la venta (tipo VENTA), agrupadas por
 * insumo. Anular devuelve exactamente esto, aunque la receta haya cambiado.
 */
export async function salidasDeVenta(client, ventaId) {
  const { rows } = await client.query(
    `SELECT insumo_id AS "insumoId", sum(-cantidad) AS cantidad
     FROM movimientos_inventario
     WHERE venta_id = $1 AND tipo = 'VENTA'
     GROUP BY insumo_id
     ORDER BY insumo_id`,
    [ventaId],
  );
  return rows;
}

/** Devuelve stock (en orden de insumo) y retorna los saldos resultantes. */
export async function devolverStock(client, sucursalId, salidas) {
  const { rows } = await client.query(
    `UPDATE inventario_sucursal inv
     SET stock_actual = inv.stock_actual + s.cantidad
     FROM unnest($2::int[], $3::numeric[]) AS s(insumo_id, cantidad)
     WHERE inv.sucursal_id = $1 AND inv.insumo_id = s.insumo_id
     RETURNING inv.insumo_id AS "insumoId", s.cantidad, inv.stock_actual AS "stockResultante"`,
    [sucursalId, salidas.map((s) => s.insumoId), salidas.map((s) => s.cantidad)],
  );
  return rows;
}

export async function marcarAnulada(client, id, usuarioId, motivo) {
  await client.query(
    `UPDATE ventas SET anulada_en = CURRENT_TIMESTAMP, anulada_por = $2, motivo_anulacion = $3
     WHERE id = $1`,
    [id, usuarioId, motivo],
  );
}

/**
 * Siguiente correlativo por sucursal y tipo de documento. Primero se bloquea
 * la fila de la sucursal: dos ventas simultáneas no pueden leer el mismo
 * máximo. FOR NO KEY UPDATE no choca con las llaves foráneas que apuntan a
 * la sucursal (compras, turnos…).
 */
export async function siguienteNumero(client, sucursalId, tipoDoc) {
  await client.query('SELECT id FROM sucursales WHERE id = $1 FOR NO KEY UPDATE', [sucursalId]);
  const { rows } = await client.query(
    'SELECT COALESCE(max(numero), 0) + 1 AS numero FROM ventas WHERE sucursal_id = $1 AND tipo_doc = $2',
    [sucursalId, tipoDoc],
  );
  return rows[0].numero;
}

export async function insertVenta(client, v) {
  const { rows } = await client.query(
    `INSERT INTO ventas (sucursal_id, turno_id, usuario_id, tipo_doc, numero, metodo_pago,
                         cliente_id, cliente_nombre, cliente_nit, cliente_nrc,
                         subtotal, iva, total, clave_operacion, hash_operacion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      v.sucursalId, v.turnoId, v.usuarioId, v.tipoDoc, v.numero, v.metodoPago,
      v.cliente?.id ?? null, v.cliente?.nombre ?? null, v.cliente?.nit ?? null, v.cliente?.nrc ?? null,
      v.subtotal, v.iva, v.total, v.claveOperacion ?? null, v.hashOperacion ?? null,
    ],
  );
  return rows[0].id;
}

export async function insertDetalle(client, ventaId, lineas) {
  await client.query(
    `INSERT INTO detalle_venta (venta_id, platillo_id, cantidad, precio_unitario)
     SELECT $1, x.platillo_id, x.cantidad, x.precio
     FROM unnest($2::int[], $3::int[], $4::numeric[]) AS x(platillo_id, cantidad, precio)`,
    [ventaId, lineas.map((l) => l.platilloId), lineas.map((l) => l.cantidad), lineas.map((l) => l.precio)],
  );
}

/** Comprobante histórico: usa la fotografía fiscal guardada en la venta. */
export async function findComprobante(id, db = pool) {
  const { rows } = await db.query(
    `SELECT v.id, v.tipo_doc AS "tipoDoc", v.numero,
            v.sucursal_id AS "sucursalId", s.nombre AS sucursal, s.direccion AS "sucursalDireccion",
            v.turno_id AS "turnoId", v.usuario_id AS "usuarioId", u.nombre AS cajero,
            v.metodo_pago AS "metodoPago", v.cliente_id AS "clienteId",
            v.cliente_nombre AS "clienteNombre", v.cliente_nit AS "clienteNit", v.cliente_nrc AS "clienteNrc",
            v.subtotal, v.iva, v.total, v.creado_en AS "creadoEn",
            (v.anulada_en IS NOT NULL) AS anulada, v.anulada_en AS "anuladaEn",
            ua.nombre AS "anuladaPor", v.motivo_anulacion AS "motivoAnulacion"
     FROM ventas v
     JOIN sucursales s ON s.id = v.sucursal_id
     JOIN usuarios u ON u.id = v.usuario_id
     LEFT JOIN usuarios ua ON ua.id = v.anulada_por
     WHERE v.id = $1`,
    [id],
  );
  const venta = rows[0];
  if (!venta) return null;

  const detalle = await db.query(
    `SELECT d.platillo_id AS "platilloId", p.nombre, d.cantidad,
            d.precio_unitario AS "precioUnitario",
            (d.cantidad * d.precio_unitario)::numeric(10,2) AS "totalLinea"
     FROM detalle_venta d JOIN platillos p ON p.id = d.platillo_id
     WHERE d.venta_id = $1 ORDER BY d.id`,
    [id],
  );

  const { clienteNombre, clienteNit, clienteNrc, ...resto } = venta;
  return {
    ...resto,
    cliente: venta.clienteId || clienteNombre
      ? { id: venta.clienteId, nombre: clienteNombre, nit: clienteNit, nrc: clienteNrc }
      : null,
    items: detalle.rows,
  };
}

export async function listVentas({ sucursalId, turnoId, tipoDoc, desde, hasta, anulada, limit }) {
  const { rows } = await pool.query(
    `SELECT v.id, v.tipo_doc AS "tipoDoc", v.numero, v.sucursal_id AS "sucursalId",
            v.turno_id AS "turnoId", v.metodo_pago AS "metodoPago",
            v.cliente_nombre AS "clienteNombre", v.subtotal, v.iva, v.total,
            v.creado_en AS "creadoEn", (v.anulada_en IS NOT NULL) AS anulada
     FROM ventas v
     WHERE ($1::int IS NULL OR v.sucursal_id = $1)
       AND ($2::int IS NULL OR v.turno_id = $2)
       AND ($3::text IS NULL OR v.tipo_doc = $3)
       AND ($4::date IS NULL OR v.creado_en >= $4::date)
       AND ($5::date IS NULL OR v.creado_en < $5::date + 1)
       AND ($7::boolean IS NULL OR (v.anulada_en IS NOT NULL) = $7)
     ORDER BY v.creado_en DESC, v.id DESC
     LIMIT $6`,
    [sucursalId, turnoId ?? null, tipoDoc ?? null, desde ?? null, hasta ?? null, limit, anulada ?? null],
  );
  return rows;
}
