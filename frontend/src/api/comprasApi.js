import api from "./axios";

// Proveedores, compras y cuentas por pagar (rol ADMIN).

const clean = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export async function listarProveedores({ signal } = {}) {
  const { data } = await api.get("/proveedores", { signal });
  return data?.items ?? [];
}

export async function crearProveedor(body) {
  const { data } = await api.post("/proveedores", body);
  return data;
}

export async function actualizarProveedor(id, body) {
  const { data } = await api.put(`/proveedores/${id}`, body);
  return data;
}

/** GET /compras → { items, resumen: { cantidad, total, totalPendiente } } */
export async function listarCompras({ sucursalId, estadoPago, proveedorId } = {}, { signal } = {}) {
  const { data } = await api.get("/compras", {
    params: clean({ sucursalId, estadoPago, proveedorId }),
    signal,
  });
  return { items: data?.items ?? [], resumen: data?.resumen ?? null };
}

export async function getCompra(id, { signal } = {}) {
  const { data } = await api.get(`/compras/${id}`, { signal });
  return data;
}

export async function registrarCompra(body) {
  const { data } = await api.post("/compras", body);
  return data;
}

export async function registrarPago(id, { fechaPago } = {}) {
  const { data } = await api.put(`/compras/${id}/pago`, fechaPago ? { fechaPago } : {});
  return data;
}
