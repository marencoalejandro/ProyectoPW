// npm run db:setup  → crea la BD si no existe, instala el esquema y migra.
// npm run db:migrate → solo aplica migraciones pendientes.
import { env } from '../src/config/env.js';
import { ensureDatabase, migrate } from './lib/migrator.js';

const soloMigraciones = process.argv.includes('--solo-migraciones');

try {
  if (!soloMigraciones) await ensureDatabase(env.db);
  await migrate(env.db, { allowBaseline: !soloMigraciones });
  console.log(`Listo: ${env.db.database} está al día.`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
