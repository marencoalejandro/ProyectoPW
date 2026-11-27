import { useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Printer, ShoppingCart } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { can } from "../../auth/access";
import { useCaja } from "./cajaContext";

import CajaStatus from "../../components/caja/CajaStatus";
import Receipt, { StockAlerts } from "../../components/caja/Receipt";
import { Badge, PageHeader, TableScroll } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import FormActions from "../../components/ui/FormActions";
import { InlineSelect } from "../../components/ui/Select";

import { apiMessage, errorCode, fieldErrors } from "../../lib/apiError";
import { focusFirstInvalid } from "../../lib/forms";

import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { useResource } from "../../hooks/useResource";
import { anularVenta, getVenta, listarVentas } from "../../api/cajaApi";
import { formatDateTime, PAYMENT_LABELS } from "../../lib/format";
import { formatMoney, toCents } from "../../lib/money";

export function ComprobantesPage() {
  const { branchId, canPickBranch, turno } = useCaja();
  const current = turno.data;
  const [tipoDoc, setTipoDoc] = useState("");

  // Con turno abierto: ventas de ese turno. Sin turno: últimas de la sucursal.
  const turnoId = current?.id ?? null;
  const ventas = useResource(
    (signal) =>
      listarVentas(
        {
          ...(turnoId ? { turnoId } : {}),
          ...(canPickBranch ? { sucursalId: branchId } : {}),
          ...(tipoDoc ? { tipoDoc } : {}),
          limite: 50,
        },
        { signal },
      ),
    branchId && current !== undefined ? `ventas-${branchId}-${turnoId}-${tipoDoc}` : null,
  );

  return (
    <>
      <PageHeader
        title="Comprobantes"
        description={turnoId ? `Ventas del turno #${turnoId}.` : "Últimas ventas de la sucursal."}
        actions={
          <InlineSelect label="Tipo" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
            <option value="">Todos</option>
            <option value="FACTURA">Factura</option>
            <option value="CCF">CCF</option>
          </InlineSelect>
        }
      />
      <CajaStatus />

      {!branchId ? (
        <EmptyState title="Elegí una sucursal" />
      ) : ventas.loading && !ventas.data ? (
        <Loading label="Cargando comprobantes…" />
      ) : ventas.error ? (
        <ErrorState error={ventas.error} onRetry={ventas.reload} />
      ) : !ventas.data?.length ? (
        <EmptyState
          title="Todavía no hay ventas"
          onClearFilters={tipoDoc ? () => setTipoDoc("") : undefined}
          action={
            current && (
              <Link to="/caja/pos" className="os-btn os-btn--primary mt-2 inline-flex items-center gap-2">
                <ShoppingCart size={18} aria-hidden="true" /> Ir al punto de venta
              </Link>
            )
          }
        >
          {turnoId ? "Las ventas de este turno aparecerán aquí." : "No hay ventas registradas."}
        </EmptyState>
      ) : (
        <TableScroll label="Comprobantes emitidos">
          <DataTable
            caption="Comprobantes emitidos"
            columns={[
              { key: "comprobante", label: "Comprobante" },
              { key: "fecha", label: "Fecha" },
              { key: "cliente", label: "Cliente" },
              { key: "pago", label: "Pago" },
              { key: "total", label: "Total", numeric: true },
              { key: "estado", label: "Estado" },
              { key: "acciones", label: "Acciones", srOnly: true },
            ]}
          >
            {ventas.data.map((v) => (
              <tr key={v.id}>
                <td className="font-semibold whitespace-nowrap">
                  {v.tipoDoc === "CCF" ? "CCF" : "Factura"} N.º {v.numero}
                </td>
                <td className="whitespace-nowrap">{formatDateTime(v.creadoEn)}</td>
                <td>{v.clienteNombre ?? "Consumidor final"}</td>
                <td>{PAYMENT_LABELS[v.metodoPago] ?? v.metodoPago}</td>
                <td className={`os-number ${v.anulada ? "line-through" : ""}`}>{formatMoney(v.total)}</td>
                <td>{v.anulada ? <Badge tone="attention">Anulada</Badge> : <Badge tone="ok">Vigente</Badge>}</td>
                <td>
                  <Link className="os-link" to={`/caja/comprobantes/${v.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}
    </>
  );
}

export function ComprobantePage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { branchName, turno, menu } = useCaja();
  const [voiding, setVoiding] = useState(false);
  const [voidResult, setVoidResult] = useState(null);
  const fresh = location.state?.venta && String(location.state.venta.id) === id ? location.state : null;

  const venta = useResource((signal) => getVenta(id, { signal }), `venta-${id}`);
  const data = voidResult ?? venta.data ?? fresh?.venta;
  const canVoid = can(user, "anularVenta") && data && !data.anulada;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/caja/comprobantes" className="os-link inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={16} aria-hidden="true" /> Comprobantes
        </Link>
        <div className="flex flex-wrap gap-2">
          {canVoid && (
            <Button variant="danger" className="inline-flex items-center gap-2" onClick={() => setVoiding(true)}>
              <Ban size={18} aria-hidden="true" /> Anular venta
            </Button>
          )}
          <Button className="inline-flex items-center gap-2" onClick={() => window.print()} disabled={!data}>
            <Printer size={18} aria-hidden="true" /> Imprimir
          </Button>
          <Link to="/caja/pos" className="os-btn os-btn--primary inline-flex items-center gap-2">
            <ShoppingCart size={18} aria-hidden="true" /> Nueva venta
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {voidResult && (
          <div className="mx-auto w-full max-w-md print:hidden">
            <Alert tone="success">
              Venta anulada. Ya no cuenta en el arqueo del turno ni en los reportes.{" "}
              {voidResult.stockRevertido
                ? `Se devolvieron ${voidResult.stockDevuelto?.length ?? 0} insumo(s) al inventario.`
                : "Esta venta es anterior al kardex: no había descontado stock, así que no se devolvió nada."}
            </Alert>
          </div>
        )}

        {fresh && !voidResult && (
          <div className="mx-auto grid w-full max-w-md gap-3 print:hidden">
            <Alert tone="success">
              Venta registrada. Total confirmado {formatMoney(fresh.venta.total)}
              {typeof fresh.recibido === "number" && fresh.recibido >= toCents(fresh.venta.total)
                ? ` · recibido ${formatMoney(fresh.recibido, { cents: true })}, cambio ${formatMoney(fresh.recibido - toCents(fresh.venta.total), { cents: true })}`
                : ""}
              .
            </Alert>
            <StockAlerts alertas={fresh.venta.alertasStock} />
          </div>
        )}

        {data ? (
          <Receipt venta={data} branchName={branchName} />
        ) : venta.loading ? (
          <Loading label="Cargando comprobante…" />
        ) : (
          <ErrorState error={venta.error} onRetry={venta.reload} fallback="No se pudo cargar el comprobante." />
        )}
      </div>

      <Modal open={voiding} onClose={() => setVoiding(false)} title="Anular venta" size="sm">
        {voiding && data && (
          <VoidForm
            venta={data}
            onCancel={() => setVoiding(false)}
            onDone={(result) => {
              setVoiding(false);
              setVoidResult(result);
              // El arqueo y las existencias cambian: se vuelven a pedir.
              turno.reload();
              menu.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function VoidForm({ venta, onCancel, onDone }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const docLabel = `${venta.tipoDoc === "CCF" ? "CCF" : "Factura"} N.º ${venta.numero}`;

  async function handleSubmit(event) {
    event.preventDefault();
    if (lock.current) return;
    const text = motivo.trim();
    if (text.length < 5 || text.length > 200) {
      setError("Escribí el motivo, de 5 a 200 caracteres.");
      focusFirstInvalid(event.currentTarget);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await anularVenta(venta.id, text);
      toast.success(`${docLabel} anulada.`);
      onDone(result);
    } catch (err) {
      const code = errorCode(err);
      setError(
        code === "TURNO_CERRADO"
          ? "El turno de esta venta ya está cerrado y su arqueo firmado: no se puede anular."
          : code === "VENTA_YA_ANULADA"
            ? "Esta venta ya estaba anulada."
            : (fieldErrors(err).motivo ?? apiMessage(err, "No se pudo anular la venta.")),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm">
        Vas a anular <strong>{docLabel}</strong> por <strong>{formatMoney(venta.total)}</strong>. El stock que descontó vuelve
        al inventario y el número no se reutiliza. Solo se puede anular mientras su turno siga abierto.
      </p>
      <Field label="Motivo de la anulación" required error={error} hint="De 5 a 200 caracteres.">
        {(aria) => (
          <textarea
            className="os-input bg-white"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            {...aria}
          />
        )}
      </Field>
      <FormActions
        onCancel={onCancel}
        busy={busy}
        danger
        focusCancel
        submitLabel="Anular venta"
        pendingLabel="Anulando…"
      />
    </form>
  );
}
