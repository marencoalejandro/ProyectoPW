import Button from "./Button";

// Pie de formulario Cancelar / Enviar. El envío es type="submit" y ambos
// botones se bloquean mientras `busy`. En acciones destructivas el envío usa
// la variante danger y conviene dar el foco inicial a «Cancelar».
export default function FormActions({
  onCancel,
  cancelLabel = "Cancelar",
  submitLabel = "Guardar",
  pendingLabel = "Guardando…",
  busy = false,
  danger = false,
  focusCancel = false,
  className = "flex justify-end gap-2",
}) {
  return (
    <div className={className}>
      <Button onClick={onCancel} disabled={busy} autoFocus={focusCancel || undefined}>
        {cancelLabel}
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
        {busy ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}
