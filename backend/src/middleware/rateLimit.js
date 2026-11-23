import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const handler = (_req, _res, next) =>
  next(new AppError(429, 'DEMASIADAS_PETICIONES', 'Demasiados intentos. Esperá un momento e intentá de nuevo.'));

const common = { standardHeaders: 'draft-8', legacyHeaders: false, handler };

// Límite general por IP para toda la API.
export const apiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: env.isTest ? 10_000 : 300,
});

// Login: por IP y correo, para frenar fuerza bruta sin bloquear a toda la sucursal.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 100) : '';
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
});

// Renovación de sesión: generoso, solo evita abusos.
export const refreshLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 120,
});
