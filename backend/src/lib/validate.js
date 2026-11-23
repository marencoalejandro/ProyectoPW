import { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Valida y normaliza `data` con un esquema zod. Ante un error responde 400
 * con la lista de campos inválidos, sin repetir los valores recibidos.
 */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const campos = result.error.issues.map((issue) => ({
    campo: issue.path.join('.') || '(cuerpo)',
    mensaje: issue.message,
  }));
  throw badRequest('DATOS_INVALIDOS', 'Revisá los datos enviados.', campos);
}

// ---------- Piezas reutilizables ----------

export const id = z.coerce.number().int().positive().max(2_147_483_647);
export const idParam = z.object({ id });

export const texto = (max, min = 1) => z.string().trim().min(min).max(max);
export const textoOpcional = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

/** Monto positivo con hasta `decimales` decimales, como texto o número. */
export const decimal = (decimales, { allowZero = false } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => new RegExp(String.raw`^\d{1,9}(\.\d{1,${decimales}})?$`).test(v), {
      message: `Debe ser un número con hasta ${decimales} decimales.`,
    })
    .refine((v) => allowZero || Number(v) > 0, { message: 'Debe ser mayor que cero.' });

export const email = z.string().trim().toLowerCase().max(100).pipe(z.email('Correo inválido.'));

export const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inválida.');

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
