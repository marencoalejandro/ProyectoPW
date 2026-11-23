import { Trash2 } from "lucide-react";

// Botón de ícono para quitar una línea de un formulario (insumos de una
// compra o de una receta). `label` es el nombre accesible, con el número de fila.
export default function RemoveRowButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      className="mb-0.5 flex size-11 items-center justify-center rounded-(--radius-control) border border-secondary hover:bg-secondary disabled:opacity-40"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={16} aria-hidden="true" />
    </button>
  );
}
