import bcrypt from 'bcryptjs';
import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { fromCents, toCents } from '../../lib/money.js';
import { isAdminCentral } from '../../middleware/auth.js';
import { BCRYPT_COST } from '../auth/service.js';
import * as authRepo from '../auth/repository.js';
import { calcularQuincena } from './calculo.js';
import * as repo from './repository.js';

// ---------- Empleados ----------

/**
 * Reglas para asignar rol y sucursal:
 * - Solo la administración central crea o modifica cuentas ADMIN y cuentas
 *   sin sucursal (acceso global).
 * - RR. HH. gestiona EMPLEADO y RRHH.
 */
function validarAsignacion(actor, { rol, sucursalId }) {
  const central = isAdminCentral(actor);
  if (rol === 'ADMIN' && !central) {
    throw forbidden('Solo la administración central puede asignar el rol ADMIN.');
  }
  if (sucursalId === null && !central) {
    throw forbidden('Solo la administración central puede crear cuentas sin sucursal.');
  }
  if (sucursalId === null && rol !== 'ADMIN') {
    throw badRequest('SUCURSAL_REQUERIDA', 'Solo un administrador puede no tener sucursal.');
  }
}

export async function crearEmpleado(actor, data) {
  validarAsignacion(actor, data);
  if (data.sucursalId !== null && !(await repo.sucursalExiste(data.sucursalId))) {
    throw conflict('SUCURSAL_INVALIDA', 'La sucursal no existe.');
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
  const id = await repo.insertEmpleado({ ...data, passwordHash });
  return repo.findEmpleado(id);
}

export async function actualizarEmpleado(actor, id, cambios) {
  return withTransaction(async (client) => {
    const actual = await repo.lockEmpleado(client, id);
    if (!actual) throw notFound('El empleado no existe.');
    if (actual.rol === 'ADMIN' && !isAdminCentral(actor)) {
      throw forbidden('Solo la administración central puede modificar cuentas ADMIN.');
    }
    if (id === actor.id && (cambios.activo === false || (cambios.rol && cambios.rol !== actual.rol))) {
      throw conflict('AUTOMODIFICACION', 'No podés desactivar tu propia cuenta ni cambiar tu rol.');
    }

    const final = {
      rol: cambios.rol ?? actual.rol,
      sucursalId: 'sucursalId' in cambios ? cambios.sucursalId : actual.sucursalId,
    };
    validarAsignacion(actor, final);
    if (final.sucursalId !== null && !(await repo.sucursalExiste(final.sucursalId))) {
      throw conflict('SUCURSAL_INVALIDA', 'La sucursal no existe.');
    }

    const { password, ...resto } = cambios;
    const data = { ...resto };
    if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await repo.updateEmpleado(client, id, data);

    // Cambios de acceso cierran las sesiones abiertas de esa cuenta.
    const cambiaAcceso =
      password || cambios.activo === false || 'rol' in cambios || 'sucursalId' in cambios || 'email' in cambios;
    if (cambiaAcceso) await authRepo.revokeAllForUser(id, client);

    return repo.findEmpleado(id, client);
  });
}

// ---------- Planilla ----------

function hoyEnElSalvador() {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Primer día de la quincena en formato AAAA-MM-DD. */
const inicioQuincena = ({ anio, mes, quincena }) =>
  `${anio}-${String(mes).padStart(2, '0')}-${quincena === 1 ? '01' : '16'}`;

function totales(items) {
  const campos = ['salarioBruto', 'isss', 'afp', 'renta', 'salarioNeto'];
  const sumas = Object.fromEntries(campos.map((c) => [c, 0]));
  for (const item of items) for (const c of campos) sumas[c] += toCents(item[c]);
  return Object.fromEntries(campos.map((c) => [c, fromCents(sumas[c])]));
}

/**
 * Genera los pagos de la quincena para los empleados activos. Repetir la
 * generación no duplica pagos ni recalcula los existentes: el historial
 * conserva el salario con el que se pagó.
 */
export async function generarPlanilla(periodo, sucursalId) {
  if (inicioQuincena(periodo) > hoyEnElSalvador()) {
    throw badRequest('PERIODO_FUTURO', 'No se puede generar una quincena que aún no comienza.');
  }
  return withTransaction(async (client) => {
    const empleados = await repo.empleadosParaPlanilla(client, sucursalId);
    const pagos = empleados.map((e) => ({ usuarioId: e.id, ...calcularQuincena(e.salarioBase) }));
    const generados = await repo.insertPagos(client, periodo, pagos);
    const items = await repo.listPagos({ ...periodo, sucursalId }, client);
    return {
      periodo,
      generados,
      existentes: pagos.length - generados,
      items,
      totales: totales(items),
    };
  });
}

export async function consultarPlanilla(periodo, sucursalId) {
  const items = await repo.listPagos({ ...periodo, sucursalId });
  return { periodo, items, totales: totales(items) };
}
