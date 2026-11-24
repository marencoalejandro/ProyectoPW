import { useResource } from "./useResource";
import { listarSucursales } from "../api/catalogoApi";

/** Sedes visibles para el usuario (GET /sucursales). */
export function useSucursales() {
  return useResource((signal) => listarSucursales({ signal }), "sucursales");
}
