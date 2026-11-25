import { createHash } from 'node:crypto';
import { withTransaction } from '../../db/pool.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { desglosarIva, fromCents, toCents } from '../../lib/money.js';
import { exigirAccesoSucursal } from '../../middleware/sucursal.js';
import * as cajaRepo from '../caja/repository.js';
import * as inventarioRepo from '../inventario/repository.js';
import * as repo from './repository.js';

/** Une renglones repetidos del mismo platillo y ordena por id. */
export function normalizarItems(items) {
  const porPlatillo = new Map();
  for (const { platilloId, cantidad } of items) {
    porPlatillo.set(platilloId, (porPlatillo.get(platilloId) ?? 0) + cantidad);
  }
  return [...porPlatillo.entries()]
    .sort(([a], [b]) => a - b)
    .map(([platilloId, cantidad]) => ({ platilloId, cantidad }));
}

/** Huella del contenido del pedido, para reconocer reintentos. */
function huella(pedido) {
  const contenido = JSON.stringify([
    pedido.turnoId,
    pedido.tipoDoc,
    pedido.metodoPago,
    pedido.clienteId ?? null,
    pedido.items.map((i) => [i.platilloId, i.cantidad]),
  ]);
  return createHash('sha256').update(contenido).digest('hex');
}

async function resolverReintento(user, clave, hash) {
  const previa = await repo.findByClave(clave);
  if (!previa) return null;
  const venta = await repo.findComprobante(previa.id);
  if (previa.hash !== hash || venta.usuarioId !== user.id) {
    throw conflict('CLAVE_REUTILIZADA', 'Esa clave de operación ya se usó con otro pedido.');
  }
  return venta;
}

/**
 * Confirma una venta en UNA transacción: turno, cliente fiscal, precios,
 * receta, descuento de stock, correlativo, cabecera y detalle. Si algo falla
 * (p. ej. falta una tapadera) no queda nada guardado.
 *
 * Orden de bloqueos (igual en todas las ventas, evita interbloqueos):
 *   turno → filas de stock por insumo_id → sucursal (correlativo).
 */
export async function registrarVenta(user, pedido) {
  const items = normalizarItems(pedido.items);
  const datos = { ...pedido, items };
  const hash = pedido.claveOperacion ? huella(datos) : null;

  if (pedido.claveOperacion) {
    const existente = await resolverReintento(user, pedido.claveOperacion, hash);
    if (existente) return { venta: existente, repetida: true };
  }

  try {
    const venta = await withTransaction((client) => confirmar(client, user, datos, hash));
    return { venta, repetida: false };
  } catch (error) {
    // Dos envíos simultáneos con la misma clave: el segundo choca con el
    // índice único y devuelve la venta que confirmó el primero.
    if (error.code === '23505' && error.constraint === 'ventas_clave_operacion_key') {
      const existente = await resolverReintento(user, pedido.claveOperacion, hash);
      if (existente) return { venta: existente, repetida: true };
    }
    throw error;
  }
}

