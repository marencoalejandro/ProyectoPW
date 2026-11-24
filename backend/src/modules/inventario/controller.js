import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { booleanQuery, decimal, fecha, id, idParam, parse, texto, textoOpcional } from '../../lib/validate.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import * as repo from './repository.js';
import * as service from './service.js';

const recetaItem = z.object({ insumoId: id, cantidad: decimal(3) }).strict();

const platilloCampos = {
  nombre: texto(100),
  categoria: textoOpcional(50),
  precio: decimal(2, { allowZero: true }),
  tipo: z.enum(['ELABORADO', 'REVENTA']),
  activo: z.boolean(),
  imagen: textoOpcional(255),
};

const crearPlatilloSchema = z
  .object({
    ...platilloCampos,
    activo: platilloCampos.activo.optional(),
    receta: z.array(recetaItem).max(30),
  })
  .strict();

const actualizarPlatilloSchema = z
  .object(platilloCampos)
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Enviá al menos un campo.');

const recetaSchema = z.object({ items: z.array(recetaItem).max(30) }).strict();

const catalogoQuery = z.object({
  sucursalId: id.optional(),
  incluirInactivos: booleanQuery,
  categoria: z.string().trim().max(50).optional(),
});

const insumoSchema = z
  .object({
    nombre: texto(100),
    unidad: z.enum(['g', 'ml', 'unidad']),
    stockMinimo: decimal(3, { allowZero: true }).optional().default('0'),
  })
  .strict();

const actualizarInsumoSchema = z
  .object({ nombre: texto(100), activo: z.boolean() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Enviá al menos un campo.');

const stockQuery = z.object({
  sucursalId: id.optional(),
  estado: z.enum(['alertas', 'agotados']).optional(),
});

const stockMinimoSchema = z
  .object({ sucursalId: id.optional(), stockMinimo: decimal(3, { allowZero: true }) })
  .strict();

const cantidadConSigno = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d{1,9}(\.\d{1,3})?$/.test(v), 'Debe ser un número con hasta 3 decimales.')
  .refine((v) => Number(v) !== 0, 'No puede ser cero.');

const ajusteSchema = z
  .object({
    sucursalId: id.optional(),
    insumoId: id,
    motivo: z.enum(['MERMA', 'CADUCIDAD', 'DANO', 'CONTEO', 'CORRECCION']),
    cantidad: cantidadConSigno.optional(),
    stockContado: decimal(3, { allowZero: true }).optional(),
    nota: textoOpcional(200),
  })
  .strict()
  .refine((d) => (d.motivo === 'CONTEO') === (d.stockContado !== undefined), {
    path: ['stockContado'],
    message: 'Un CONTEO lleva stockContado; los demás motivos no.',
  })
  .refine((d) => (d.motivo === 'CONTEO') !== (d.cantidad !== undefined), {
    path: ['cantidad'],
    message: 'Indicá la cantidad (negativa sale, positiva entra), salvo en un CONTEO.',
  });

const movimientosQuery = z.object({
  sucursalId: id.optional(),
  insumoId: id.optional(),
  tipo: z.enum(['VENTA', 'ANULACION_VENTA', 'COMPRA', 'AJUSTE']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(500).optional().default(100),
});

// ---------- Platillos ----------

export async function listarPlatillos(req, res) {
  const q = parse(catalogoQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  const items = await repo.listPlatillos({
    sucursalId,
    incluirInactivos: q.incluirInactivos ?? false,
    categoria: q.categoria,
  });
  res.json({ items });
}

export async function obtenerPlatillo(req, res) {
  const { id: platilloId } = parse(idParam, req.params);
  const platillo = await repo.findPlatillo(platilloId);
  if (!platillo) throw notFound('El platillo no existe.');
  res.json({ ...platillo, receta: await repo.getReceta(platilloId) });
}

export async function obtenerReceta(req, res) {
  const { id: platilloId } = parse(idParam, req.params);
  if (!(await repo.findPlatillo(platilloId))) throw notFound('El platillo no existe.');
  res.json({ platilloId, items: await repo.getReceta(platilloId) });
}

export async function crearPlatillo(req, res) {
  const platillo = await service.crearPlatillo(parse(crearPlatilloSchema, req.body));
  res.status(201).json(platillo);
}

export async function actualizarPlatillo(req, res) {
  const { id: platilloId } = parse(idParam, req.params);
  res.json(await service.actualizarPlatillo(platilloId, parse(actualizarPlatilloSchema, req.body)));
}

export async function reemplazarReceta(req, res) {
  const { id: platilloId } = parse(idParam, req.params);
  const { items } = parse(recetaSchema, req.body);
  res.json(await service.reemplazarReceta(platilloId, items));
}

// ---------- Insumos ----------

export async function listarInsumos(req, res) {
  const { incluirInactivos } = parse(z.object({ incluirInactivos: booleanQuery }), req.query);
  res.json({ items: await repo.listInsumos({ incluirInactivos: incluirInactivos ?? false }) });
}

export async function crearInsumo(req, res) {
  res.status(201).json(await service.crearInsumo(parse(insumoSchema, req.body)));
}

export async function actualizarInsumo(req, res) {
  const { id: insumoId } = parse(idParam, req.params);
  const insumo = await repo.updateInsumo(insumoId, parse(actualizarInsumoSchema, req.body));
  if (!insumo) throw notFound('El insumo no existe.');
  res.json(insumo);
}

// ---------- Stock ----------

export async function listarStock(req, res) {
  const q = parse(stockQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json({ items: await repo.listStock({ sucursalId, estado: q.estado }) });
}

export async function listarAlertas(req, res) {
  const q = parse(stockQuery.omit({ estado: true }), req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json({ items: await repo.listStock({ sucursalId, estado: 'alertas' }) });
}

export async function actualizarStockMinimo(req, res) {
  const { insumoId } = parse(z.object({ insumoId: id }), req.params);
  const body = parse(stockMinimoSchema, req.body);
  const sucursalId = resolverSucursal(req.user, body.sucursalId);
  res.json(await service.actualizarStockMinimo(sucursalId, insumoId, body.stockMinimo));
}

export async function ajustarStock(req, res) {
  const body = parse(ajusteSchema, req.body);
  const sucursalId = resolverSucursal(req.user, body.sucursalId);
  res.status(201).json(await service.ajustarStock(req.user, { ...body, sucursalId }));
}

export async function listarMovimientos(req, res) {
  const q = parse(movimientosQuery, req.query);
  const sucursalId = resolverSucursal(req.user, q.sucursalId, { obligatoria: false });
  res.json({ items: await repo.listMovimientos({ ...q, sucursalId, limit: q.limite }) });
}
