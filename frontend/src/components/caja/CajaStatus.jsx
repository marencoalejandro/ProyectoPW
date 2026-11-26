import { Lock, MapPin, Unlock } from "lucide-react";
import { formatDateTime } from "../../lib/format";
import { useCaja } from "../../pages/Caja/cajaContext";
import { Badge } from "../ui/PageHeader";
import { InlineSelect } from "../ui/Select";

// Barra fija de Caja: sucursal y estado del turno siempre visibles.
export default function CajaStatus() {
  const { branchId, branchName, canPickBranch, selectBranch, sucursales, turno } = useCaja();
  const current = turno.data;

  let status;
  if (!branchId) status = <Badge>Elegí una sucursal</Badge>;
  else if (turno.loading && current === undefined) status = <Badge>Consultando turno…</Badge>;
  else if (turno.error) status = <Badge tone="attention">Estado desconocido</Badge>;
  else if (current)
    status = (
      <Badge tone="ok" className="inline-flex items-center gap-1">
        <Unlock size={14} aria-hidden="true" /> Turno abierto · #{current.id} desde {formatDateTime(current.abiertoEn)}
      </Badge>
    );
  else
    status = (
      <Badge tone="attention" className="inline-flex items-center gap-1">
        <Lock size={14} aria-hidden="true" /> Caja cerrada
      </Badge>
    );

  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-(--radius-control) border border-secondary bg-white/70 px-4 py-3"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <MapPin size={16} className="shrink-0" aria-hidden="true" />
        {canPickBranch ? (
          <InlineSelect
            label="Sucursal:"
            selectClassName="min-h-10! py-1"
            value={branchId ?? ""}
            onChange={(e) => selectBranch(e.target.value)}
            disabled={sucursales.loading}
          >
            <option value="">Elegí…</option>
            {(sucursales.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </InlineSelect>
        ) : (
          <span>
            <span className="font-semibold">Sucursal:</span> {branchName ?? "Sin sucursal asignada"}
          </span>
        )}
      </div>
      <div className="text-sm">{status}</div>
    </div>
  );
}