async function confirmar(client, user, pedido, hash) {
  // 1. Turno abierto del propio cajero, en una sucursal permitida.
  const turno = await cajaRepo.lockTurno(client, pedido.turnoId);
  if (!turno) throw notFound('El turno no existe.');
  exigirAccesoSucursal(user, turno.sucursalId);
  if (pedido.sucursalId !== undefined && pedido.sucursalId !== turno.sucursalId) {
    throw badRequest('SUCURSAL_NO_COINCIDE', 'El turno pertenece a otra sucursal.');
  }
  if (turno.usuarioId !== user.id) throw forbidden('El turno pertenece a otro cajero.');
  if (turno.estado !== 'ABIERTO') {
    throw new AppError(409, 'TURNO_CERRADO', 'El turno está cerrado. Abrí un turno nuevo para cobrar.');
  }
  const sucursalId = turno.sucursalId;

  // 2. Cliente fiscal: obligatorio para CCF y con NRC.
  let cliente = null;
  if (pedido.tipoDoc === 'CCF' && pedido.clienteId === undefined) {
    throw badRequest('CLIENTE_REQUERIDO', 'Seleccioná o registrá el cliente para emitir el CCF.');
  }
  if (pedido.clienteId !== undefined) {
    cliente = await repo.findClienteActivo(client, pedido.clienteId);
    if (!cliente) throw conflict('CLIENTE_INVALIDO', 'El cliente no existe o está inactivo.');
    if (pedido.tipoDoc === 'CCF' && !cliente.nrc) {
      throw conflict('NRC_REQUERIDO', 'Completá el NRC del cliente antes de emitir el CCF.');
    }
  }

  // 3. Productos activos y precios desde la BD (nunca desde el navegador).
  const ids = pedido.items.map((i) => i.platilloId);
  const platillos = new Map((await repo.findPlatillos(client, ids)).map((p) => [p.id, p]));
  const noDisponible = pedido.items.find((i) => !platillos.get(i.platilloId)?.activo);
  if (noDisponible) {
    throw conflict('PLATILLO_NO_DISPONIBLE', `El producto ${noDisponible.platilloId} no existe o no está a la venta.`);
  }
  const sinReceta = await repo.platillosSinReceta(client, ids);
  if (sinReceta.length) {
    throw conflict('RECETA_VACIA', `"${sinReceta[0].nombre}" no tiene receta: no se puede descontar inventario.`);
  }

  // 4. Consumo agrupado por insumo, bloqueo ordenado y verificación.
  const consumo = await repo.consumoPorInsumo(client, pedido.items);
  const stock = new Map(
    (await repo.lockStock(client, sucursalId, consumo.map((c) => c.insumoId))).map((s) => [s.insumoId, s]),
  );
  const faltantes = consumo
    .filter((c) => !stock.has(c.insumoId) || Number(stock.get(c.insumoId).stockActual) < Number(c.requerido))
    .map((c) => ({
      insumoId: c.insumoId,
      insumo: c.nombre,
      unidad: c.unidad,
      requerido: c.requerido,
      disponible: stock.get(c.insumoId)?.stockActual ?? '0',
    }));
  if (faltantes.length) {
    const [primero] = faltantes;
    throw conflict(
      'STOCK_INSUFICIENTE',
      `No hay suficiente "${primero.insumo}" para completar el pedido.`,
      faltantes,
    );
  }
  const salidas = await repo.descontarStock(client, sucursalId, consumo);

  // 5. Importes: precio al público con IVA incluido.
  const lineas = pedido.items.map((i) => ({ ...i, precio: platillos.get(i.platilloId).precio }));
  const totalCents = lineas.reduce((acc, l) => acc + toCents(l.precio) * l.cantidad, 0);
  const { subtotal, iva, total } = desglosarIva(totalCents);

  // 6. Correlativo bajo bloqueo y registro.
  const numero = await repo.siguienteNumero(client, sucursalId, pedido.tipoDoc);
  const ventaId = await repo.insertVenta(client, {
    sucursalId,
    turnoId: turno.id,
    usuarioId: user.id,
    tipoDoc: pedido.tipoDoc,
    numero,
    metodoPago: pedido.metodoPago,
    cliente,
    subtotal: fromCents(subtotal),
    iva: fromCents(iva),
    total: fromCents(total),
    claveOperacion: pedido.claveOperacion,
    hashOperacion: hash,
  });
  await repo.insertDetalle(client, ventaId, lineas);
  await inventarioRepo.registrarMovimientos(
    client,
    { sucursalId, tipo: 'VENTA', usuarioId: user.id, ventaId },
    salidas,
  );

  const comprobante = await repo.findComprobante(ventaId, client);
  const alertasStock = await inventarioRepo.alertasDe(client, sucursalId, consumo.map((c) => c.insumoId));
  return { ...comprobante, alertasStock };
}

export async function obtenerComprobante(user, id) {
  const venta = await repo.findComprobante(id);
  if (!venta) throw notFound('La venta no existe.');
  exigirAccesoSucursal(user, venta.sucursalId);
  return venta;
}

export const listarVentas = (filtros) => repo.listVentas(filtros);

/**
 * Anula una venta del turno ABIERTO. En una transacción:
 * - bloquea el turno (igual que cobro y cierre, así no se cruza con ellos);
 * - devuelve al stock exactamente lo que la venta descontó según sus
 *   movimientos (aunque la receta haya cambiado después);
 * - marca la venta como anulada: conserva su número y deja de contar en el
 *   arqueo y en los reportes.
 * Un turno ya CERRADO no se toca: su arqueo quedó firmado.
 */
export async function anularVenta(user, id, motivo) {
  return withTransaction(async (client) => {
    const previa = await repo.findComprobante(id, client);
    if (!previa) throw notFound('La venta no existe.');
    exigirAccesoSucursal(user, previa.sucursalId);

    const turno = await cajaRepo.lockTurno(client, previa.turnoId);
    const venta = await repo.lockVenta(client, id);
    if (venta.anuladaEn) throw conflict('VENTA_YA_ANULADA', 'La venta ya estaba anulada.');
    if (turno.estado !== 'ABIERTO') {
      throw conflict('TURNO_CERRADO', 'Solo se anulan ventas de un turno abierto; el arqueo de este turno ya se cerró.');
    }

    const salidas = await repo.salidasDeVenta(client, id);
    let devueltos = [];
    if (salidas.length) {
      await repo.lockStock(client, venta.sucursalId, salidas.map((s) => s.insumoId));
      devueltos = await repo.devolverStock(client, venta.sucursalId, salidas);
      await inventarioRepo.registrarMovimientos(
        client,
        { sucursalId: venta.sucursalId, tipo: 'ANULACION_VENTA', usuarioId: user.id, ventaId: id, nota: motivo },
        devueltos,
      );
    }
    await repo.marcarAnulada(client, id, user.id, motivo);

    const comprobante = await repo.findComprobante(id, client);
    return {
      ...comprobante,
      // false en ventas anteriores al kardex (datos de demo): no descontaron stock.
      stockRevertido: devueltos.length > 0,
      stockDevuelto: devueltos.map(({ insumoId, cantidad, stockResultante }) => ({ insumoId, cantidad, stockResultante })),
    };
  });
}
