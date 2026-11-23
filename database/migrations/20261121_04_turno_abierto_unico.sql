-- Un cajero no puede tener dos turnos ABIERTOS en la misma sucursal.
-- Si una base previa ya tiene duplicados, la migración falla para revisarlos:
-- SELECT sucursal_id, usuario_id, count(*) FROM turnos_caja
-- WHERE estado = 'ABIERTO' GROUP BY 1, 2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_abierto_unico
    ON turnos_caja (sucursal_id, usuario_id) WHERE estado = 'ABIERTO';

-- Un turno cerrado siempre tiene fecha de cierre (NOT VALID: no revisa el historial).
ALTER TABLE turnos_caja ADD CONSTRAINT turnos_caja_cierre_con_fecha
    CHECK (estado = 'ABIERTO' OR cerrado_en IS NOT NULL) NOT VALID;
