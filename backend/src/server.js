import { env } from './config/env.js';
import { checkConnection, pool } from './db/pool.js';
import { createApp } from './app.js';

async function main() {
  try {
    const { db } = await checkConnection();
    console.log(`[db] Conectado a ${db}.`);
  } catch (error) {
    console.error(`[db] No se pudo conectar a PostgreSQL: ${error.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] Orígenes SV escuchando en http://localhost:${env.port}${env.apiPrefix}`);
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} recibido, cerrando…`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
