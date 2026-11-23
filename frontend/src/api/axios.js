import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Estado de sesión compartido con la capa de autenticación (authApi.js).
// `sessionGeneration` cambia en cada cambio de sesión y sirve para descartar
// tokens CSRF y errores 401 que llegan de una sesión anterior.
let csrfToken = null;
let sessionGeneration = 0;
let csrfLoader = null;
let unauthorizedHandler = null;

export const getSessionGeneration = () => sessionGeneration;

export function setCsrfToken(token, generation) {
  if (generation === sessionGeneration) csrfToken = token;
}

// Se llama en cada cambio de sesión: login, logout, expiración.
export function invalidateSession() {
  csrfToken = null;
  sessionGeneration += 1;
}

export const setCsrfLoader = (loader) => {
  csrfLoader = loader;
};

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

const SAFE_METHODS = new Set(["get", "head", "options"]);

function targetsApi(config) {
  const url = config.url ?? "";
  if (!/^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)) return true;
  const base = config.baseURL ?? "";
  return base !== "" && url.startsWith(base);
}

api.interceptors.request.use(async (config) => {
  config.sessionGeneration = sessionGeneration;

  const method = (config.method ?? "get").toLowerCase();
  if (SAFE_METHODS.has(method) || config.skipCsrf || !targetsApi(config)) {
    return config;
  }

  if (!csrfToken && csrfLoader) await csrfLoader();
  if (csrfToken) config.headers["X-CSRF-Token"] = csrfToken;
  config._csrfToken = csrfToken;
  return config;
});

// Un 403 CSRF_INVALIDO (backend reiniciado, cookie del nonce vencida) se
// recupera pidiendo un token nuevo y repitiendo UNA vez la escritura. Solo se
// descarta el token si es el mismo que llevó la petición: otra petición
// concurrente pudo haberlo renovado ya.
function isCsrfRejection(error) {
  const config = error?.config;
  return (
    error?.response?.status === 403 &&
    error.response.data?.error?.code === "CSRF_INVALIDO" &&
    config &&
    !SAFE_METHODS.has((config.method ?? "get").toLowerCase()) &&
    !config.skipCsrf &&
    !config._csrfRetried &&
    csrfLoader &&
    targetsApi(config) &&
    config.sessionGeneration === sessionGeneration
  );
}

// Renovación de sesión. El JWT de acceso dura pocos minutos; cuando una
// petición recibe 401, se pide UNA renovación (POST /auth/refresh, que usa la
// cookie HttpOnly del refresh token) y se repite la petición original.
// Varias peticiones que fallan a la vez comparten la misma renovación.
let refreshHandler = null;
let refreshPromise = null;

export const setRefreshHandler = (handler) => {
  refreshHandler = handler;
};

function refreshOnce() {
  refreshPromise ??= refreshHandler().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;

    if (isCsrfRejection(error)) {
      config._csrfRetried = true;
      if (csrfToken === config._csrfToken) csrfToken = null;
      return api(config);
    }

    const canRefresh =
      error?.response?.status === 401 &&
      config &&
      !config.skipRefresh &&
      !config._retried &&
      refreshHandler &&
      targetsApi(config) &&
      config.sessionGeneration === sessionGeneration;

    if (canRefresh) {
      config._retried = true;
      let renewed = false;
      try {
        await refreshOnce();
        renewed = true;
      } catch {
        // Sin renovación posible: sigue el manejo de sesión vencida.
      }
      // La repetición pasa otra vez por estos interceptores (con _retried).
      if (renewed) return api(config);
    }

    const expired =
      error?.response?.status === 401 &&
      !config?.skipUnauthorizedHandler &&
      config?.sessionGeneration === sessionGeneration;
    if (expired) unauthorizedHandler?.();
    return Promise.reject(error);
  },
);

export default api;