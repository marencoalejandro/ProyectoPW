-- Sesiones del navegador: una fila por inicio de sesión.
-- El refresh token viaja solo en una cookie HttpOnly; aquí se guarda su hash
-- SHA-256, nunca el valor. Cada renovación rota el hash. Si llega un token ya
-- rotado (posible robo), la sesión completa se revoca.
CREATE TABLE IF NOT EXISTS sesiones (
    id UUID PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    refresh_hash CHAR(64) NOT NULL UNIQUE,
    refresh_anterior_hash CHAR(64),
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    renovada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMPTZ NOT NULL,
    revocada_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sesiones_usuario_idx ON sesiones (usuario_id) WHERE revocada_en IS NULL;
CREATE INDEX IF NOT EXISTS sesiones_anterior_idx ON sesiones (refresh_anterior_hash);
