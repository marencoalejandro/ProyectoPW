// Select nativo con el estilo de los campos. Las opciones van como hijos y el
// resto de atributos (value, onChange, disabled, aria-*) llega al <select>.
export default function Select({ className = "", children, ...props }) {
  return (
    <select className={`os-input bg-white ${className}`} {...props}>
      {children}
    </select>
  );
}

// Filtro en línea: etiqueta horizontal y ancho según el contenido.
export function InlineSelect({ label, className = "", selectClassName = "", children, ...props }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="font-semibold">{label}</span>
      <Select className={`w-auto ${selectClassName}`} {...props}>
        {children}
      </Select>
    </label>
  );
}
