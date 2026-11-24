import api from "./axios";

// Empleados (tabla usuarios) y planilla quincenal.

const clean = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export const CARGOS = Object.freeze(["CAJERO", "BARISTA", "GERENTE", "RRHH"]);
export const ROLES_ACCESO = Object.freeze(["EMPLEADO", "ADMIN", "RRHH"]);

export async function listarEmpleados({ sucursalId, cargo, incluirInactivos } = {}, { signal } = {}) {
  const { data } = await api.get("/empleados", {
    params: clean({ sucursalId, cargo, incluirInactivos }),
    signal,
  });
  return data?.items ?? [];
}

export async function crearEmpleado(body) {
  const { data } = await api.post("/empleados", body);
  return data;
}

export async function actualizarEmpleado(id, body) {
  const { data } = await api.put(`/empleados/${id}`, body);
  return data;
}

/** GET /planillas?anio=&mes=&quincena=&sucursalId= */
export async function consultarPlanilla({ anio, mes, quincena, sucursalId }, { signal } = {}) {
  const { data } = await api.get("/planillas", {
    params: clean({ anio, mes, quincena, sucursalId }),
    signal,
  });
  return data;
}

/** POST /planillas → { generados, existentes, items, totales } (no duplica pagos). */
export async function generarPlanilla({ anio, mes, quincena, sucursalId }) {
  const { data } = await api.post("/planillas", clean({ anio, mes, quincena, sucursalId }));
  return data;
}
