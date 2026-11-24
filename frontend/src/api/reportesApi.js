import api from "./axios";

// Reportes de ventas (ADMIN). Gerente: su sucursal; central: sucursalId opcional.
// desde/hasta AAAA-MM-DD inclusive, máximo 366 días. No cuentan ventas anuladas.

const clean = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export async function reporteVentas({ desde, hasta, sucursalId }, { signal } = {}) {
  const { data } = await api.get("/reportes/ventas", { params: clean({ desde, hasta, sucursalId }), signal });
  return data;
}

export async function reporteProductos({ desde, hasta, sucursalId, limite = 10 }, { signal } = {}) {
  const { data } = await api.get("/reportes/productos", {
    params: clean({ desde, hasta, sucursalId, limite }),
    signal,
  });
  return data;
}
