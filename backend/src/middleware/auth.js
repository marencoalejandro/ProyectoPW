import { COOKIES } from '../lib/cookies.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import * as authRepository from '../modules/auth/repository.js';

/**
 * Identifica al usuario a partir del JWT de la cookie os_at.
 * Además de la firma y la expiración, consulta en la BD que la sesión siga
 * vigente y que el usuario esté activo: así cerrar sesión, desactivar un
 * empleado o cambiar su rol surte efecto de inmediato.
 */
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIES.access];
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) return next(unauthorized());

  const user = await authRepository.findActiveSessionUser(claims.sub, claims.sid);
  if (!user) return next(unauthorized('Tu sesión terminó. Iniciá sesión de nuevo.'));

  req.user = user;
  next();
}

/** Permite el acceso solo a los roles indicados (ADMIN, RRHH, EMPLEADO). */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.rol)) return next(forbidden());
    next();
  };
}

/** Administrador central: rol ADMIN sin sucursal asignada. */
export const isAdminCentral = (user) => user.rol === 'ADMIN' && user.sucursalId === null;

export function requireAdminCentral(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!isAdminCentral(req.user)) {
    return next(forbidden('Solo la administración central puede modificar el catálogo.'));
  }
  next();
}
