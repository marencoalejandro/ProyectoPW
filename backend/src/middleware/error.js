import { AppError } from '../lib/errors.js';

// Restricciones de PostgreSQL que el frontend puede entender. Los mensajes no
// incluyen valores enviados (NIT, NRC…) para no filtrarlos a logs ni a la UI.
const UNIQUE_MESSAGES = {
  cliente_nit_key: ['NIT_DUPLICADO', 'Ya existe un cliente con ese NIT.'],
  cliente_nrc_key: ['NRC_DUPLICADO', 'Ese NRC ya está asignado a otro cliente.'],
  usuarios_email_key: ['EMAIL_DUPLICADO', 'Ya existe un usuario con ese correo.'],
  insumos_nombre_key: ['INSUMO_DUPLICADO', 'Ya existe un insumo con ese nombre.'],
  compras_proveedor_factura_key: ['FACTURA_DUPLICADA', 'Esa factura ya fue registrada para el proveedor.'],
  pagos_planilla_usuario_id_anio_mes_quincena_key: ['PLANILLA_DUPLICADA', 'Ese pago ya existe.'],
  turnos_caja_abierto_unico: ['TURNO_YA_ABIERTO', 'Ya tenés un turno abierto en esta sucursal.'],
  ventas_clave_operacion_key: ['OPERACION_DUPLICADA', 'Esa operación ya fue registrada.'],
};

function fromPostgres(error) {
  switch (error.code) {
    case '23505': {
      const [code, message] = UNIQUE_MESSAGES[error.constraint] ?? ['DUPLICADO', 'El registro ya existe.'];
      return new AppError(409, code, message);
    }
    case '23503':
      return new AppError(409, 'REFERENCIA_INVALIDA', 'El registro hace referencia a datos inexistentes o en uso.');
    case '23514':
    case '23502':
    case '22001':
    case '22003':
      return new AppError(400, 'DATOS_INVALIDOS', 'Los datos no cumplen las reglas del sistema.');
    case '40001':
    case '40P01':
      return new AppError(409, 'CONFLICTO_CONCURRENCIA', 'Otra operación modificó los mismos datos. Intentá de nuevo.');
    default:
      return null;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'));
}

// Express reconoce el manejador de errores por sus cuatro parámetros.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  let appError = error instanceof AppError ? error : null;

  if (!appError && error?.type === 'entity.parse.failed') {
    appError = new AppError(400, 'JSON_INVALIDO', 'El cuerpo de la petición no es JSON válido.');
  } else if (!appError && error?.type === 'entity.too.large') {
    appError = new AppError(413, 'CUERPO_DEMASIADO_GRANDE', 'La petición es demasiado grande.');
  } else if (!appError && typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    appError = fromPostgres(error);
  }

  if (!appError) {
    // Error inesperado: se registra con método y ruta, sin cuerpo ni query.
    console.error(`[error] ${req.method} ${req.path}:`, error);
    appError = new AppError(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado.');
  }

  const body = { error: { code: appError.code, message: appError.message } };
  if (appError.details !== undefined) body.error.details = appError.details;
  res.status(appError.status).json(body);
}
