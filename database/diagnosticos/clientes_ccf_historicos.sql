-- Diagnóstico para bases con CCF históricos (paso 1 de la migración de cliente).
-- Solo consulta: no modifica datos. Ejecutar antes de dar de alta las fichas.

-- 1. Identidades fiscales históricas agrupadas por NIT normalizado
--    (sin guiones ni espacios; se conservan los ceros iniciales).
SELECT regexp_replace(cliente_nit, '[\s-]', '', 'g')               AS nit_normalizado,
       regexp_replace(cliente_nit, '[\s-]', '', 'g') ~ '^[0-9]{9}$|^[0-9]{14}$' AS nit_valido,
       array_agg(DISTINCT cliente_nombre)                          AS nombres,
       array_agg(DISTINCT regexp_replace(cliente_nrc, '[\s-]', '', 'g')) AS nrcs,
       count(*)                                                    AS ccf_emitidos
FROM ventas
WHERE tipo_doc = 'CCF'
GROUP BY 1
ORDER BY 1;

-- 2. NIT inválidos tras normalizar (requieren revisión manual).
SELECT id, sucursal_id, numero, cliente_nit
FROM ventas
WHERE tipo_doc = 'CCF'
  AND regexp_replace(cliente_nit, '[\s-]', '', 'g') !~ '^[0-9]{9}$|^[0-9]{14}$';

-- 3. NRC que aparece bajo más de un NIT (identidad ambigua).
SELECT regexp_replace(cliente_nrc, '[\s-]', '', 'g') AS nrc,
       array_agg(DISTINCT regexp_replace(cliente_nit, '[\s-]', '', 'g')) AS nits
FROM ventas
WHERE tipo_doc = 'CCF'
GROUP BY 1
HAVING count(DISTINCT regexp_replace(cliente_nit, '[\s-]', '', 'g')) > 1;

-- 4. Después de crear las fichas con datos confirmados (dirección, giro, tipo
--    y tamaño), vincular por NIT normalizado SIN tocar la fotografía fiscal:
-- UPDATE ventas v SET cliente_id = c.id
-- FROM cliente c
-- WHERE v.tipo_doc = 'CCF' AND v.cliente_id IS NULL
--   AND c.nit = regexp_replace(v.cliente_nit, '[\s-]', '', 'g');

-- 5. Debe devolver cero filas antes de validar la restricción:
SELECT id, numero, sucursal_id FROM ventas WHERE tipo_doc = 'CCF' AND cliente_id IS NULL;
-- ALTER TABLE ventas VALIDATE CONSTRAINT ventas_ccf_con_cliente;
