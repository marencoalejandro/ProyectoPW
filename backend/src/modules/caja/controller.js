import { z } from 'zod';
import { decimal, fecha, id, idParam, parse } from '../../lib/validate.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import * as service from './service.js';

const abrirSchema = z
  .object({ sucursalId: id.optional(), montoInicial: decimal(2, { allowZero: true }) })
  .strict();

const monto = decimal(2, { allowZero: true });
const cierreSchema = z
  .object({ efectivoContado: monto, tarjetaReportada: monto, bitcoinReportado: monto })
  .strict();

const listarQuery = z.object({
  sucursalId: id.optional(),
  estado: z.enum(['ABIERTO', 'CERRADO']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function abrir(req, res) {
  const body = parse(abrirSchema, req.body);
  const sucursalId = resolverSucursal(req.user, body.sucursalId);
  const turno = await service.abrirTurno(req.user, { sucursalId, montoInicial: body.montoInicial });
  res.status(201).location(`${req.baseUrl}/${turno.id}`).json(turno);
}

export async function actual(req, res) {
  const { sucursalId: pedida } = parse(z.object({ sucursalId: id.optional() }), req.query);
  const sucursalId = resolverSucursal(req.user, pedida);
  res.json({ turno: await service.turnoActual(req.user, sucursalId) });
}

export async function listar(req, res) {
  const q = parse(listarQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json({ items: await service.listarTurnos({ ...q, sucursalId, limit: q.limite }) });
}

export async function obtener(req, res) {
  const { id: turnoId } = parse(idParam, req.params);
  res.json(await service.obtenerTurno(req.user, turnoId));
}

export async function cerrar(req, res) {
  const { id: turnoId } = parse(idParam, req.params);
  res.json(await service.cerrarTurno(req.user, turnoId, parse(cierreSchema, req.body)));
}
