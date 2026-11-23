// npm run db:reset → borra los datos de demo y vuelve a cargar seeds.sql.
// Solo para bases de desarrollo o demostración.
import { env } from '../src/config/env.js';
import { ensureDatabase, migrate, runSqlFile } from './lib/migrator.js';

if (env.isProduction) {
  console.error('db:reset está deshabilitado con NODE_ENV=production.');
  process.exit(1);
}

try {
  await ensureDatabase(env.db);
  await migrate(env.db);
  console.log(`Vaciando ${env.db.database} (database/reset.sql)…`);
  await runSqlFile(env.db, 'reset.sql');
  console.log('Cargando datos de demo (database/seeds.sql)…');
  await runSqlFile(env.db, 'seeds.sql');
  console.log('Listo. Usuarios de demo con contraseña Admin1234 (ver database/seeds.sql).');
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
