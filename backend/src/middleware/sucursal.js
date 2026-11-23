import { badRequest, forbidden } from '../lib/errors.js';
import { isAdminCentral } from './auth.js';

/**
 * Decide sobre qué sucursal opera la petición.
 * - Administración central: la que pida; si no pide ninguna y `obligatoria`
 *   es true, responde 400.
 * - Cualquier otro usuario: siempre la suya. Pedir otra responde 403.
 * Devuelve el id de sucursal, o null (todas) solo para la administración
 * central cuando `obligatoria` es false.
 */
export function resolverSucursal(user, solicitada, { obligatoria = true } = {}) {
  const pedida = solicitada === undefined || solicitada === null ? null : Number(solicitada);

  if (isAdminCentral(user)) {
    if (pedida === null && obligatoria) {
      throw badRequest('SUCURSAL_REQUERIDA', 'Indicá la sucursal (sucursalId).');
    }
    return pedida;
  }

  if (user.sucursalId === null) throw forbidden('Tu usuario no tiene una sucursal asignada.');
  if (pedida !== null && pedida !== user.sucursalId) {
    throw forbidden('No tenés acceso a los datos de otra sucursal.');
  }
  return user.sucursalId;
}

/** Comprueba que un recurso ya cargado pertenezca a una sucursal permitida. */
export function exigirAccesoSucursal(user, sucursalId) {
  if (isAdminCentral(user)) return;
  if (user.sucursalId !== sucursalId) throw forbidden('No tenés acceso a los datos de otra sucursal.');
}
