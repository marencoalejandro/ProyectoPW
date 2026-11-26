import { useState } from "react";
import { toast } from "react-hot-toast";
import { History, Package } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { can, isAdminCentral } from "../../auth/access";
import { useResource } from "../../hooks/useResource";
import {
  actualizarStockMinimo,
  ajustarStock,
  listarMovimientos,
  listarStock,
  MOTIVOS_AJUSTE,
  TIPOS_MOVIMIENTO,
} from "../../api/catalogoApi";

import { PageHeader, Badge, TableScroll } from "../../components/ui/PageHeader";
import BranchSelect from "../../components/ui/BranchSelect";
import { EmptyState, ErrorState, Loading, Alert } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { SelectField, TextField } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DateFilter from "../../components/ui/DateFilter";
import FormActions from "../../components/ui/FormActions";
import { InlineSelect } from "../../components/ui/Select";

import { apiMessage, errorCode, fieldErrors } from "../../lib/apiError";
import { formatDateTime, formatQuantity, todayIso } from "../../lib/format";
import { isValidAmount } from "../../lib/money";
import { focusFirstInvalid } from "../../lib/forms";

const TABS = [
  { id: "", label: "Existencias" },
  { id: "alertas", label: "Stock mínimo" },
  { id: "agotados", label: "Agotados" },
];

