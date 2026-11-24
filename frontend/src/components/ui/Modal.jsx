import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { X } from "lucide-react";
import Button from "./Button";

const noop = () => {};

export function Modal({ open, onClose, title, children, size = "md", busy = false }) {
  const width = size === "lg" ? "sm:max-w-3xl" : size === "sm" ? "sm:max-w-md" : "sm:max-w-xl";
  return (
    <Dialog open={open} onClose={busy ? noop : onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-veil transition-opacity duration-150 data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          transition
          className={`flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-t-2xl border border-edge/40 bg-canvas shadow-dialog transition duration-150 data-closed:translate-y-4 data-closed:opacity-0 motion-reduce:transition-none sm:rounded-(--radius-control)`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-primary/10 px-5 py-4">
            <DialogTitle className="os-heading">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
              className="flex size-10 items-center justify-center rounded-xl hover:bg-secondary disabled:opacity-50"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" busy={busy}>
      <div className="grid gap-4">
        <div className="text-sm">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          {/* En acciones de riesgo el foco inicial va a «Cancelar». */}
          <Button onClick={onClose} disabled={busy} autoFocus={danger}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} autoFocus={!danger} onClick={onConfirm} disabled={busy}>
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
