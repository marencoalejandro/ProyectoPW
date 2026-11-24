import { withTransaction } from '../../db/pool.js';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { fromCents, toCents } from '../../lib/money.js';
import { exigirAccesoSucursal } from '../../middleware/sucursal.js';
import { isAdminCentral } from '../../middleware/auth.js';
import * as repo from './repository.js';

// Regla de negocio (no de permisos): solo quien maneja caja abre un turno.
const CARGOS_CAJA = new Set(['CAJERO', 'GERENTE']);

export const METODO_ETIQUETAS = Object.freeze({
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BITCOIN: 'Bitcoin/Chivo Wallet',
});

/**
 * Arqueo del turno. Solo el efectivo incluye el fondo inicial.
 * diferencia = declarado − esperado (negativo = faltante).
 * Ej.: fondo $20, ventas en efectivo $10, conteo $29 → diferencia −$1.00.
 */
export function calcularArqueo(turno, totales) {
  const esperado = {
    EFECTIVO: toCents(turno.montoInicial) + toCents(totales.EFECTIVO.total),
    TARJETA: toCents(totales.TARJETA.total),
    BITCOIN: toCents(totales.BITCOIN.total),
  };
  const declarado =
    turno.estado === 'CERRADO'
      ? {
          EFECTIVO: toCents(turno.efectivoContado ?? '0'),
          TARJETA: toCents(turno.tarjetaReportada ?? '0'),
          BITCOIN: toCents(turno.bitcoinReportado ?? '0'),
        }
      : null;

  const medios = Object.keys(esperado).map((metodo) => ({
    metodo,
    etiqueta: METODO_ETIQUETAS[metodo],
    ventas: totales[metodo].ventas,
    vendido: totales[metodo].total,
    esperado: fromCents(esperado[metodo]),
    declarado: declarado ? fromCents(declarado[metodo]) : null,
    diferencia: declarado ? fromCents(declarado[metodo] - esperado[metodo]) : null,
  }));

  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  return {
    medios,
    anuladas: totales.ANULADAS ?? { ventas: 0, total: '0.00' },
    totalVendido: fromCents(sum(esperado) - toCents(turno.montoInicial)),
    diferenciaTotal: declarado ? fromCents(sum(declarado) - sum(esperado)) : null,
  };
}

async function resumen(id, db) {
  const turno = await repo.findTurno(id, db);
  const totales = await repo.totalesPorMetodo(id, db);
  return { ...turno, arqueo: calcularArqueo(turno, totales) };
}

export async function abrirTurno(user, { sucursalId, montoInicial }) {
  if (!CARGOS_CAJA.has(user.cargo) && user.rol !== 'ADMIN') {
    throw forbidden('Solo cajeros y gerentes pueden abrir un turno de caja.');
  }
  if (!(await repo.findSucursalActiva(sucursalId))) {
    throw conflict('SUCURSAL_INACTIVA', 'La sucursal no existe o está inactiva.');
  }
  // El índice único parcial turnos_caja_abierto_unico impide duplicados
  // incluso con dos aperturas simultáneas (responde 409 TURNO_YA_ABIERTO).
  const id = await repo.insertTurno({ sucursalId, usuarioId: user.id, montoInicial });
  return resumen(id);
}

export async function obtenerTurno(user, id) {
  const turno = await repo.findTurno(id);
  if (!turno) throw notFound('El turno no existe.');
  exigirAccesoSucursal(user, turno.sucursalId);
  if (user.rol === 'EMPLEADO' && turno.usuarioId !== user.id) {
    throw forbidden('Solo podés consultar tus propios turnos.');
  }
  return resumen(id);
}

export async function turnoActual(user, sucursalId) {
  const turno = await repo.findTurnoAbierto(user.id, sucursalId);
  return turno ? resumen(turno.id) : null;
}

export async function cerrarTurno(user, id, conteos) {
  return withTransaction(async (client) => {
    const turno = await repo.lockTurno(client, id);
    if (!turno) throw notFound('El turno no existe.');
    exigirAccesoSucursal(user, turno.sucursalId);

    const esDueno = turno.usuarioId === user.id;
    const puedeSupervisar = user.rol === 'ADMIN' && (isAdminCentral(user) || user.sucursalId === turno.sucursalId);
    if (!esDueno && !puedeSupervisar) throw forbidden('Solo el cajero del turno o un gerente pueden cerrarlo.');
    if (turno.estado !== 'ABIERTO') throw new AppError(409, 'TURNO_CERRADO', 'El turno ya está cerrado.');

    await repo.cerrarTurno(client, id, conteos);
    return resumen(id, client);
  });
}

export const listarTurnos = (filtros) => repo.listTurnos(filtros);
