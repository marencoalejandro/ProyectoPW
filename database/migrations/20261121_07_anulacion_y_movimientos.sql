-- Anulación de ventas y kardex (historial de movimientos de inventario).

-- 1. Anulación. La venta anulada conserva su número (el correlativo fiscal no
--    se reutiliza), deja de contar en el arqueo y en los reportes, y guarda
--    quién la anuló, cuándo y por qué.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_por INT REFERENCES usuarios(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion VARCHAR(200);
ALTER TABLE ventas ADD CONSTRAINT ventas_anulacion_completa CHECK (
    (anulada_en IS NULL AND anulada_por IS NULL AND motivo_anulacion IS NULL)
    OR (anulada_en IS NOT NULL AND anulada_por IS NOT NULL AND btrim(motivo_anulacion) <> '')
);

-- 2. Movimientos de inventario. Cada cambio de stock deja una fila:
--    cantidad con signo (+ entra, − sale) y el stock que quedó después.
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id BIGSERIAL PRIMARY KEY,
    sucursal_id INT NOT NULL,
    insumo_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('VENTA', 'ANULACION_VENTA', 'COMPRA', 'AJUSTE')),
    motivo VARCHAR(20)
        CHECK (motivo IS NULL OR motivo IN ('MERMA', 'CADUCIDAD', 'DANO', 'CONTEO', 'CORRECCION')),
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad <> 0),
    stock_resultante NUMERIC(12, 3) NOT NULL CHECK (stock_resultante >= 0),
    nota VARCHAR(200),
    venta_id INT REFERENCES ventas(id),
    compra_id INT REFERENCES compras(id),
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sucursal_id, insumo_id) REFERENCES inventario_sucursal (sucursal_id, insumo_id),
    -- Un ajuste siempre lleva motivo; los demás tipos, su documento de origen.
    CHECK (tipo <> 'AJUSTE' OR motivo IS NOT NULL),
    CHECK (tipo NOT IN ('VENTA', 'ANULACION_VENTA') OR venta_id IS NOT NULL),
    CHECK (tipo <> 'COMPRA' OR compra_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS movimientos_sucursal_fecha_idx
    ON movimientos_inventario (sucursal_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS movimientos_insumo_idx
    ON movimientos_inventario (sucursal_id, insumo_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS movimientos_venta_idx
    ON movimientos_inventario (venta_id) WHERE venta_id IS NOT NULL;
