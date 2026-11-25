import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { decimal, fecha, id, idParam, parse, texto, textoOpcional } from '../../lib/validate.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import * as repo from './repository.js';
import * as service from './service.js';

const proveedorSchema = z.object({ nombre: texto(100), nit: textoOpcional(20) }).strict();
const actualizarProveedorSchema = proveedorSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Enviá al menos un campo.');

const compraSchema = z
  .object({
    sucursalId: id.optional(),
    proveedorId: id,
    numeroFactura: texto(30),
    condicion: z.enum(['CONTADO', 'CREDITO']),
    fechaVencimiento: fecha.optional(),
    items: z
      .array(
        z
          .object({ insumoId: id, cantidad: decimal(3), costoUnitario: decimal(4) })
          .strict(),
      )
      .min(1, 'La factura necesita al menos un insumo.')
      .max(100),
  })
  .strict();

const listarQuery = z.object({
  sucursalId: id.optional(),
  estadoPago: z.enum(['PENDIENTE', 'PAGADA']).optional(),
  proveedorId: id.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const pagoSchema = z.object({ fechaPago: fecha.optional() }).strict();

// ---------- Proveedores ----------

export async function listarProveedores(_req, res) {
  res.json({ items: await repo.listProveedores() });
}

export async function crearProveedor(req, res) {
  res.status(201).json(await repo.insertProveedor(parse(proveedorSchema, req.body)));
}

export async function actualizarProveedor(req, res) {
  const { id: proveedorId } = parse(idParam, req.params);
  const proveedor = await repo.updateProveedor(proveedorId, parse(actualizarProveedorSchema, req.body));
  if (!proveedor) throw notFound('El proveedor no existe.');
  res.json(proveedor);
}

// ---------- Compras ----------

export async function registrarCompra(req, res) {
  const body = parse(compraSchema, req.body);
  const sucursalId = resolverSucursal(req.user, body.sucursalId);
  const compra = await service.registrarCompra(req.user, { ...body, sucursalId });
  res.status(201).location(`${req.baseUrl}/compras/${compra.id}`).json(compra);
}

export async function listarCompras(req, res) {
  const q = parse(listarQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json(await repo.listCompras({ ...q, sucursalId, limit: q.limite }));
}

export async function obtenerCompra(req, res) {
  const { id: compraId } = parse(idParam, req.params);
  res.json(await service.obtenerCompra(req.user, compraId));
}

export async function registrarPago(req, res) {
  const { id: compraId } = parse(idParam, req.params);
  const { fechaPago } = parse(pagoSchema, req.body);
  res.json(await service.registrarPago(req.user, compraId, fechaPago));
}
