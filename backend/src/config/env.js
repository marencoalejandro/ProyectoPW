import 'dotenv/config';

// Lee y valida la configuración una sola vez. Si falta algo, el servidor no
// arranca: es preferible a fallar en la primera petición.

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${name} (ver backend/.env.example).`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function integer(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function secret(name) {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} debe tener al menos 32 caracteres.`);
  return value;
}

function bool(name, fallback) {
  return optional(name, String(fallback)).toLowerCase() === 'true';
}

const nodeEnv = optional('NODE_ENV', 'development');
const isTest = nodeEnv === 'test';

const sameSite = optional('COOKIE_SAMESITE', 'strict').toLowerCase();
if (!['strict', 'lax', 'none'].includes(sameSite)) {
  throw new Error('COOKIE_SAMESITE debe ser strict, lax o none.');
}
const cookieSecure = bool('COOKIE_SECURE', nodeEnv === 'production');
if (sameSite === 'none' && !cookieSecure) {
  throw new Error('COOKIE_SAMESITE=none exige COOKIE_SECURE=true.');
}

const apiPrefix = optional('API_PREFIX', '/api/v1').replace(/\/+$/, '');

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest,
  port: integer('PORT', 3000, { max: 65535 }),
  apiPrefix,
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  db: Object.freeze({
    host: optional('DB_HOST', 'localhost'),
    port: integer('DB_PORT', 5432, { max: 65535 }),
    database: isTest ? required('DB_NAME_TEST') : required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    ssl: bool('DB_SSL', false),
    timezone: optional('DB_TIMEZONE', 'America/El_Salvador'),
  }),
  jwtSecret: secret('JWT_SECRET'),
  csrfSecret: secret('CSRF_SECRET'),
  accessTokenMinutes: integer('ACCESS_TOKEN_MINUTES', 15, { max: 60 }),
  refreshTokenDays: integer('REFRESH_TOKEN_DAYS', 7, { max: 30 }),
  cookie: Object.freeze({ secure: cookieSecure, sameSite }),
});
