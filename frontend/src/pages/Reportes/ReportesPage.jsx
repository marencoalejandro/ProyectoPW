import { useState } from "react";
import { ChartColumn } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { isAdminCentral } from "../../auth/access";
import { useResource } from "../../hooks/useResource";
import { reporteProductos, reporteVentas } from "../../api/reportesApi";
import { PageHeader, TableScroll } from "../../components/ui/PageHeader";
import BranchSelect from "../../components/ui/BranchSelect";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DateFilter from "../../components/ui/DateFilter";
import MetricCard from "../../components/ui/MetricCard";
import { DOC_LABELS, formatDate, todayIso } from "../../lib/format";
import { formatMoney, toCents } from "../../lib/money";

const MAX_DAYS = 366;

// `porDia[].fecha` es "AAAA-MM-DD"; formatDate la muestra sin correr el día.
const dayLabel = (fecha) => formatDate(fecha);

function daysBetween(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

// Reportes de ventas (ADMIN): el gerente ve su sucursal; la administración
// central, todas o la que elija. Las ventas anuladas no cuentan.
export default function ReportesPage() {
  const { user } = useAuth();
  const central = isAdminCentral(user);
  const [range, setRange] = useState(() => ({ desde: `${todayIso().slice(0, 8)}01`, hasta: todayIso() }));
  const [sucursalId, setSucursalId] = useState(null);

  const valid = range.desde && range.hasta && range.desde <= range.hasta && daysBetween(range.desde, range.hasta) <= MAX_DAYS;
  const params = { ...range, sucursalId: central ? sucursalId : undefined };
  const key = valid ? `${range.desde}-${range.hasta}-${sucursalId}` : null;

  const ventas = useResource((signal) => reporteVentas(params, { signal }), key ? `rv-${key}` : null);
  const productos = useResource((signal) => reporteProductos({ ...params, limite: 10 }, { signal }), key ? `rp-${key}` : null);

  const periodLabel = `del ${formatDate(range.desde)} al ${formatDate(range.hasta)}`;
  const data = ventas.data;

  return (
    <>
      <PageHeader
        title="Reportes de ventas"
        description={`${central ? (sucursalId ? "Sucursal elegida" : "Todas las sucursales") : (user.branchName ?? "Tu sucursal")}, ${periodLabel}. No incluye ventas anuladas.`}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <DateFilter
          label="Desde"
          value={range.desde}
          max={range.hasta}
          onChange={(e) => setRange({ ...range, desde: e.target.value })}
        />
        <DateFilter
          label="Hasta"
          value={range.hasta}
          min={range.desde}
          max={todayIso()}
          onChange={(e) => setRange({ ...range, hasta: e.target.value })}
        />
        {central && <BranchSelect value={sucursalId} onChange={setSucursalId} />}
      </div>

      {!valid ? (
        <Alert tone="error">Elegí un período válido: «desde» no puede ser posterior a «hasta» y el máximo es de {MAX_DAYS} días.</Alert>
      ) : ventas.loading && !data ? (
        <Loading label="Calculando reporte…" />
      ) : ventas.error ? (
        <ErrorState error={ventas.error} onRetry={ventas.reload} />
      ) : !data ? null : (
        <div className="grid gap-6">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Ventas cobradas" value={data.totales.ventas} period={periodLabel} />
            <MetricCard label="Total con IVA" value={formatMoney(data.totales.total)} period={periodLabel} />
            <MetricCard label="IVA 13 %" value={formatMoney(data.totales.iva)} period={periodLabel} />
            <MetricCard label="Ticket promedio" value={formatMoney(data.totales.ticketPromedio)} period={periodLabel} />
          </dl>

          {data.anuladas?.ventas > 0 && (
            <p className="text-sm text-slate-600">
              Además hubo {data.anuladas.ventas} venta(s) anulada(s) por {formatMoney(data.anuladas.total)} que no se cuentan.
            </p>
          )}

          {data.totales.ventas === 0 ? (
            <EmptyState icon={ChartColumn} title="Sin ventas en el período">Probá con otro rango de fechas{central ? " u otra sucursal" : ""}.</EmptyState>
          ) : (
            <>
              <DailyChart days={data.porDia} periodLabel={periodLabel} />

              <div className="grid gap-6 lg:grid-cols-2">
                <BreakdownTable
                  title="Por medio de pago"
                  rows={data.porMetodo.map((m) => ({ key: m.metodoPago, label: m.etiqueta, ...m }))}
                />
                <BreakdownTable
                  title="Por tipo de comprobante"
                  rows={data.porTipoDoc.map((t) => ({ key: t.tipoDoc, label: DOC_LABELS[t.tipoDoc] ?? t.tipoDoc, ...t }))}
                />
                {central && !sucursalId && (
                  <BreakdownTable
                    title="Por sucursal"
                    rows={data.porSucursal.map((s) => ({ key: s.sucursalId, label: s.sucursal, ...s }))}
                  />
                )}
                <TopProducts productos={productos} />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Una sola serie (total por día): sin leyenda, el título la nombra. Cada barra
// muestra su valor al pasar el mouse o enfocarla, y la tabla equivalente queda
// disponible debajo (guía de diseño: gráficos con valores y tabla).
function DailyChart({ days, periodLabel }) {
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState(null);
  const max = Math.max(...days.map((d) => toCents(d.total)), 1);
  const peak = days.reduce((best, d) => (toCents(d.total) > toCents(best.total) ? d : best), days[0]);
  const current = active ?? peak;

  return (
    <section className="os-card bg-white/70" aria-labelledby="daily-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="daily-title" className="os-heading">Total vendido por día (US$, IVA incluido)</h3>
        <Button variant="link" className="text-sm" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Ocultar tabla" : "Ver como tabla"}
        </Button>
      </div>
      <p className="mb-2 text-sm" aria-live="polite">
        {active ? "Seleccionado" : "Día más alto"}: <strong>{dayLabel(current.fecha)}</strong> ·{" "}
        {formatMoney(current.total)} en {current.ventas} venta(s)
      </p>

      <div className="flex h-48 items-end gap-0.5 border-b border-edge/40 pt-2" role="list" aria-label={`Total por día, ${periodLabel}`}>
        {days.map((d) => {
          const pct = (toCents(d.total) / max) * 100;
          const label = `${dayLabel(d.fecha)}: ${formatMoney(d.total)}, ${d.ventas} venta(s)`;
          return (
            <button
              key={d.fecha}
              type="button"
              role="listitem"
              aria-label={label}
              title={label}
              onMouseEnter={() => setActive(d)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d)}
              onBlur={() => setActive(null)}
              className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                className={`block w-full rounded-t-[4px] ${active?.fecha === d.fecha ? "bg-primary" : "bg-link"} group-hover:bg-primary`}
                style={{ height: `${Math.max(pct, toCents(d.total) > 0 ? 1.5 : 0)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-600" aria-hidden="true">
        <span>{dayLabel(days[0].fecha)}</span>
        <span>{dayLabel(days[days.length - 1].fecha)}</span>
      </div>

      {showTable && (
        <div className="mt-4">
          <TableScroll label="Ventas por día">
            <DataTable
              caption={`Ventas por día, ${periodLabel}`}
              columns={[
                { key: "fecha", label: "Fecha" },
                { key: "ventas", label: "Ventas", numeric: true },
                { key: "subtotal", label: "Subtotal", numeric: true },
                { key: "iva", label: "IVA", numeric: true },
                { key: "total", label: "Total", numeric: true },
              ]}
            >
              {days.map((d) => (
                <tr key={d.fecha}>
                  <th scope="row" className="whitespace-nowrap">{dayLabel(d.fecha)}</th>
                  <td className="os-number">{d.ventas}</td>
                  <td className="os-number">{formatMoney(d.subtotal)}</td>
                  <td className="os-number">{formatMoney(d.iva)}</td>
                  <td className="os-number">{formatMoney(d.total)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
      )}
    </section>
  );
}

function BreakdownTable({ title, rows }) {
  return (
    <section aria-label={title}>
      <h3 className="os-heading mb-2">{title}</h3>
      <TableScroll label={title}>
        <DataTable
          caption={title}
          columns={[
            { key: "concepto", label: "Concepto" },
            { key: "ventas", label: "Ventas", numeric: true },
            { key: "iva", label: "IVA", numeric: true },
            { key: "total", label: "Total", numeric: true },
          ]}
        >
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="font-semibold">{r.label}</th>
              <td className="os-number">{r.ventas}</td>
              <td className="os-number">{formatMoney(r.iva)}</td>
              <td className="os-number">{formatMoney(r.total)}</td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>
    </section>
  );
}

function TopProducts({ productos }) {
  const items = productos.data?.items ?? [];
  return (
    <section aria-label="Productos más vendidos">
      <h3 className="os-heading mb-2">Productos más vendidos (unidades)</h3>
      {productos.loading && !productos.data ? (
        <Loading label="Cargando productos…" />
      ) : productos.error ? (
        <ErrorState error={productos.error} onRetry={productos.reload} />
      ) : items.length === 0 ? (
        <EmptyState title="Sin productos vendidos" />
      ) : (
        <TableScroll label="Productos más vendidos">
          <DataTable
            caption="Productos más vendidos"
            columns={[
              { key: "producto", label: "Producto" },
              { key: "unidades", label: "Unidades", numeric: true },
              { key: "total", label: "Total", numeric: true },
            ]}
          >
            {items.map((p) => (
              <tr key={p.platilloId}>
                <th scope="row">
                  <span className="block font-semibold">{p.nombre}</span>
                  <span className="block text-xs font-normal text-slate-600">{p.categoria ?? "Sin categoría"}</span>
                </th>
                <td className="os-number">{p.cantidad}</td>
                <td className="os-number">{formatMoney(p.total)}</td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}
    </section>
  );
}
