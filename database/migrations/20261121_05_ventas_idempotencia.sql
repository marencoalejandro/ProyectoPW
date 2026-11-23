-- Reintentos seguros del cobro. El POS genera una clave (UUID) por pedido y
-- la reenvía si pierde la respuesta. La misma clave con el mismo contenido
-- devuelve la venta ya creada; con otro contenido, la API responde 409.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS clave_operacion UUID;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS hash_operacion CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS ventas_clave_operacion_key
    ON ventas (clave_operacion) WHERE clave_operacion IS NOT NULL;
