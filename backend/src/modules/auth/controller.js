import { z } from 'zod';
import { clearSessionCookies, COOKIES, setSessionCookies } from '../../lib/cookies.js';
import { email, parse } from '../../lib/validate.js';
import * as service from './service.js';

const loginSchema = z.object({
  email,
  // Límite de 72 bytes efectivos de bcrypt; 128 caracteres basta y frena abusos.
  password: z.string().min(1, 'Ingresá la contraseña.').max(128),
});

function noStore(res) {
  res.set('Cache-Control', 'no-store');
}

export async function login(req, res) {
  const { email: correo, password } = parse(loginSchema, req.body);
  const { user, tokens } = await service.login({
    email: correo,
    password,
    previousRefreshToken: req.cookies?.[COOKIES.refresh],
  });
  setSessionCookies(res, tokens);
  noStore(res);
  res.json({ user });
}

export async function refresh(req, res) {
  try {
    const { user, tokens } = await service.refresh(req.cookies?.[COOKIES.refresh]);
    setSessionCookies(res, tokens);
    noStore(res);
    res.json({ user });
  } catch (error) {
    clearSessionCookies(res);
    throw error;
  }
}

export function me(req, res) {
  noStore(res);
  res.json({ user: service.toProfile(req.user) });
}

export async function logout(req, res) {
  await service.logout({
    accessToken: req.cookies?.[COOKIES.access],
    refreshToken: req.cookies?.[COOKIES.refresh],
  });
  clearSessionCookies(res);
  res.status(204).end();
}
