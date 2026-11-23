// Error de negocio o de petición con código HTTP y código estable para el
// frontend. Respuesta: {"error":{"code":"…","message":"…"}}.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Iniciá sesión para continuar.') =>
  new AppError(401, 'NO_AUTENTICADO', message);
export const forbidden = (message = 'No tenés permiso para esta operación.') =>
  new AppError(403, 'SIN_PERMISO', message);
export const notFound = (message = 'El recurso no existe.') => new AppError(404, 'NO_ENCONTRADO', message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
