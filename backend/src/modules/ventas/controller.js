import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { booleanQuery, fecha, id, idParam, parse, texto } from '../../lib/validate.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import * as service from './service.js';

const ventaSchema = z
  .object({
    sucursalId: id.optional(),
    turnoId: id,
    tipoDoc: z.enum(['FACTURA', 'CCF']),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'BITCOIN']),
    clienteId: id.optional(),
    claveOperacion: z.uuid('La clave de operación debe ser un UUID.').optional(),
    items: z
      .array(
        z
          .object({
            platilloId: id,
            cantidad: z.number().int('La cantidad debe ser un entero.').positive().max(999),
          })
          .strict(),
      )
      .min(1, 'El pedido está vacío.')
      .max(50),
  })
  .strict();

const listarQuery = z.object({
  sucursalId: id.optional(),
  turnoId: id.optional(),
  tipoDoc: z.enum(['FACTURA', 'CCF']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  anulada: booleanQuery,
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function registrar(req, res) {
  const pedido = parse(ventaSchema, req.body);

  // La clave de reintento puede venir en el cuerpo o en Idempotency-Key.
  const header = req.get('Idempotency-Key');
  if (header !== undefined) {
    const clave = parse(z.object({ clave: z.uuid() }), { clave: header }).clave;
    if (pedido.claveOperacion && pedido.claveOperacion !== clave) {
      throw badRequest('CLAVE_INCONSISTENTE', 'La clave del encabezado y la del cuerpo no coinciden.');
    }
    pedido.claveOperacion = clave;
  }

  const { venta, repetida } = await service.registrarVenta(req.user, pedido);
  res
    .status(repetida ? 200 : 201)
    .location(`${req.baseUrl}/${venta.id}`)
    .json(venta);
}

export async function obtener(req, res) {
  const { id: ventaId } = parse(idParam, req.params);
  res.json(await service.obtenerComprobante(req.user, ventaId));
}

export async function listar(req, res) {
  const q = parse(listarQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json({ items: await service.listarVentas({ ...q, sucursalId, limit: q.limite }) });
}

const anulacionSchema = z.object({ motivo: texto(200, 5) }).strict();

export async function anular(req, res) {
  const { id: ventaId } = parse(idParam, req.params);
  const { motivo } = parse(anulacionSchema, req.body);
  res.json(await service.anularVenta(req.user, ventaId, motivo));
}
