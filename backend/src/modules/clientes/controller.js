import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors.js';
import { booleanQuery, idParam, parse, texto } from '../../lib/validate.js';
import * as repo from './repository.js';

// NIT, NRC y teléfono viajan como cadenas. Se aceptan guiones y espacios
// (p. ej. "0614-111111-101-0") y se guardan solo los dígitos.
const digitos = (regex, mensaje) =>
  z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(regex, mensaje));

const opcional = (schema) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable()).optional();

const campos = {
  nombre: texto(150),
  nit: digitos(/^[0-9]{9}$|^[0-9]{14}$/, 'El NIT debe tener 9 o 14 dígitos.'),
  nrc: opcional(digitos(/^[0-9]{1,10}$/, 'El NRC debe tener de 1 a 10 dígitos.')),
  direccion: texto(255),
  giro: texto(150),
  tipo_contribuyente: z.enum(['natural', 'juridica']),
  tamano_contribuyente: z.enum(['pequeno', 'mediano', 'grande']),
  correo: opcional(z.string().trim().toLowerCase().max(120).pipe(z.email('Correo inválido.'))),
  telefono: opcional(digitos(/^[0-9]{8}$/, 'El teléfono debe tener 8 dígitos.')),
};

const crearSchema = z.object(campos).strict();
const actualizarSchema = z
  .object({ ...campos, activo: z.boolean() })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Enviá al menos un campo.');

const buscarSchema = z.object({
  buscar: z.string().trim().max(150).optional().default(''),
  incluirInactivos: booleanQuery,
  limite: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// Los identificadores fiscales nunca se escriben en logs (ver middleware/error.js).

export async function listar(req, res) {
  const q = parse(buscarSchema, req.query);
  const items = await repo.search({
    buscar: q.buscar,
    incluirInactivos: q.incluirInactivos ?? false,
    limit: q.limite,
  });
  res.json({ items });
}

export async function obtener(req, res) {
  const { id } = parse(idParam, req.params);
  const cliente = await repo.findById(id);
  if (!cliente) throw notFound('El cliente no existe.');
  res.json(cliente);
}

export async function crear(req, res) {
  const data = parse(crearSchema, req.body);
  const cliente = await repo.insert(data);
  res.status(201).location(`${req.baseUrl}/${cliente.id}`).json(cliente);
}

export async function actualizar(req, res) {
  const { id } = parse(idParam, req.params);
  const data = parse(actualizarSchema, req.body);
  if (data.nit === null) throw badRequest('DATOS_INVALIDOS', 'El NIT es obligatorio.');
  const cliente = await repo.update(id, data);
  if (!cliente) throw notFound('El cliente no existe.');
  res.json(cliente);
}
