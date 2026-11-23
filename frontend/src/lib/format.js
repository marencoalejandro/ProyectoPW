const dateTime = new Intl.DateTimeFormat("es-SV", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/El_Salvador",
});

const dateOnly = new Intl.DateTimeFormat("es-SV", {
  dateStyle: "medium",
  timeZone: "America/El_Salvador",
});

export function formatDateTime(value) {
  if (!value) return "Sin datos";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin datos" : dateTime.format(date);
}

const dateOnlyUtc = new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Fechas sin hora ("AAAA-MM-DD") se muestran tal cual: new Date("2026-11-01")
 * es medianoche UTC y en El Salvador (UTC-6) correría un día hacia atrás.
 * Las marcas de tiempo ISO se muestran en la hora de El Salvador.
 */
export function formatDate(value) {
  if (!value) return "Sin datos";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateOnlyUtc.format(new Date(`${value}T00:00:00Z`));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin datos" : dateOnly.format(date);
}

/** Cantidades de inventario ("18.000" → "18", "2.500" → "2.5"). */
export function formatQuantity(value, unit) {
  const number = Number(value);
  const text = Number.isFinite(number)
    ? number.toLocaleString("es-SV", { maximumFractionDigits: 3 })
    : "Sin datos";
  return unit ? `${text} ${unit}` : text;
}

/** Fecha local de hoy en formato AAAA-MM-DD (para inputs type="date"). */
export function todayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
  }).format(new Date());
  return parts;
}

export const PAYMENT_LABELS = Object.freeze({
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  BITCOIN: "Bitcoin/Chivo Wallet",
});

export const DOC_LABELS = Object.freeze({
  FACTURA: "Factura consumidor final",
  CCF: "Crédito fiscal (CCF)",
});
