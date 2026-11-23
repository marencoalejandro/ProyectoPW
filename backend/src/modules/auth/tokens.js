import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ISSUER = 'origenes-sv-api';
const AUDIENCE = 'origenes-sv-web';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * JWT de acceso, vida corta (ACCESS_TOKEN_MINUTES).
 * El payload solo lleva identificadores: sub (usuario) y sid (sesión).
 * Rol, sucursal y nombre se leen de la BD en cada petición.
 */
export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: sessionId }, env.jwtSecret, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${env.accessTokenMinutes}m`,
  });
}

/** Devuelve { sub, sid } o null si el token es inválido o venció. */
export function verifyAccessToken(token, { ignoreExpiration = false } = {}) {
  try {
    const claims = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      ignoreExpiration,
    });
    const sub = Number(claims.sub);
    if (!Number.isInteger(sub) || sub <= 0 || !SESSION_ID.test(claims.sid ?? '')) return null;
    return { sub, sid: claims.sid };
  } catch {
    return null;
  }
}

/** Refresh token opaco: 256 bits aleatorios. En la BD solo se guarda su hash. */
export const newRefreshToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const isWellFormedRefreshToken = (token) =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
