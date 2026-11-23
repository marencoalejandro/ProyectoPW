-- Índices para las consultas frecuentes de la API.
CREATE INDEX IF NOT EXISTS ventas_turno_idx ON ventas (turno_id);
CREATE INDEX IF NOT EXISTS ventas_sucursal_fecha_idx ON ventas (sucursal_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS detalle_venta_venta_idx ON detalle_venta (venta_id);
CREATE INDEX IF NOT EXISTS detalle_compra_compra_idx ON detalle_compra (compra_id);
CREATE INDEX IF NOT EXISTS compras_pendientes_idx ON compras (sucursal_id, fecha_vencimiento)
    WHERE estado_pago = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS pagos_planilla_periodo_idx ON pagos_planilla (anio, mes, quincena);
