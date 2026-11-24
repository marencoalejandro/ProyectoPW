import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import * as repo from './repository.js';

/**
 * Reglas de una receta:
 * - al menos un insumo, sin repetir;
 * - insumos existentes y activos;
 * - un producto de REVENTA (empacado) se descuenta por unidad: exactamente
 *   un insumo medido en "unidad" con cantidad 1.
 */
async function validarReceta(client, tipo, items) {
  if (!items.length) throw badRequest('RECETA_VACIA', 'La receta necesita al menos un insumo.');

  const ids = items.map((i) => i.insumoId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('RECETA_DUPLICADA', 'Un insumo aparece más de una vez en la receta.');
  }

  const insumos = await repo.findInsumosByIds(ids, client);
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const faltante = ids.find((id) => !porId.get(id)?.activo);
  if (faltante !== undefined) {
    throw badRequest('INSUMO_INVALIDO', `El insumo ${faltante} no existe o está inactivo.`);
  }

  if (tipo === 'REVENTA') {
    const [unico] = items;
    const valido =
      items.length === 1 && porId.get(unico.insumoId).unidad === 'unidad' && Number(unico.cantidad) === 1;
    if (!valido) {
      throw badRequest(
        'RECETA_REVENTA_INVALIDA',
        'Un producto de reventa se descuenta por unidad: un solo insumo en "unidad" con cantidad 1.',
      );
    }
  }
}

export async function crearPlatillo(data) {
  return withTransaction(async (client) => {
    await validarReceta(client, data.tipo, data.receta);
    const id = await repo.insertPlatillo(client, data);
    await repo.replaceReceta(client, id, data.receta);
    return { ...(await repo.findPlatillo(id, client)), receta: await repo.getReceta(id, client) };
  });
}

export async function actualizarPlatillo(id, data) {
  return withTransaction(async (client) => {
    const actual = await repo.lockPlatillo(client, id);
    if (!actual) throw notFound('El platillo no existe.');
    if (data.tipo && data.tipo !== actual.tipo) {
      // Cambiar ELABORADO ↔ REVENTA exige revisar la receta.
      await validarReceta(client, data.tipo, await repo.getReceta(id, client));
    }
    await repo.updatePlatillo(client, id, data);
    return repo.findPlatillo(id, client);
  });
}

export async function reemplazarReceta(id, items) {
  return withTransaction(async (client) => {
    const platillo = await repo.lockPlatillo(client, id);
    if (!platillo) throw notFound('El platillo no existe.');
    await validarReceta(client, platillo.tipo, items);
    await repo.replaceReceta(client, id, items);
    return { platilloId: id, items: await repo.getReceta(id, client) };
  });
}

export async function crearInsumo({ nombre, unidad, stockMinimo }) {
  return withTransaction(async (client) => {
    const insumo = await repo.insertInsumo(client, { nombre, unidad });
    await repo.createStockRows(client, insumo.id, stockMinimo);
    return insumo;
  });
}

export async function actualizarStockMinimo(sucursalId, insumoId, stockMinimo) {
  const fila = await repo.updateStockMinimo(sucursalId, insumoId, stockMinimo);
  if (!fila) throw conflict('SIN_STOCK_REGISTRADO', 'Ese insumo no tiene inventario en la sucursal.');
  return fila;
}

/**
 * Ajuste manual de stock con su movimiento en el kardex, en una transacción.
 * - CONTEO: se indica el stock físico contado; el sistema calcula la diferencia.
 * - MERMA, CADUCIDAD, DANO, CORRECCION: se indica la cantidad con signo
 *   (negativa sale, positiva entra). El stock nunca queda negativo.
 */
export async function ajustarStock(user, { sucursalId, insumoId, motivo, cantidad, stockContado, nota }) {
  return withTransaction(async (client) => {
    const fila = await repo.lockStockRow(client, sucursalId, insumoId);
    if (!fila) throw conflict('SIN_STOCK_REGISTRADO', 'Ese insumo no tiene inventario en la sucursal.');

    const delta = motivo === 'CONTEO' ? await repo.diferencia(client, stockContado, fila.stockActual) : cantidad;
    if (Number(delta) === 0) {
      throw badRequest('AJUSTE_SIN_CAMBIO', 'El ajuste no cambia el stock.');
    }
    if (Number(fila.stockActual) + Number(delta) < 0) {
      throw conflict(
        'STOCK_NEGATIVO',
        `El ajuste dejaría "${fila.nombre}" en negativo (hay ${fila.stockActual} ${fila.unidad}).`,
      );
    }

    const resultado = await repo.aplicarCantidad(client, sucursalId, insumoId, delta);
    await repo.registrarMovimientos(
      client,
      { sucursalId, tipo: 'AJUSTE', motivo, nota, usuarioId: user.id },
      [resultado],
    );
    return {
      sucursalId,
      insumoId,
      insumo: fila.nombre,
      unidad: fila.unidad,
      motivo,
      cantidad: resultado.cantidad,
      stockAnterior: fila.stockActual,
      stockActual: resultado.stockResultante,
      stockMinimo: resultado.stockMinimo,
      alerta: resultado.alerta,
    };
  });
}
