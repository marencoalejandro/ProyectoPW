// Fecha en línea para filtros (desde/hasta). Cada página conserva sus límites
// (min/max), la validación del rango y la consulta.
export default function DateFilter({ label, className = "", inputClassName = "", ...props }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="font-semibold">{label}</span>
      <input type="date" className={`os-input w-auto bg-white ${inputClassName}`} {...props} />
    </label>
  );
}
