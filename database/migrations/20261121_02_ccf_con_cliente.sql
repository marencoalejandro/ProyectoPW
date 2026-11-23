-- Todo CCF debe referenciar un cliente.
-- La restricción se crea NOT VALID: PostgreSQL la aplica desde ya a toda
-- venta nueva o modificada, pero no revisa las filas históricas. Si no hay
-- CCF históricos sin cliente, se valida en el acto. Si los hay, queda
-- pendiente: completar las fichas (ver database/diagnosticos/
-- clientes_ccf_historicos.sql) y luego ejecutar
--   ALTER TABLE ventas VALIDATE CONSTRAINT ventas_ccf_con_cliente;
DO $$
DECLARE
    pendientes INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ventas_ccf_con_cliente') THEN
        ALTER TABLE ventas ADD CONSTRAINT ventas_ccf_con_cliente
            CHECK (tipo_doc <> 'CCF' OR cliente_id IS NOT NULL) NOT VALID;
    END IF;

    SELECT count(*) INTO pendientes
    FROM ventas WHERE tipo_doc = 'CCF' AND cliente_id IS NULL;

    IF pendientes = 0 THEN
        ALTER TABLE ventas VALIDATE CONSTRAINT ventas_ccf_con_cliente;
    ELSE
        RAISE NOTICE 'Hay % CCF históricos sin cliente: ventas_ccf_con_cliente queda NOT VALID hasta vincularlos.', pendientes;
    END IF;
END $$;
