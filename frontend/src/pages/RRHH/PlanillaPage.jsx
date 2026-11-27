import { useState } from "react";
import { toast } from "react-hot-toast";
import { FileText } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { consultarPlanilla, generarPlanilla } from "../../api/rrhhApi";
import { PageHeader, TableScroll } from "../../components/ui/PageHeader";
import BranchSelect from "../../components/ui/BranchSelect";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { ConfirmDialog } from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import { InlineSelect } from "../../components/ui/Select";
import { apiMessage } from "../../lib/apiError";
import { formatDate, todayIso } from "../../lib/format";
import { formatMoney } from "../../lib/money";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function currentPeriod() {
  const [y, m, d] = todayIso().split("-").map(Number);
  return { anio: Math.max(y, 2026), mes: m, quincena: d <= 15 ? 1 : 2 };
}

export default function PlanillaPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [sucursalId, setSucursalId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const planilla = useResource(
    (signal) => consultarPlanilla({ ...period, sucursalId }, { signal }),
    `planilla-${period.anio}-${period.mes}-${period.quincena}-${sucursalId}`,
  );

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await generarPlanilla({ ...period, sucursalId });
      setResult(data);
      toast.success(`Planilla generada: ${data.generados} pago(s) nuevo(s).`);
      setConfirming(false);
      planilla.reload();
    } catch (err) {
      setConfirming(false);
      toast.error(apiMessage(err, "No se pudo generar la planilla."));
    } finally {
      setBusy(false);
    }
  }

  const items = planilla.data?.items ?? [];
  const totales = planilla.data?.totales;
  const periodLabel = `${period.quincena === 1 ? "1.ª" : "2.ª"} quincena de ${MESES[period.mes - 1].toLowerCase()} de ${period.anio}`;

  return (
    <>
      <PageHeader
        title="Planilla quincenal"
        description="Bruto = salario mensual / 2. Deducciones: ISSS 3 % (tope $1,000 mensuales), AFP 7.25 % y renta según tabla quincenal."
        actions={
          <Button variant="primary" onClick={() => setConfirming(true)}>
            Generar planilla
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Año</span>
          <input
            type="number"
            min={2026}
            max={2100}
            className="os-input w-24 bg-white"
            value={period.anio}
            onChange={(e) => setPeriod({ ...period, anio: Number(e.target.value) || 2026 })}
          />
        </label>
        <InlineSelect label="Mes" value={period.mes} onChange={(e) => setPeriod({ ...period, mes: Number(e.target.value) })}>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </InlineSelect>
        <InlineSelect label="Quincena" value={period.quincena} onChange={(e) => setPeriod({ ...period, quincena: Number(e.target.value) })}>
          <option value={1}>1.ª (1–15)</option>
          <option value={2}>2.ª (16–fin)</option>
        </InlineSelect>
        <BranchSelect value={sucursalId} onChange={setSucursalId} />
      </div>

      {result && (
        <Alert tone="success" className="mb-4">
          Se generaron {result.generados} pago(s) nuevo(s); {result.existentes} ya existían y no se recalcularon.
        </Alert>
      )}

      {planilla.loading && !planilla.data ? (
        <Loading label="Cargando planilla…" />
      ) : planilla.error ? (
        <ErrorState error={planilla.error} onRetry={planilla.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="Sin pagos en este período">
          Todavía no se generó la planilla de la {periodLabel}.
        </EmptyState>
      ) : (
        <TableScroll label="Planilla del período">
          <DataTable
            caption={`Planilla de la ${periodLabel}`}
            columns={[
              { key: "empleado", label: "Empleado" },
              { key: "sucursal", label: "Sucursal" },
              { key: "bruto", label: "Bruto", numeric: true },
              { key: "isss", label: "ISSS", numeric: true },
              { key: "afp", label: "AFP", numeric: true },
              { key: "renta", label: "Renta", numeric: true },
              { key: "neto", label: "Neto", numeric: true },
              { key: "pago", label: "Pago" },
            ]}
            footer={
              totales && (
                <tr>
                  <th scope="row" colSpan={2}>Totales ({items.length})</th>
                  <td className="os-number font-bold">{formatMoney(totales.salarioBruto)}</td>
                  <td className="os-number font-bold">{formatMoney(totales.isss)}</td>
                  <td className="os-number font-bold">{formatMoney(totales.afp)}</td>
                  <td className="os-number font-bold">{formatMoney(totales.renta)}</td>
                  <td className="os-number font-bold">{formatMoney(totales.salarioNeto)}</td>
                  <td />
                </tr>
              )
            }
          >
            {items.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  <span className="block font-semibold">{p.nombre}</span>
                  <span className="block text-xs font-normal text-slate-600">{p.cargo}</span>
                </th>
                <td>{p.sucursal ?? "Central"}</td>
                <td className="os-number">{formatMoney(p.salarioBruto)}</td>
                <td className="os-number">{formatMoney(p.isss)}</td>
                <td className="os-number">{formatMoney(p.afp)}</td>
                <td className="os-number">{formatMoney(p.renta)}</td>
                <td className="os-number font-bold">{formatMoney(p.salarioNeto)}</td>
                <td className="whitespace-nowrap">{formatDate(p.fechaPago)}</td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}

      <ConfirmDialog
        open={confirming}
        title="Generar planilla"
        confirmLabel="Generar"
        busy={busy}
        onConfirm={generate}
        onClose={() => setConfirming(false)}
      >
        Se calcularán los pagos de la {periodLabel} para los empleados activos
        {sucursalId ? " de la sucursal elegida" : " de todas las sucursales"}. Los pagos que ya existan no se duplican ni se
        recalculan.
      </ConfirmDialog>
    </>
  );
}
