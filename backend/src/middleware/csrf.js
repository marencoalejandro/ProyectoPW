import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { COOKIES, setCsrfCookie } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';

// CSRF con doble envío firmado. El servidor guarda un nonce aleatorio en una
// cookie HttpOnly y entrega token = HMAC(CSRF_SECRET, nonce) en JSON. React lo
// manda en X-CSRF-Token en cada escritura. Otro sitio no puede leer la
// respuesta (CORS) ni calcular el HMAC sin el secreto.

const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sign = (nonce) => createHmac('sha256', env.csrfSecret).update(nonce).digest('base64url');

function sameText(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** GET /auth/csrf: reutiliza el nonce vigente o crea uno. */
export function issueCsrfToken(req, res) {
  let nonce = req.cookies?.[COOKIES.csrf];
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) {
    nonce = randomBytes(32).toString('base64url');
    setCsrfCookie(res, nonce);
  }
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: sign(nonce) });
}

/** Exige un token válido en POST, PUT, PATCH y DELETE. */
export function requireCsrf(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const nonce = req.cookies?.[COOKIES.csrf];
  const header = req.get('X-CSRF-Token');
  const valid =
    typeof nonce === 'string' &&
    NONCE.test(nonce) &&
    typeof header === 'string' &&
    header.length <= 128 &&
    sameText(header, sign(nonce));
  if (!valid) {
    return next(new AppError(403, 'CSRF_INVALIDO', 'La sesión de seguridad expiró. Recargá la página.'));
  }
  next();
}
