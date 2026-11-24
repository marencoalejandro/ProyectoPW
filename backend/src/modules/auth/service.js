import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { withTransaction } from '../../db/pool.js';
import { AppError, unauthorized } from '../../lib/errors.js';
import * as repo from './repository.js';
import {
  hashToken,
  isWellFormedRefreshToken,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

export const BCRYPT_COST = 12;

// Hash de relleno: si el correo no existe se compara igual, para que el
// tiempo de respuesta no revele qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync('relleno-para-tiempo-constante', BCRYPT_COST);

const invalidCredentials = () =>
  new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');

/** Perfil que recibe React: {id, name, email, role, branchId, ...}. */
export function toProfile(user) {
  return {
    id: user.id,
    name: user.nombre,
    email: user.email,
    role: user.rol,
    cargo: user.cargo,
    branchId: user.sucursalId,
    branchName: user.sucursalNombre ?? null,
  };
}

async function openSession(user) {
  const sessionId = randomUUID();
  const refreshToken = newRefreshToken();
  await repo.createSession({
    id: sessionId,
    userId: user.id,
    refreshHash: hashToken(refreshToken),
    days: env.refreshTokenDays,
  });
  return {
    accessToken: signAccessToken({ userId: user.id, sessionId }),
    refreshToken,
  };
}

/**
 * Comprueba credenciales y abre una sesión nueva. Si el navegador traía una
 * sesión previa, se revoca (rotación al iniciar sesión).
 */
export async function login({ email, password, previousRefreshToken }) {
  const user = await repo.findUserForLogin(email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk || !user.activo) throw invalidCredentials();

  if (isWellFormedRefreshToken(previousRefreshToken)) {
    await repo.revokeSessionByRefreshHash(hashToken(previousRefreshToken));
  }

  const tokens = await openSession(user);
  return { user: toProfile(user), tokens };
}

/**
 * Canjea el refresh token por un JWT nuevo y rota el refresh token.
 * - Token vigente: rota y entrega ambos.
 * - Token recién rotado (otra pestaña renovó hace < 30 s): entrega solo un JWT
 *   nuevo; el navegador ya guardó el refresh nuevo.
 * - Token rotado hace más tiempo: posible robo. Se revoca la sesión.
 */
export async function refresh(refreshToken) {
  if (!isWellFormedRefreshToken(refreshToken)) throw unauthorized();
  const hash = hashToken(refreshToken);

  return withTransaction(async (client) => {
    const session = await repo.lockSessionByRefreshHash(client, hash);
    if (!session || session.revocada || session.vencida) throw unauthorized();

    const isCurrent = session.refreshHash === hash;
    if (!isCurrent && !session.renovadaRecien) {
      await repo.revokeSession(session.id, client);
      return { reused: true };
    }

    const user = await repo.findActiveSessionUser(session.userId, session.id, client);
    if (!user) throw unauthorized();

    let newRefresh = null;
    if (isCurrent) {
      newRefresh = newRefreshToken();
      await repo.rotateRefresh(client, session.id, hashToken(newRefresh));
    }
    return {
      user: toProfile(user),
      tokens: {
        accessToken: signAccessToken({ userId: user.id, sessionId: session.id }),
        refreshToken: newRefresh,
      },
    };
  }).then((result) => {
    // La revocación ya quedó confirmada; recién ahora se informa el 401.
    if (result.reused) throw unauthorized('La sesión se cerró por seguridad. Iniciá sesión de nuevo.');
    return result;
  });
}

/** Revoca la sesión del navegador, aunque el JWT ya haya vencido. */
export async function logout({ accessToken, refreshToken }) {
  const claims = accessToken ? verifyAccessToken(accessToken, { ignoreExpiration: true }) : null;
  if (claims) await repo.revokeSession(claims.sid);
  if (isWellFormedRefreshToken(refreshToken)) {
    await repo.revokeSessionByRefreshHash(hashToken(refreshToken));
  }
}
