import { createContext, useContext } from "react";

export const CajaContext = createContext(null);

export function useCaja() {
  const value = useContext(CajaContext);
  if (!value) throw new Error("useCaja debe usarse dentro de CajaProvider");
  return value;
}
