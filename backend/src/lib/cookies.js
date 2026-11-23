import { env } from '../config/env.js';

// Nombres y opciones de las cookies de sesión. Todas son HttpOnly: el
// JavaScript del navegador no puede leerlas (protege contra XSS).
export const COOKIES = Object.freeze({
  access: 'os_at', // JWT de vida corta
  refresh: 'os_rt', // token opaco de renovación
  csrf: 'os_csrf', // nonce al que se ata el token CSRF
});

const base = () => ({
  httpOnly: true,
  secure: env.cookie.secure,
  sameSite: env.cookie.sameSite,
});

// El refresh token solo viaja a las rutas de autenticación.
const refreshPath = () => `${env.apiPrefix}/auth`;

export function setSessionCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIES.access, accessToken, {
    ...base(),
    path: '/',
    maxAge: env.accessTokenMinutes * 60 * 1000,
  });
  if (refreshToken) {
    res.cookie(COOKIES.refresh, refreshToken, {
      ...base(),
      path: refreshPath(),
      maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearSessionCookies(res) {
  res.clearCookie(COOKIES.access, { ...base(), path: '/' });
  res.clearCookie(COOKIES.refresh, { ...base(), path: refreshPath() });
}

export function setCsrfCookie(res, nonce) {
  // Cookie de sesión del navegador (sin maxAge): se borra al cerrarlo.
  res.cookie(COOKIES.csrf, nonce, { ...base(), path: '/' });
}
