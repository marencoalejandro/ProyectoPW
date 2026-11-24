import axios from "axios";

import api, {
  getSessionGeneration,
  setCsrfLoader,
  setCsrfToken,
  setRefreshHandler,
} from "./axios";

// Contrato con Express: todas las rutas son relativas a VITE_API_URL.
export const AUTH_ROUTES = Object.freeze({
  csrf: "/auth/csrf",
  login: "/auth/login",
  me: "/auth/me",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
});

// Poner en true solo cuando Express implemente "recordarme".
const SEND_REMEMBER = false;

export class AuthContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthContractError";
  }
}

// ---------- Perfil ----------

function cleanString(value, max = 200) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text !== "" && text.length <= max ? text : null;
}

function cleanId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return cleanString(value, 64);
}

// Lista explícita de campos: nada más del JSON llega a `user`.
// `cargo` no se toma como `role`: son datos distintos.
export function toUser(payload) {
  const raw = payload?.user;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AuthContractError(
      "La respuesta no incluye un perfil de usuario.",
    );
  }

  const id = cleanId(raw.id);
  if (id === null) {
    throw new AuthContractError("El perfil recibido no tiene un id válido.");
  }

  const name =
    cleanString(raw.name) ??
    cleanString(
      [raw.nombres, raw.apellidos]
        .map((part) => cleanString(part))
        .filter(Boolean)
        .join(" "),
    );

  return Object.freeze({
    id,
    name,
    email: cleanString(raw.email),
    // Rol de acceso (ADMIN, RRHH, EMPLEADO): decide permisos.
    role: cleanString(raw.role),
    // Puesto laboral (CAJERO, BARISTA, GERENTE, RRHH): solo informativo,
    // salvo la regla de Express de quién abre turno de caja.
    cargo: cleanString(raw.cargo),
    branchId: cleanId(raw.branchId ?? raw.id_sucursal),
    branchName: cleanString(raw.branchName),
  });
}

// ---------- CSRF ----------

let csrfRequest = null;

async function loadCsrfToken() {
  const generation = getSessionGeneration();
  if (csrfRequest?.generation === generation) return csrfRequest.promise;

  const promise = api
    .get(AUTH_ROUTES.csrf, { skipUnauthorizedHandler: true, skipRefresh: true })
    .then((response) => {
      const token = cleanString(response.data?.csrfToken, 512);
      if (!token) {
        throw new AuthContractError("La respuesta no incluye un token CSRF.");
      }
      setCsrfToken(token, generation);
    })
    .finally(() => {
      if (csrfRequest?.promise === promise) csrfRequest = null;
    });

  csrfRequest = { generation, promise };
  return promise;
}

// El interceptor de axios.js lo usa antes de la primera escritura,
// también después de recargar la página.
setCsrfLoader(loadCsrfToken);

// ---------- Renovación del JWT ----------

// Express rota el refresh token (cookie HttpOnly) y entrega un JWT nuevo en
// otra cookie HttpOnly. El JavaScript nunca ve ninguno de los dos.
setRefreshHandler(() =>
  api.post(AUTH_ROUTES.refresh, {}, { skipUnauthorizedHandler: true, skipRefresh: true }),
);

// ---------- Operaciones ----------

export async function fetchMe(signal) {
  const response = await api.get(AUTH_ROUTES.me, {
    signal,
    skipUnauthorizedHandler: true,
  });
  return toUser(response.data);
}

export async function login({ email, password, remember = false }) {
  const body = { email, password };
  if (SEND_REMEMBER && remember) body.remember = true;

  const response = await api.post(AUTH_ROUTES.login, body, {
    skipUnauthorizedHandler: true,
    skipRefresh: true,
  });

  const data = response.data;
  if (data && typeof data === "object" && "user" in data) return toUser(data);
  // Si Express responde solo el estado, se consulta el perfil una vez.
  return fetchMe();
}

export async function logout() {
  await api.post(AUTH_ROUTES.logout, {}, { skipUnauthorizedHandler: true, skipRefresh: true });
}

// ---------- Errores ----------

export const isCanceled = (error) => axios.isCancel(error);
export const isUnauthorized = (error) => error?.response?.status === 401;

function messageFromBody(data) {
  if (!data || typeof data !== "object") return null;
  const candidate =
    data.error?.message ??
    (typeof data.error === "string" ? data.error : null) ??
    data.message;
  return cleanString(candidate);
}

export function getErrorMessage(error, fallback) {
  if (error instanceof AuthContractError) {
    return "El servidor respondió con un formato inesperado.";
  }
  if (!axios.isAxiosError(error)) return fallback;

  const response = error.response;
  if (!response)
    return "No se pudo conectar con el servidor. Revisá tu conexión.";
  if (response.status === 429) {
    return "Demasiados intentos. Esperá un momento e intentá de nuevo.";
  }
  if (response.status >= 500) {
    return "El servidor no pudo procesar la solicitud. Intentá de nuevo más tarde.";
  }
  return messageFromBody(response.data) ?? fallback;
}
