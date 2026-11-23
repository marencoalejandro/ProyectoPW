-- Directorio global de clientes fiscales (CCF) y vínculo opcional desde ventas.
-- DDL de cliente proporcionado por el equipo. Las columnas cliente_nombre,
-- cliente_nit y cliente_nrc de ventas se conservan como fotografía fiscal.
CREATE TABLE IF NOT EXISTS cliente (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
    nit VARCHAR(14) NOT NULL UNIQUE CHECK (nit ~ '^[0-9]{9}$|^[0-9]{14}$'),
    nrc VARCHAR(10) UNIQUE CHECK (nrc IS NULL OR nrc ~ '^[0-9]{1,10}$'),
    direccion VARCHAR(255) NOT NULL CHECK (btrim(direccion) <> ''),
    giro VARCHAR(150) NOT NULL CHECK (btrim(giro) <> ''),
    tipo_contribuyente VARCHAR(10) NOT NULL CHECK (tipo_contribuyente IN ('natural', 'juridica')),
    tamano_contribuyente VARCHAR(10) NOT NULL CHECK (tamano_contribuyente IN ('pequeno', 'mediano', 'grande')),
    correo VARCHAR(120) CHECK (correo IS NULL OR correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    telefono VARCHAR(15) CHECK (telefono IS NULL OR telefono ~ '^[0-9]{8}$'),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id INTEGER
    REFERENCES cliente(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ventas_cliente_id_idx ON ventas (cliente_id);
