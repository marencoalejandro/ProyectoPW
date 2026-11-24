import axios from "axios";
import { getErrorMessage } from "../api/authApi";

// Errores de Express: {"error":{"code","message","details"}}.

export function errorCode(error) {
  return axios.isAxiosError(error) ? (error.response?.data?.error?.code ?? null) : null;
}

export function errorStatus(error) {
  return axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
}

export function errorDetails(error) {
  const details = axios.isAxiosError(error) ? error.response?.data?.error?.details : null;
  return Array.isArray(details) ? details : [];
}

/** details de 400 DATOS_INVALIDOS → { campo: mensaje } para marcar formularios. */
export function fieldErrors(error) {
  const result = {};
  for (const item of errorDetails(error)) {
    if (item && typeof item.campo === "string" && typeof item.mensaje === "string") {
      result[item.campo] ??= item.mensaje;
    }
  }
  return result;
}

export function apiMessage(error, fallback = "No se pudo completar la operación.") {
  if (errorStatus(error) === 403 && errorCode(error) !== "CSRF_INVALIDO") {
    return getErrorMessage(error, "No tenés permiso para esta operación.");
  }
  return getErrorMessage(error, fallback);
}

/** Genera una clave de operación (UUID v4) para reintentos idempotentes. */
export function newOperationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
