import { pool } from '../../db/pool.js';

// Datos de empleado para RR. HH. Nunca incluye password_hash.
const EMPLEADO_COLUMNS = `
  u.id, u.nombre, u.email, u.rol, u.cargo,
  u.sucursal_id AS "sucursalId", s.nombre AS sucursal,
  u.salario_base AS "salarioBase", u.activo, u.creado_en AS "creadoEn"`;

const EMPLEADO_FROM = 'FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id';

export async function listEmpleados({ sucursalId, incluirInactivos, cargo }) {
  const { rows } = await pool.query(
    `SELECT ${EMPLEADO_COLUMNS} ${EMPLEADO_FROM}
     WHERE ($1::int IS NULL OR u.sucursal_id = $1)
       AND ($2::boolean OR u.activo)
       AND ($3::text IS NULL OR u.cargo = $3)
     ORDER BY u.nombre`,
    [sucursalId, incluirInactivos, cargo ?? null],
  );
  return rows;
}

export async function findEmpleado(id, db = pool) {
  const { rows } = await db.query(`SELECT ${EMPLEADO_COLUMNS} ${EMPLEADO_FROM} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertEmpleado(e) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (sucursal_id, nombre, email, password_hash, rol, cargo, salario_base)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [e.sucursalId, e.nombre, e.email, e.passwordHash, e.rol, e.cargo, e.salarioBase],
  );
  return rows[0].id;
}

const COLUMNAS = {
  nombre: 'nombre',
  email: 'email',
  passwordHash: 'password_hash',
  rol: 'rol',
  cargo: 'cargo',
  salarioBase: 'salario_base',
  sucursalId: 'sucursal_id',
  activo: 'activo',
};

export async function updateEmpleado(client, id, data) {
  const keys = Object.keys(data).filter((k) => k in COLUMNAS);
  const sets = keys.map((k, i) => `${COLUMNAS[k]} = $${i + 2}`);
  await client.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $1`, [
    id,
    ...keys.map((k) => data[k]),
  ]);
}

export async function lockEmpleado(client, id) {
  const { rows } = await client.query(
    'SELECT id, rol, sucursal_id AS "sucursalId" FROM usuarios WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

export async function sucursalExiste(id) {
  const { rowCount } = await pool.query('SELECT 1 FROM sucursales WHERE id = $1', [id]);
  return rowCount > 0;
}

// ---------- Planilla ----------

export async function empleadosParaPlanilla(client, sucursalId) {
  const { rows } = await client.query(
    `SELECT id, salario_base AS "salarioBase" FROM usuarios
     WHERE activo AND ($1::int IS NULL OR sucursal_id = $1)
     ORDER BY id`,
    [sucursalId],
  );
  return rows;
}

/**
 * Inserta los pagos del período. La clave única (usuario, año, mes,
 * quincena) hace que generar dos veces no duplique ni modifique pagos.
 */
export async function insertPagos(client, periodo, pagos) {
  if (!pagos.length) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO pagos_planilla (usuario_id, anio, mes, quincena, salario_bruto, isss, afp, renta, salario_neto)
     SELECT x.usuario_id, $1, $2, $3, x.bruto, x.isss, x.afp, x.renta, x.neto
     FROM unnest($4::int[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[])
          AS x(usuario_id, bruto, isss, afp, renta, neto)
     ON CONFLICT (usuario_id, anio, mes, quincena) DO NOTHING`,
    [
      periodo.anio, periodo.mes, periodo.quincena,
      pagos.map((p) => p.usuarioId), pagos.map((p) => p.salarioBruto), pagos.map((p) => p.isss),
      pagos.map((p) => p.afp), pagos.map((p) => p.renta), pagos.map((p) => p.salarioNeto),
    ],
  );
  return rowCount;
}

export async function listPagos({ anio, mes, quincena, sucursalId }, db = pool) {
  const { rows } = await db.query(
    `SELECT pp.id, pp.usuario_id AS "usuarioId", u.nombre, u.cargo,
            u.sucursal_id AS "sucursalId", s.nombre AS sucursal,
            pp.anio, pp.mes, pp.quincena,
            pp.salario_bruto AS "salarioBruto", pp.isss, pp.afp, pp.renta,
            pp.salario_neto AS "salarioNeto", pp.fecha_pago AS "fechaPago"
     FROM pagos_planilla pp
     JOIN usuarios u ON u.id = pp.usuario_id
     LEFT JOIN sucursales s ON s.id = u.sucursal_id
     WHERE pp.anio = $1 AND pp.mes = $2 AND pp.quincena = $3
       AND ($4::int IS NULL OR u.sucursal_id = $4)
     ORDER BY u.nombre`,
    [anio, mes, quincena, sucursalId],
  );
  return rows;
}