export default function InventarioPage() {
  const { user } = useAuth();
  const central = isAdminCentral(user);
  const [sucursalId, setSucursalId] = useState(null);
  const [estado, setEstado] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [view, setView] = useState("stock"); // stock | kardex
  const [kardexInsumo, setKardexInsumo] = useState("");

  const stock = useResource(
    (signal) => listarStock({ sucursalId: central ? sucursalId : undefined, estado }, { signal }),
    `stock-${sucursalId}-${estado}`,
  );
  const alertas = useResource(
    (signal) => listarStock({ sucursalId: central ? sucursalId : undefined, estado: "alertas" }, { signal }),
    `alertas-${sucursalId}`,
  );

  const rows = (stock.data ?? []).filter(
    (r) => !search.trim() || r.insumo.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const showBranch = central && !sucursalId;

  return (
    <>
      <PageHeader
        title="Inventario"
        description={central ? "Existencias por sucursal." : `Existencias de ${user.branchName ?? "tu sucursal"}.`}
        actions={central && <BranchSelect value={sucursalId} onChange={setSucursalId} />}
      />

      <div className="mb-4 flex gap-1 rounded-(--radius-control) border border-secondary bg-white p-1 sm:w-fit" role="group" aria-label="Vista de inventario">
        {[
          { id: "stock", label: "Existencias" },
          { id: "kardex", label: "Movimientos (kardex)" },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${view === v.id ? "bg-primary text-canvas" : "hover:bg-canvas"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "kardex" ? (
        <Kardex
          central={central}
          sucursalId={sucursalId}
          insumoId={kardexInsumo}
          onInsumoChange={setKardexInsumo}
          insumos={stock.data ?? []}
        />
      ) : (
      <>

      {alertas.data?.length > 0 && (
        <Alert tone="error" className="mb-4">
          {alertas.data.length} insumo(s) en o bajo el stock mínimo
          {showBranch ? " entre todas las sucursales" : ""}.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setEstado("alertas")}>
            Ver alertas
          </button>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-(--radius-control) border border-secondary bg-white p-1" role="group" aria-label="Filtro de estado">
          {TABS.map((t) => (
            <button
              key={t.id || "todas"}
              type="button"
              aria-pressed={estado === t.id}
              onClick={() => setEstado(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${estado === t.id ? "bg-primary text-canvas" : "hover:bg-canvas"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="os-input w-full bg-white sm:w-64"
          placeholder="Buscar insumo"
          aria-label="Buscar insumo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {stock.loading && !stock.data ? (
        <Loading label="Cargando inventario…" />
      ) : stock.error ? (
        <ErrorState error={stock.error} onRetry={stock.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin insumos"
          onClearFilters={estado || search ? () => { setEstado(""); setSearch(""); } : undefined}
        >
          {estado ? "No hay insumos en este estado." : "No hay insumos que coincidan."}
        </EmptyState>
      ) : (
        <TableScroll label="Existencias de insumos">
          <DataTable
            caption="Existencias de insumos"
            columns={[
              { key: "insumo", label: "Insumo" },
              showBranch && { key: "sucursal", label: "Sucursal" },
              { key: "stock", label: "Stock actual", numeric: true },
              { key: "minimo", label: "Mínimo", numeric: true },
              { key: "estado", label: "Estado" },
              { key: "acciones", label: "Acciones", srOnly: true },
            ]}
          >
            {rows.map((r) => (
              <tr key={`${r.sucursalId}-${r.insumoId}`}>
                <th scope="row" className="font-semibold">{r.insumo}</th>
                {showBranch && <td>{r.sucursal}</td>}
                <td className="os-number">{formatQuantity(r.stockActual, r.unidad)}</td>
                <td className="os-number">{formatQuantity(r.stockMinimo, r.unidad)}</td>
                <td>
                  {r.agotado ? <Badge tone="attention">Agotado</Badge> : r.alerta ? <Badge tone="attention">Bajo mínimo</Badge> : <Badge tone="ok">OK</Badge>}
                </td>
                <td className="whitespace-nowrap">
                  {can(user, "ajustarStock") && (
                    <Button variant="link" className="mr-3 text-sm" onClick={() => setAdjusting(r)}>
                      Ajustar
                    </Button>
                  )}
                  {can(user, "editarStockMinimo") && (
                    <Button variant="link" className="mr-3 text-sm" onClick={() => setEditing(r)}>
                      Editar mínimo
                    </Button>
                  )}
                  <Button
                    variant="link"
                    className="text-sm"
                    onClick={() => {
                      setKardexInsumo(String(r.insumoId));
                      setView("kardex");
                    }}
                  >
                    Historial
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}
      </>
      )}

      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title="Ajustar existencias" size="sm">
        {adjusting && (
          <AjusteForm
            row={adjusting}
            central={central}
            onDone={() => {
              setAdjusting(null);
              stock.reload();
              alertas.reload();
            }}
            onCancel={() => setAdjusting(null)}
          />
        )}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Stock mínimo" size="sm">
        {editing && (
          <StockMinimoForm
            row={editing}
            central={central}
            onDone={() => {
              setEditing(null);
              stock.reload();
              alertas.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function StockMinimoForm({ row, central, onDone, onCancel }) {
  const [value, setValue] = useState(String(Number(row.stockMinimo)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!isValidAmount(value, 3)) {
      setError("Ingresá una cantidad válida (hasta 3 decimales).");
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await actualizarStockMinimo(row.insumoId, {
        sucursalId: central ? row.sucursalId : undefined,
        stockMinimo: value.trim(),
      });
      toast.success("Stock mínimo actualizado.");
      onDone();
    } catch (err) {
      setError(fieldErrors(err).stockMinimo ?? apiMessage(err, "No se pudo actualizar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm">
        <strong>{row.insumo}</strong> en {row.sucursal}. Stock actual: {formatQuantity(row.stockActual, row.unidad)}.
      </p>
      <TextField
        label={`Stock mínimo (${row.unidad})`}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error}
      />
      <FormActions onCancel={onCancel} busy={busy} />
    </form>
  );
}

const MOTIVO_LABELS = Object.fromEntries(MOTIVOS_AJUSTE.map((m) => [m.value, m.label]));

// Ajuste manual: CONTEO manda lo contado y Express calcula la diferencia; los
// demás motivos mandan la cantidad con signo (salida negativa, entrada positiva).
function AjusteForm({ row, central, onDone, onCancel }) {
  const [form, setForm] = useState({ motivo: "MERMA", direccion: "SALIDA", cantidad: "", stockContado: "", nota: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const isConteo = form.motivo === "CONTEO";
  const actual = Number(row.stockActual);

  const preview = isConteo
    ? isValidAmount(form.stockContado, 3) ? Number(form.stockContado) : null
    : isValidAmount(form.cantidad, 3) ? actual + (form.direccion === "SALIDA" ? -1 : 1) * Number(form.cantidad) : null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const next = {};
    if (isConteo && !isValidAmount(form.stockContado, 3)) next.stockContado = "Ingresá lo contado (hasta 3 decimales).";
    if (!isConteo && (!isValidAmount(form.cantidad, 3) || Number(form.cantidad) <= 0)) next.cantidad = "Ingresá una cantidad mayor que cero.";
    if (!isConteo && preview !== null && preview < 0) next.cantidad = "El stock no puede quedar negativo.";
    if (form.nota.length > 200) next.nota = "Máximo 200 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const result = await ajustarStock({
        sucursalId: central ? row.sucursalId : undefined,
        insumoId: row.insumoId,
        motivo: form.motivo,
        cantidad: isConteo ? undefined : `${form.direccion === "SALIDA" ? "-" : ""}${form.cantidad.trim()}`,
        stockContado: isConteo ? form.stockContado.trim() : undefined,
        nota: form.nota.trim() || undefined,
      });
      toast.success(
        `${result.insumo}: ${formatQuantity(result.stockAnterior, result.unidad)} → ${formatQuantity(result.stockActual, result.unidad)}.`,
      );
      onDone();
    } catch (err) {
      const code = errorCode(err);
      setErrors(fieldErrors(err));
      setFormError(
        code === "AJUSTE_SIN_CAMBIO"
          ? "Lo contado coincide con el stock registrado: no hay nada que ajustar."
          : code === "STOCK_NEGATIVO"
            ? "Con ese ajuste el stock quedaría negativo."
            : apiMessage(err, "No se pudo registrar el ajuste."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm">
        <strong>{row.insumo}</strong> en {row.sucursal}. Stock registrado: {formatQuantity(row.stockActual, row.unidad)}.
      </p>
      <SelectField label="Motivo" required value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
        {MOTIVOS_AJUSTE.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </SelectField>
      {isConteo ? (
        <TextField
          label={`Stock contado (${row.unidad})`}
          required
          inputMode="decimal"
          value={form.stockContado}
          error={errors.stockContado}
          onChange={(e) => setForm({ ...form, stockContado: e.target.value })}
        />
      ) : (
        <>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-sm font-semibold">Movimiento</legend>
            {[
              { id: "SALIDA", label: "Sale del inventario" },
              { id: "ENTRADA", label: "Entra al inventario" },
            ].map((d) => (
              <label
                key={d.id}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-(--radius-control) border px-2 text-center text-sm font-semibold has-focus-visible:outline-3 has-focus-visible:outline-primary ${
                  form.direccion === d.id ? "border-primary bg-accent/30" : "border-secondary bg-white"
                }`}
              >
                <input
                  type="radio"
                  className="os-sr"
                  name="direccion"
                  checked={form.direccion === d.id}
                  onChange={() => setForm({ ...form, direccion: d.id })}
                />
                {d.label}
              </label>
            ))}
          </fieldset>
          <TextField
            label={`Cantidad (${row.unidad})`}
            required
            inputMode="decimal"
            value={form.cantidad}
            error={errors.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
          />
        </>
      )}
      <TextField
        label="Nota"
        hint="Opcional, hasta 200 caracteres."
        maxLength={200}
        value={form.nota}
        error={errors.nota}
        onChange={(e) => setForm({ ...form, nota: e.target.value })}
      />
      {preview !== null && (
        <p className="text-sm" aria-live="polite">
          Variación: <strong>{formatQuantity(preview - actual, row.unidad)}</strong> · stock resultante:{" "}
          <strong>{formatQuantity(preview, row.unidad)}</strong>
        </p>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions onCancel={onCancel} busy={busy} submitLabel="Registrar ajuste" />
    </form>
  );
}

function monthStartIso() {
  return `${todayIso().slice(0, 8)}01`;
}

// Kardex: historial de movimientos de stock, del más reciente al más antiguo.
function Kardex({ central, sucursalId, insumoId, onInsumoChange, insumos }) {
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState(monthStartIso);
  const [hasta, setHasta] = useState(todayIso);

  const movimientos = useResource(
    (signal) =>
      listarMovimientos(
        { sucursalId: central ? sucursalId : undefined, insumoId, tipo, desde, hasta, limite: 200 },
        { signal },
      ),
    `kardex-${sucursalId}-${insumoId}-${tipo}-${desde}-${hasta}`,
  );

  // Opciones de insumo sin repetir (la lista de stock puede traer varias sucursales).
  const options = [...new Map(insumos.map((i) => [i.insumoId, i.insumo])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = Boolean(insumoId || tipo);
  const showBranch = central && !sucursalId;

  return (
    <section aria-labelledby="kardex-title">
      <h3 id="kardex-title" className="os-sr">Movimientos de inventario</h3>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <InlineSelect label="Insumo" selectClassName="max-w-56" value={insumoId} onChange={(e) => onInsumoChange(e.target.value)}>
          <option value="">Todos</option>
          {options.map(([id, nombre]) => (
            <option key={id} value={id}>{nombre}</option>
          ))}
        </InlineSelect>
        <InlineSelect label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(TIPOS_MOVIMIENTO).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </InlineSelect>
        <DateFilter label="Desde" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        <DateFilter label="Hasta" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
      </div>

      {movimientos.loading && !movimientos.data ? (
        <Loading label="Cargando movimientos…" />
      ) : movimientos.error ? (
        <ErrorState error={movimientos.error} onRetry={movimientos.reload} />
      ) : !movimientos.data?.length ? (
        <EmptyState
          icon={History}
          title="Sin movimientos en el período"
          onClearFilters={filtered ? () => { onInsumoChange(""); setTipo(""); } : undefined}
        >
          Las ventas y compras de los datos de demo son anteriores al kardex y no tienen movimientos.
        </EmptyState>
      ) : (
        <TableScroll label="Movimientos de inventario">
          <DataTable
            caption="Movimientos de inventario"
            columns={[
              { key: "fecha", label: "Fecha" },
              { key: "insumo", label: "Insumo" },
              showBranch && { key: "sucursal", label: "Sucursal" },
              { key: "tipo", label: "Tipo" },
              { key: "cantidad", label: "Cantidad", numeric: true },
              { key: "resultante", label: "Stock resultante", numeric: true },
              { key: "usuario", label: "Usuario" },
              { key: "referencia", label: "Referencia / nota" },
            ]}
          >
            {movimientos.data.map((m) => {
              const qty = Number(m.cantidad);
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateTime(m.creadoEn)}</td>
                  <th scope="row" className="font-semibold">{m.insumo}</th>
                  {showBranch && <td>{m.sucursal}</td>}
                  <td>
                    {TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}
                    {m.motivo && <span className="block text-xs text-slate-600">{MOTIVO_LABELS[m.motivo] ?? m.motivo}</span>}
                  </td>
                  <td className={`os-number ${qty < 0 ? "text-red-800" : ""}`}>
                    {qty > 0 ? "+" : ""}
                    {formatQuantity(m.cantidad, m.unidad)}
                    <span className="os-sr">{qty < 0 ? " (salida)" : " (entrada)"}</span>
                  </td>
                  <td className="os-number">{formatQuantity(m.stockResultante, m.unidad)}</td>
                  <td>{m.usuario ?? "Sin datos"}</td>
                  <td className="text-sm">
                    {m.ventaId ? `Venta #${m.ventaId}` : m.compraId ? `Compra #${m.compraId}` : ""}
                    {m.nota && <span className="block text-xs text-slate-600">{m.nota}</span>}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </TableScroll>
      )}
    </section>
  );
}
