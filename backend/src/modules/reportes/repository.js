import { pool } from '../../db/pool.js';

// Todas las consultas cuentan solo ventas vigentes (no anuladas), salvo el
// bloque de anuladas del resumen. Rango [desde, hasta] inclusive, en hora de
// El Salvador (zona de la sesión de PostgreSQL).

const FILTRO = `
  v.creado_en >= $1::date AND v.creado_en < $2::date + 1
  AND ($3::int IS NULL OR v.sucursal_id = $3)`;

const MONTOS = `
  count(*)::int AS ventas,
  COALESCE(sum(v.subtotal), 0)::numeric(12,2) AS subtotal,
  COALESCE(sum(v.iva), 0)::numeric(12,2) AS iva,
  COALESCE(sum(v.total), 0)::numeric(12,2) AS total`;

export async function resumenVentas({ desde, hasta, sucursalId }) {
  const params = [desde, hasta, sucursalId];

  const [totales, anuladas, porDia, porSucursal, porMetodo, porTipoDoc] = await Promise.all([
    pool.query(
      `SELECT ${MONTOS},
              CASE WHEN count(*) = 0 THEN '0.00'
                   ELSE round(sum(v.total) / count(*), 2)::text END AS "ticketPromedio"
       FROM ventas v WHERE ${FILTRO} AND v.anulada_en IS NULL`,
      params,
    ),
    pool.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(v.total), 0)::numeric(12,2) AS total
       FROM ventas v WHERE ${FILTRO} AND v.anulada_en IS NOT NULL`,
      params,
    ),
    pool.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS fecha, ${MONTOS.replaceAll('count(*)', 'count(v.id)')}
       FROM generate_series($1::date, $2::date, interval '1 day') AS d
       LEFT JOIN ventas v ON v.creado_en >= d AND v.creado_en < d + interval '1 day'
                         AND ($3::int IS NULL OR v.sucursal_id = $3)
                         AND v.anulada_en IS NULL
       GROUP BY d ORDER BY d`,
      params,
    ),
    pool.query(
      `SELECT s.id AS "sucursalId", s.nombre AS sucursal, ${MONTOS.replaceAll('count(*)', 'count(v.id)')}
       FROM sucursales s
       LEFT JOIN ventas v ON v.sucursal_id = s.id AND ${FILTRO} AND v.anulada_en IS NULL
       WHERE ($3::int IS NULL OR s.id = $3)
       GROUP BY s.id, s.nombre ORDER BY s.id`,
      params,
    ),
    pool.query(
      `SELECT m.metodo AS "metodoPago", ${MONTOS.replaceAll('count(*)', 'count(v.id)')}
       FROM unnest(ARRAY['EFECTIVO', 'TARJETA', 'BITCOIN']) AS m(metodo)
       LEFT JOIN ventas v ON v.metodo_pago = m.metodo AND ${FILTRO} AND v.anulada_en IS NULL
       GROUP BY m.metodo ORDER BY m.metodo`,
      params,
    ),
    pool.query(
      `SELECT t.tipo AS "tipoDoc", ${MONTOS.replaceAll('count(*)', 'count(v.id)')}
       FROM unnest(ARRAY['FACTURA', 'CCF']) AS t(tipo)
       LEFT JOIN ventas v ON v.tipo_doc = t.tipo AND ${FILTRO} AND v.anulada_en IS NULL
       GROUP BY t.tipo ORDER BY t.tipo`,
      params,
    ),
  ]);

  return {
    totales: totales.rows[0],
    anuladas: anuladas.rows[0],
    porDia: porDia.rows,
    porSucursal: porSucursal.rows,
    porMetodo: porMetodo.rows,
    porTipoDoc: porTipoDoc.rows,
  };
}

export async function productosMasVendidos({ desde, hasta, sucursalId, limit }) {
  const { rows } = await pool.query(
    `SELECT p.id AS "platilloId", p.nombre, p.categoria, p.tipo,
            sum(d.cantidad)::int AS cantidad,
            sum(d.cantidad * d.precio_unitario)::numeric(12,2) AS total
     FROM detalle_venta d
     JOIN ventas v ON v.id = d.venta_id
     JOIN platillos p ON p.id = d.platillo_id
     WHERE ${FILTRO} AND v.anulada_en IS NULL
     GROUP BY p.id, p.nombre, p.categoria, p.tipo
     ORDER BY cantidad DESC, total DESC
     LIMIT $4`,
    [desde, hasta, sucursalId, limit],
  );
  return rows;
}
