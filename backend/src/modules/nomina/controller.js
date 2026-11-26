import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { booleanQuery, decimal, email, id, idParam, parse, texto } from '../../lib/validate.js';
import { isAdminCentral } from '../../middleware/auth.js';
import { resolverSucursal } from '../../middleware/sucursal.js';
import { exigirAccesoSucursal } from '../../middleware/sucursal.js';
import * as repo from './repository.js';
import * as service from './service.js';

const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'La contraseña debe combinar letras y números.');

const campos = {
  nombre: texto(100),
  email,
  password,
  rol: z.enum(['ADMIN', 'RRHH', 'EMPLEADO']),
  cargo: z.enum(['BARISTA', 'CAJERO', 'GERENTE', 'RRHH']),
  salarioBase: decimal(2),
  sucursalId: id.nullable(),
};

const crearSchema = z.object(campos).strict();
const actualizarSchema = z
  .object({ ...campos, activo: z.boolean() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Enviá al menos un campo.');

const listarQuery = z.object({
  sucursalId: id.optional(),
  incluirInactivos: booleanQuery,
  cargo: z.enum(['BARISTA', 'CAJERO', 'GERENTE', 'RRHH']).optional(),
});

const periodoSchema = z.object({
  anio: z.coerce.number().int().min(2026).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  quincena: z.coerce.number().int().min(1).max(2),
  sucursalId: id.optional(),
});

// RR. HH. y administración central ven a todo el personal; la gerencia de
// una sucursal, solo a su equipo.
function sucursalParaEmpleados(user, pedida) {
  if (user.rol === 'RRHH' || isAdminCentral(user)) return pedida ?? null;
  return resolverSucursal(user, pedida);
}

export async function listarEmpleados(req, res) {
  const q = parse(listarQuery, req.query);
  const items = await repo.listEmpleados({
    sucursalId: sucursalParaEmpleados(req.user, q.sucursalId),
    incluirInactivos: q.incluirInactivos ?? false,
    cargo: q.cargo,
  });
  res.json({ items });
}

export async function obtenerEmpleado(req, res) {
  const { id: empleadoId } = parse(idParam, req.params);
  const empleado = await repo.findEmpleado(empleadoId);
  if (!empleado) throw notFound('El empleado no existe.');
  if (req.user.rol !== 'RRHH') exigirAccesoSucursal(req.user, empleado.sucursalId);
  res.json(empleado);
}

export async function crearEmpleado(req, res) {
  const empleado = await service.crearEmpleado(req.user, parse(crearSchema, req.body));
  res.status(201).location(`${req.baseUrl}/empleados/${empleado.id}`).json(empleado);
}

export async function actualizarEmpleado(req, res) {
  const { id: empleadoId } = parse(idParam, req.params);
  res.json(await service.actualizarEmpleado(req.user, empleadoId, parse(actualizarSchema, req.body)));
}

export async function generarPlanilla(req, res) {
  const { sucursalId, ...periodo } = parse(periodoSchema, req.body);
  res.status(201).json(await service.generarPlanilla(periodo, sucursalId ?? null));
}

export async function consultarPlanilla(req, res) {
  const { sucursalId, ...periodo } = parse(periodoSchema, req.query);
  res.json(await service.consultarPlanilla(periodo, sucursalId ?? null));
}
