import { useSucursales } from "../../hooks/useSucursales";
import Select from "./Select";

// Filtro de sucursal para usuarios que ven varias (administración central y
// RR. HH.). Quien tiene sucursal fija no lo necesita: Express usa la suya.
export default function BranchSelect({ value, onChange, allowAll = true, label = "Sucursal", required = false }) {
  const sucursales = useSucursales();

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{label}</span>
      <Select
        className="w-auto min-w-44"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={sucursales.loading && !sucursales.data}
        required={required}
      >
        {allowAll ? <option value="">Todas</option> : <option value="">Elegí…</option>}
        {(sucursales.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Select>
      {sucursales.error && <span className="text-red-800">No se pudieron cargar las sucursales.</span>}
    </label>
  );
}
