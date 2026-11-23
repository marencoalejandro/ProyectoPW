import { pool } from '../../db/pool.js';

const COLUMNS = `
  id, nombre, nit, nrc, direccion, giro,
  tipo_contribuyente AS "tipoContribuyente",
  tamano_contribuyente AS "tamanoContribuyente",
  correo, telefono, activo, creado_en AS "creadoEn"`;

// Mapa campo de la API → columna. Solo estas columnas se pueden escribir.
export const WRITABLE = {
  nombre: 'nombre',
  nit: 'nit',
  nrc: 'nrc',
  direccion: 'direccion',
  giro: 'giro',
  tipo_contribuyente: 'tipo_contribuyente',
  tamano_contribuyente: 'tamano_contribuyente',
  correo: 'correo',
  telefono: 'telefono',
  activo: 'activo',
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Busca por NIT o NRC (prefijo de dígitos) o por nombre (contiene). */
export async function search({ buscar, incluirInactivos, limit }) {
  const digits = buscar.replace(/[\s-]/g, '');
  const byNumber = /^[0-9]+$/.test(digits) ? `${digits}%` : null;
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM cliente
     WHERE ($1::boolean OR activo)
       AND ($2::text = '' OR nombre ILIKE $3 OR nit LIKE $4 OR nrc LIKE $4)
     ORDER BY nombre
     LIMIT $5`,
    [incluirInactivos, buscar, `%${escapeLike(buscar)}%`, byNumber, limit],
  );
  return rows;
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM cliente WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insert(data) {
  const keys = Object.keys(data).filter((k) => k in WRITABLE && k !== 'activo');
  const columns = keys.map((k) => WRITABLE[k]);
  const params = keys.map((_, i) => `$${i + 1}`);
  const { rows } = await pool.query(
    `INSERT INTO cliente (${columns.join(', ')}) VALUES (${params.join(', ')})
     RETURNING ${COLUMNS}`,
    keys.map((k) => data[k]),
  );
  return rows[0];
}

export async function update(id, data) {
  const keys = Object.keys(data).filter((k) => k in WRITABLE);
  const sets = keys.map((k, i) => `${WRITABLE[k]} = $${i + 2}`);
  const { rows } = await pool.query(
    `UPDATE cliente SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...keys.map((k) => data[k])],
  );
  return rows[0] ?? null;
}
