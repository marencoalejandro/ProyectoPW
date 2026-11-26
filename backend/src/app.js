import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { checkConnection } from './db/pool.js';
import { requireCsrf } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import authRoutes from './modules/auth/routes.js';
import cajaRoutes from './modules/caja/routes.js';
import clientesRoutes from './modules/clientes/routes.js';
import comprasRoutes from './modules/compras/routes.js';
import inventarioRoutes from './modules/inventario/routes.js';
import nominaRoutes from './modules/nomina/routes.js';
import reportesRoutes from './modules/reportes/routes.js';
import sucursalesRoutes from './modules/sucursales/routes.js';
import ventasRoutes from './modules/ventas/routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Detrás de un proxy (Nginx) en producción, para que req.ip sea la IP real.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // Solo los orígenes configurados; las cookies exigen un origen concreto.
      origin: (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token', 'Idempotency-Key'],
      maxAge: 600,
    }),
  );

  app.get('/health', async (_req, res) => {
    try {
      await checkConnection();
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'sin conexión' });
    }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(requireCsrf);
  api.use((_req, res, next) => {
    // Datos privados por usuario: el navegador no debe guardarlos en caché.
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.use('/auth', authRoutes);
  api.use('/sucursales', sucursalesRoutes);
  api.use('/clientes', clientesRoutes);
  api.use('/', inventarioRoutes); // /platillos, /insumos, /inventario
  api.use('/', comprasRoutes); // /proveedores, /compras
  api.use('/turnos', cajaRoutes);
  api.use('/ventas', ventasRoutes);
  api.use('/', nominaRoutes); // /empleados, /planillas
  api.use('/reportes', reportesRoutes);

  app.use(env.apiPrefix, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
