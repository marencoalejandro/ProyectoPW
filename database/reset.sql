-- Borra TODOS los datos de demo y reinicia los ids desde 1.
-- No borra las tablas ni el registro de migraciones (schema_migrations).
-- Úsalo solo en bases de desarrollo o demostración: `npm run db:reset` en
-- backend/ ejecuta este archivo y luego seeds.sql.
TRUNCATE TABLE
    sesiones, movimientos_inventario,
    detalle_venta, ventas, turnos_caja, cliente,
    detalle_compra, compras, proveedores,
    pagos_planilla, recetas, inventario_sucursal,
    platillos, insumos, usuarios, sucursales
RESTART IDENTITY CASCADE;
