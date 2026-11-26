import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { fecha, id, parse } from '../../lib/validate.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import { METODO_ETIQUETAS } from '../caja/service.js';
import * as repo from './repository.js';

const MAX_DIAS = 366;

const periodoQuery = z.object({
  desde: fecha,
  hasta: fecha,
  sucursalId: id.optional(),
  limite: z.coerce.number().int().min(1).max(100).optional().default(10),
});

function leerPeriodo(req) {
  const q = parse(periodoQuery, req.query);
  if (q.desde > q.hasta) throw badRequest('PERIODO_INVALIDO', '"desde" no puede ser posterior a "hasta".');
  const dias = (Date.parse(q.hasta) - Date.parse(q.desde)) / 86_400_000 + 1;
  if (dias > MAX_DIAS) throw badRequest('PERIODO_INVALIDO', `El período no puede superar ${MAX_DIAS} días.`);
  // Gerentes: siempre su sucursal. Administración central: la pedida o todas.
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  return { ...q, sucursalId };
}

export async function ventas(req, res) {
  const periodo = leerPeriodo(req);
  const resumen = await repo.resumenVentas(periodo);
  res.json({
    periodo: { desde: periodo.desde, hasta: periodo.hasta, sucursalId: periodo.sucursalId },
    ...resumen,
    porMetodo: resumen.porMetodo.map((m) => ({ ...m, etiqueta: METODO_ETIQUETAS[m.metodoPago] })),
  });
}

export async function productos(req, res) {
  const periodo = leerPeriodo(req);
  res.json({
    periodo: { desde: periodo.desde, hasta: periodo.hasta, sucursalId: periodo.sucursalId },
    items: await repo.productosMasVendidos({ ...periodo, limit: periodo.limite }),
  });
}
