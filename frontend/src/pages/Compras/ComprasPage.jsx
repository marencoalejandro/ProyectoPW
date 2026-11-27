import { useState } from "react";
import { toast } from "react-hot-toast";
import { ClipboardList, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { isAdminCentral } from "../../auth/access";
import { useResource } from "../../hooks/useResource";
import { getCompra, listarCompras, listarProveedores, registrarCompra, registrarPago } from "../../api/comprasApi";
import { listarInsumos } from "../../api/catalogoApi";
import { PageHeader, Badge, TableScroll } from "../../components/ui/PageHeader";
import BranchSelect from "../../components/ui/BranchSelect";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { ConfirmDialog, Modal } from "../../components/ui/Modal";
import { SelectField, TextField } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import FormActions from "../../components/ui/FormActions";
import MetricCard from "../../components/ui/MetricCard";
import RemoveRowButton from "../../components/ui/RemoveRowButton";
import { InlineSelect } from "../../components/ui/Select";
import { apiMessage, fieldErrors } from "../../lib/apiError";
import { formatDate, formatQuantity, todayIso } from "../../lib/format";
import { formatMoney, isValidAmount } from "../../lib/money";
import { focusFirstInvalid } from "../../lib/forms";

export default function ComprasPage() {
  const { user } = useAuth();
  const central = isAdminCentral(user);
  const [filters, setFilters] = useState({ sucursalId: null, estadoPago: "PENDIENTE", proveedorId: "" });
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payBusy, setPayBusy] = useState(false);

  const proveedores = useResource((signal) => listarProveedores({ signal }), "proveedores");
  const compras = useResource(
    (signal) =>
      listarCompras(
        {
          sucursalId: central ? filters.sucursalId : undefined,
          estadoPago: filters.estadoPago,
          proveedorId: filters.proveedorId,
        },
        { signal },
      ),
    `compras-${filters.sucursalId}-${filters.estadoPago}-${filters.proveedorId}`,
  );

  async function confirmPay() {
    if (payBusy) return;
    setPayBusy(true);
    try {
      await registrarPago(paying.id);
      toast.success(`Factura ${paying.numeroFactura} marcada como pagada.`);
      setPaying(null);
      compras.reload();
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo registrar el pago."));
    } finally {
      setPayBusy(false);
    }
  }

  const resumen = compras.data?.resumen;

  return (
    <>
      <PageHeader
        title="Compras y cuentas por pagar"
        description="Facturas de proveedores. Registrar una compra suma las existencias en la sucursal."
        actions={
          <Button variant="primary" className="inline-flex items-center gap-2" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> Registrar compra
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {central && <BranchSelect value={filters.sucursalId} onChange={(v) => setFilters({ ...filters, sucursalId: v })} />}
        <InlineSelect label="Estado" value={filters.estadoPago} onChange={(e) => setFilters({ ...filters, estadoPago: e.target.value })}>
          <option value="PENDIENTE">Pendientes de pago</option>
          <option value="PAGADA">Pagadas</option>
          <option value="">Todas</option>
        </InlineSelect>
        <InlineSelect
          label="Proveedor"
          selectClassName="max-w-64"
          value={filters.proveedorId}
          onChange={(e) => setFilters({ ...filters, proveedorId: e.target.value })}
        >
          <option value="">Todos</option>
          {(proveedores.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </InlineSelect>
      </div>

      {resumen && (
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Facturas (filtro aplicado)" value={resumen.cantidad} />
          <MetricCard label="Total comprado (filtro aplicado)" value={formatMoney(resumen.total)} />
          <MetricCard label="Pendiente de pago (filtro aplicado)" value={formatMoney(resumen.totalPendiente)} />
        </dl>
      )}

      {compras.loading && !compras.data ? (
        <Loading label="Cargando compras…" />
      ) : compras.error ? (
        <ErrorState error={compras.error} onRetry={compras.reload} />
      ) : !compras.data?.items.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin facturas"
          onClearFilters={() => setFilters({ sucursalId: null, estadoPago: "", proveedorId: "" })}
        >
          No hay compras con estos filtros.
        </EmptyState>
      ) : (
        <TableScroll label="Compras">
          <DataTable
            caption="Compras"
            columns={[
              { key: "factura", label: "Factura" },
              { key: "proveedor", label: "Proveedor" },
              central && { key: "sucursal", label: "Sucursal" },
              { key: "fecha", label: "Fecha" },
              { key: "vence", label: "Vence" },
              { key: "total", label: "Total", numeric: true },
              { key: "estado", label: "Estado" },
              { key: "acciones", label: "Acciones", srOnly: true },
            ]}
          >
            {compras.data.items.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="font-semibold whitespace-nowrap">{c.numeroFactura}</th>
                <td>{c.proveedor}</td>
                {central && <td>{c.sucursal}</td>}
                <td className="whitespace-nowrap">{formatDate(c.creadoEn)}</td>
                <td className="whitespace-nowrap">{c.estadoPago === "PAGADA" ? `Pagada ${formatDate(c.fechaPago)}` : formatDate(c.fechaVencimiento)}</td>
                <td className="os-number">{formatMoney(c.total)}</td>
                <td>
                  {c.estadoPago === "PAGADA" ? (
                    <Badge tone="ok">Pagada</Badge>
                  ) : c.vencida ? (
                    <Badge tone="attention">Vencida</Badge>
                  ) : (
                    <Badge>Pendiente</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <Button variant="link" className="mr-3 text-sm" onClick={() => setDetailId(c.id)}>Detalle</Button>
                  {c.estadoPago === "PENDIENTE" && (
                    <Button variant="link" className="text-sm" onClick={() => setPaying(c)}>Registrar pago</Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Registrar compra" size="lg">
        {creating && (
          <CompraForm
            central={central}
            proveedores={proveedores.data ?? []}
            onDone={() => {
              setCreating(false);
              compras.reload();
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </Modal>

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title="Detalle de compra" size="lg">
        {detailId !== null && <CompraDetail id={detailId} />}
      </Modal>

      <ConfirmDialog
        open={Boolean(paying)}
        title="Registrar pago"
        confirmLabel="Marcar como pagada"
        busy={payBusy}
        onConfirm={confirmPay}
        onClose={() => setPaying(null)}
      >
        {paying && (
          <>
            Factura <strong>{paying.numeroFactura}</strong> de {paying.proveedor} por{" "}
            <strong>{formatMoney(paying.total)}</strong>. Se registra con la fecha de hoy y no vuelve a sumar existencias.
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function CompraDetail({ id }) {
  const compra = useResource((signal) => getCompra(id, { signal }), `compra-${id}`);
  if (compra.loading && !compra.data) return <Loading />;
  if (compra.error) return <ErrorState error={compra.error} onRetry={compra.reload} />;
  const c = compra.data;
  const items = c.items ?? c.detalle ?? [];
  return (
    <div className="grid gap-3 text-sm">
      <p>
        <strong>{c.numeroFactura}</strong> · {c.proveedor} · {c.sucursal} · {formatDate(c.creadoEn)}
      </p>
      <div className="os-scroll">
        <DataTable
          columns={[
            { key: "insumo", label: "Insumo" },
            { key: "cantidad", label: "Cantidad", numeric: true },
            { key: "costo", label: "Costo unitario", numeric: true },
          ]}
          footer={
            <tr>
              <th scope="row" colSpan={2}>Total</th>
              <td className="os-number font-bold">{formatMoney(c.total)}</td>
            </tr>
          }
        >
          {items.map((d) => (
            <tr key={d.insumoId}>
              <td>{d.insumo}</td>
              <td className="os-number">{formatQuantity(d.cantidad, d.unidad)}</td>
              <td className="os-number">US$ {Number(d.costoUnitario).toFixed(4)}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}

const EMPTY_LINE = { insumoId: "", cantidad: "", costoUnitario: "" };

function CompraForm({ central, proveedores, onDone, onCancel }) {
  const insumos = useResource((signal) => listarInsumos({}, { signal }), "insumos");
  const [form, setForm] = useState({
    sucursalId: null,
    proveedorId: "",
    numeroFactura: "",
    condicion: "CREDITO",
    fechaVencimiento: "",
  });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((sum, l) => sum + (Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0), 0);

  function validate() {
    const next = {};
    if (central && !form.sucursalId) next.sucursalId = "Elegí la sucursal que recibe la compra.";
    if (!form.proveedorId) next.proveedorId = "Elegí el proveedor.";
    if (!form.numeroFactura.trim()) next.numeroFactura = "Ingresá el número de factura.";
    if (form.condicion === "CREDITO" && form.fechaVencimiento && form.fechaVencimiento < todayIso()) {
      next.fechaVencimiento = "La fecha de vencimiento no puede ser pasada.";
    }
    lines.forEach((l, i) => {
      if (!l.insumoId) next[`items.${i}.insumoId`] = "Elegí el insumo.";
      if (!isValidAmount(l.cantidad, 3) || Number(l.cantidad) <= 0) next[`items.${i}.cantidad`] = "Cantidad inválida.";
      if (!isValidAmount(l.costoUnitario, 4) || Number(l.costoUnitario) <= 0) next[`items.${i}.costoUnitario`] = "Costo inválido.";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!validate()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setFormError("");
    const body = {
      proveedorId: Number(form.proveedorId),
      numeroFactura: form.numeroFactura.trim(),
      condicion: form.condicion,
      items: lines.map((l) => ({ insumoId: Number(l.insumoId), cantidad: l.cantidad.trim(), costoUnitario: l.costoUnitario.trim() })),
    };
    if (central) body.sucursalId = form.sucursalId;
    if (form.condicion === "CREDITO" && form.fechaVencimiento) body.fechaVencimiento = form.fechaVencimiento;
    try {
      await registrarCompra(body);
      toast.success("Compra registrada y existencias actualizadas.");
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo registrar la compra."));
    } finally {
      setBusy(false);
    }
  }

  const setLine = (i, changes) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...changes } : l)));

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {central && (
          <div className="sm:col-span-2">
            <BranchSelect value={form.sucursalId} onChange={(v) => setForm({ ...form, sucursalId: v })} allowAll={false} required />
            {errors.sucursalId && <p className="os-help font-semibold text-red-800">{errors.sucursalId}</p>}
          </div>
        )}
        <SelectField label="Proveedor" required value={form.proveedorId} error={errors.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}>
          <option value="">Elegí…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </SelectField>
        <TextField label="N.º de factura" required value={form.numeroFactura} error={errors.numeroFactura} onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })} />
        <SelectField label="Condición" value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })}>
          <option value="CREDITO">Crédito (queda pendiente)</option>
          <option value="CONTADO">Contado (pagada hoy)</option>
        </SelectField>
        {form.condicion === "CREDITO" && (
          <TextField
            label="Vencimiento"
            type="date"
            hint="Si lo dejás vacío vence a 30 días."
            min={todayIso()}
            value={form.fechaVencimiento}
            error={errors.fechaVencimiento}
            onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
          />
        )}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">Insumos</legend>
        {insumos.error && <Alert tone="error">No se pudieron cargar los insumos.</Alert>}
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto]">
            <SelectField
              label={`Insumo ${i + 1}`}
              className="col-span-2 sm:col-span-1"
              value={l.insumoId}
              error={errors[`items.${i}.insumoId`]}
              onChange={(e) => setLine(i, { insumoId: e.target.value })}
            >
              <option value="">Elegí…</option>
              {(insumos.data ?? []).map((ins) => (
                <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad})</option>
              ))}
            </SelectField>
            <TextField label="Cantidad" inputMode="decimal" value={l.cantidad} error={errors[`items.${i}.cantidad`]} onChange={(e) => setLine(i, { cantidad: e.target.value })} />
            <TextField label="Costo unit." inputMode="decimal" value={l.costoUnitario} error={errors[`items.${i}.costoUnitario`]} onChange={(e) => setLine(i, { costoUnitario: e.target.value })} />
            <RemoveRowButton
              label={`Quitar insumo ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <Button className="justify-self-start text-sm" onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
          Agregar insumo
        </Button>
      </fieldset>

      <p className="text-right text-sm">
        Total estimado: <strong className="tabular-nums">US$ {total.toFixed(2)}</strong>
        <span className="block text-xs text-slate-600">El servidor calcula el total definitivo.</span>
      </p>
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions onCancel={onCancel} busy={busy} submitLabel="Registrar compra" pendingLabel="Registrando…" />
    </form>
  );
}
