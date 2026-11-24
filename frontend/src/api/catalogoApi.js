import api from "./axios";

// Sucursales, menú (platillos y recetas), insumos e inventario por sucursal.

const clean = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export async function listarSucursales({ signal } = {}) {
  const { data } = await api.get("/sucursales", { signal });
  return data?.items ?? [];
}

/** GET /platillos → `disponibles` = unidades que alcanzan con el stock local. */
export async function listarPlatillos({ sucursalId, incluirInactivos, categoria } = {}, { signal } = {}) {
  const { data } = await api.get("/platillos", {
    params: clean({ sucursalId, incluirInactivos, categoria }),
    signal,
  });
  return data?.items ?? [];
}

export async function getPlatillo(id, { signal } = {}) {
  const { data } = await api.get(`/platillos/${id}`, { signal });
  return data;
}

export async function crearPlatillo(body) {
  const { data } = await api.post("/platillos", body);
  return data;
}

export async function actualizarPlatillo(id, body) {
  const { data } = await api.put(`/platillos/${id}`, body);
  return data;
}

export async function reemplazarReceta(id, items) {
  const { data } = await api.put(`/platillos/${id}/receta`, { items });
  return data;
}

export async function listarInsumos({ incluirInactivos } = {}, { signal } = {}) {
  const { data } = await api.get("/insumos", { params: clean({ incluirInactivos }), signal });
  return data?.items ?? [];
}

export async function crearInsumo(body) {
  const { data } = await api.post("/insumos", body);
  return data;
}

export async function actualizarInsumo(id, body) {
  const { data } = await api.put(`/insumos/${id}`, body);
  return data;
}

/** GET /inventario?sucursalId=&estado=alertas|agotados */
export async function listarStock({ sucursalId, estado } = {}, { signal } = {}) {
  const { data } = await api.get("/inventario", { params: clean({ sucursalId, estado }), signal });
  return data?.items ?? [];
}

export async function listarAlertas({ sucursalId } = {}, { signal } = {}) {
  const { data } = await api.get("/inventario/alertas", { params: clean({ sucursalId }), signal });
  return data?.items ?? [];
}

export async function actualizarStockMinimo(insumoId, { sucursalId, stockMinimo }) {
  const body = { stockMinimo };
  if (sucursalId) body.sucursalId = sucursalId;
  const { data } = await api.put(`/inventario/${insumoId}`, body);
  return data;
}

export const MOTIVOS_AJUSTE = Object.freeze([
  { value: "MERMA", label: "Merma" },
  { value: "CADUCIDAD", label: "Caducidad" },
  { value: "DANO", label: "Daño" },
  { value: "CONTEO", label: "Conteo físico" },
  { value: "CORRECCION", label: "Corrección" },
]);

export const TIPOS_MOVIMIENTO = Object.freeze({
  VENTA: "Venta",
  ANULACION_VENTA: "Anulación de venta",
  COMPRA: "Compra",
  AJUSTE: "Ajuste",
});

/**
 * POST /inventario/ajustes. CONTEO manda stockContado; los demás motivos
 * mandan cantidad con signo (negativa sale, positiva entra).
 */
export async function ajustarStock({ sucursalId, insumoId, motivo, cantidad, stockContado, nota }) {
  const body = { insumoId, motivo };
  if (sucursalId) body.sucursalId = sucursalId;
  if (motivo === "CONTEO") body.stockContado = stockContado;
  else body.cantidad = cantidad;
  if (nota) body.nota = nota;
  const { data } = await api.post("/inventario/ajustes", body);
  return data;
}

/** GET /inventario/movimientos (kardex), del más reciente al más antiguo. */
export async function listarMovimientos({ sucursalId, insumoId, tipo, desde, hasta, limite } = {}, { signal } = {}) {
  const { data } = await api.get("/inventario/movimientos", {
    params: clean({ sucursalId, insumoId, tipo, desde, hasta, limite }),
    signal,
  });
  return data?.items ?? [];
}
