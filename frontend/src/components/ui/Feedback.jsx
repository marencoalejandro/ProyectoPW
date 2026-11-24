import { AlertTriangle, CheckCircle2, Inbox, Loader2, PlugZap, RotateCcw } from "lucide-react";
import { apiMessage } from "../../lib/apiError";
import Button from "./Button";

export function Loading({ label = "Cargando…", className = "" }) {
  return (
    <p role="status" aria-busy="true" className={`flex items-center gap-2 py-6 text-sm text-slate-600 ${className}`}>
      <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </p>
  );
}

export function ErrorState({ error, message, onRetry, fallback }) {
  const text = message ?? apiMessage(error, fallback ?? "No se pudieron cargar los datos.");
  return (
    <div
      role="alert"
      className="os-alert os-error flex flex-wrap items-center justify-between gap-3 rounded-(--radius-control)"
    >
      <span className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        {text}
      </span>
      {onRetry && (
        <Button className="inline-flex items-center gap-2" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden="true" /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox, action, onClearFilters }) {
  return (
    <div className="os-empty grid justify-items-center gap-2 bg-white/50 py-10 text-center">
      <Icon size={30} className="text-edge" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-600">{children}</p>}
      {onClearFilters && (
        <Button className="mt-2" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      )}
      {action}
    </div>
  );
}

export function Alert({ tone = "info", children, className = "" }) {
  const toneClass = tone === "error" ? "os-error" : tone === "success" ? "os-success" : "bg-white/70";
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`os-alert ${toneClass} flex items-start gap-2 rounded-(--radius-control) text-sm ${className}`}
    >
      {tone !== "info" && <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Marca visible de una operación que aún no tiene endpoint en Express. */
export function PendingIntegration({ method, path, payload, children }) {
  return (
    <div className="os-alert flex items-start gap-2 rounded-(--radius-control) border border-dashed border-edge bg-white/60 text-sm">
      <PlugZap size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">Pendiente de integración</p>
        <p>{children}</p>
        <p className="mt-1 font-mono text-xs break-all">
          {method} {path}
          {payload ? ` · ${payload}` : ""}
        </p>
      </div>
    </div>
  );
}
