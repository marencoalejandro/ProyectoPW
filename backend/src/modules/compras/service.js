import { withTransaction } from '../../db/pool.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { exigirAccesoSucursal } from '../../middleware/sucursal.js';
import * as inventarioRepo from '../inventario/repository.js';
import * as repo from './repository.js';

/** Quita espacios al inicio y al final y colapsa los internos: "FAC  01 " → "FAC 01". */
export const normalizarFactura = (numero) => numero.trim().replace(/\s+/g, ' ');

function hoyEnElSalvador() {
  // Fecha local (UTC−6, sin horario de verano) en formato AAAA-MM-DD.
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Registra la factura del proveedor, su detalle y el aumento de stock en una
 * sola transacción.
 * - CREDITO: queda PENDIENTE (cuenta por pagar). Vence en la fecha indicada
 *   o, si no se indica, a 30 días.
 * - CONTADO: queda PAGADA con fecha de hoy.
 */
export async function registrarCompra(user, data) {
  const ids = data.items.map((i) => i.insumoId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('INSUMO_REPETIDO', 'Un insumo aparece más de una vez en la factura.');
  }

  const hoy = hoyEnElSalvador();
  const credito = data.condicion === 'CREDITO';
  if (credito && data.fechaVencimiento && data.fechaVencimiento < hoy) {
    throw badRequest('VENCIMIENTO_INVALIDO', 'La fecha de vencimiento no puede ser anterior a hoy.');
  }

  return withTransaction(async (client) => {
    if (!(await repo.findProveedor(data.proveedorId, client))) {
      throw conflict('PROVEEDOR_INVALIDO', 'El proveedor no existe.');
    }
    const insumos = await inventarioRepo.findInsumosByIds(ids, client);
    const activos = new Set(insumos.filter((i) => i.activo).map((i) => i.id));
    const invalido = ids.find((id) => !activos.has(id));
    if (invalido !== undefined) {
      throw conflict('INSUMO_INVALIDO', `El insumo ${invalido} no existe o está inactivo.`);
    }

    // Duplicados: los frena la restricción compras_proveedor_factura_key (409).
    const compraId = await repo.insertCompra(client, {
      sucursalId: data.sucursalId,
      proveedorId: data.proveedorId,
      numeroFactura: normalizarFactura(data.numeroFactura),
      estadoPago: credito ? 'PENDIENTE' : 'PAGADA',
      fechaVencimiento: credito ? (data.fechaVencimiento ?? sumarDias(hoy, 30)) : null,
      fechaPago: credito ? null : hoy,
      items: data.items,
    });
    await repo.insertDetalle(client, compraId, data.items);
    const entradas = await repo.sumarStock(client, data.sucursalId, data.items);
    await inventarioRepo.registrarMovimientos(
      client,
      { sucursalId: data.sucursalId, tipo: 'COMPRA', usuarioId: user.id, compraId },
      entradas,
    );

    const compra = await repo.findCompra(compraId, client);
    const alertasStock = await inventarioRepo.alertasDe(client, data.sucursalId, ids);
    return { ...compra, alertasStock };
  });
}

/** Pago de una cuenta por pagar: cambia estado y fecha, sin tocar el stock. */
export async function registrarPago(user, id, fechaPago) {
  return withTransaction(async (client) => {
    const compra = await repo.lockCompra(client, id);
    if (!compra) throw notFound('La compra no existe.');
    exigirAccesoSucursal(user, compra.sucursalId);
    if (compra.estadoPago === 'PAGADA') {
      throw new AppError(409, 'COMPRA_YA_PAGADA', 'La compra ya estaba pagada.');
    }
    if (fechaPago && fechaPago > hoyEnElSalvador()) {
      throw badRequest('FECHA_PAGO_INVALIDA', 'La fecha de pago no puede ser futura.');
    }
    await repo.marcarPagada(client, id, fechaPago);
    return repo.findCompra(id, client);
  });
}

export async function obtenerCompra(user, id) {
  const compra = await repo.findCompra(id);
  if (!compra) throw notFound('La compra no existe.');
  exigirAccesoSucursal(user, compra.sucursalId);
  return compra;
}
