import api from "./axios";

// Caja (turnos) y ventas. Contrato: docs/contratos-api.md y
// backend/src/modules/caja, backend/src/modules/ventas.

const withBranch = (sucursalId) => (sucursalId ? { sucursalId } : {});

/** GET /turnos/actual → turno ABIERTO del usuario (con arqueo) o null. */
export async function getTurnoActual({ sucursalId, signal } = {}) {
  const { data } = await api.get("/turnos/actual", { params: withBranch(sucursalId), signal });
  return data?.turno ?? null;
}

export async function getTurno(id, { signal } = {}) {
  const { data } = await api.get(`/turnos/${id}`, { signal });
  return data;
}

/** POST /turnos { sucursalId?, montoInicial } → 201 turno con arqueo. */
export async function abrirTurno({ sucursalId, montoInicial }) {
  const { data } = await api.post("/turnos", { ...withBranch(sucursalId), montoInicial });
  return data;
}

/** POST /turnos/:id/cierre { efectivoContado, tarjetaReportada, bitcoinReportado }. */
export async function cerrarTurno(id, conteos) {
  const { data } = await api.post(`/turnos/${id}/cierre`, conteos);
  return data;
}

/**
 * POST /ventas. El servidor decide precio, IVA, correlativo y datos fiscales.
 * `claveOperacion` (UUID) hace el cobro idempotente: reintentar el mismo
 * pedido con la misma clave devuelve la venta ya creada en vez de duplicarla.
 */
export async function registrarVenta({ turnoId, tipoDoc, metodoPago, clienteId, claveOperacion, items }) {
  const body = { turnoId, tipoDoc, metodoPago, claveOperacion, items };
  if (clienteId) body.clienteId = clienteId;
  const { data } = await api.post("/ventas", body);
  return data;
}

/** GET /ventas/:id → comprobante con la fotografía fiscal. */
export async function getVenta(id, { signal } = {}) {
  const { data } = await api.get(`/ventas/${id}`, { signal });
  return data;
}

/** GET /ventas?turnoId=&tipoDoc=&sucursalId= */
export async function listarVentas(params = {}, { signal } = {}) {
  const { data } = await api.get("/ventas", { params, signal });
  return data?.items ?? [];
}

/**
 * POST /ventas/:id/anulacion { motivo } (solo ADMIN, turno ABIERTO).
 * Devuelve el comprobante con anulada: true, stockRevertido y stockDevuelto.
 */
export async function anularVenta(id, motivo) {
  const { data } = await api.post(`/ventas/${id}/anulacion`, { motivo });
  return data;
}
