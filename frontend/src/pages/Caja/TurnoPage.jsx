import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ShoppingCart, Wallet } from "lucide-react";
import { useCaja } from "./cajaContext";
import CajaStatus from "../../components/caja/CajaStatus";
import ArqueoTable from "../../components/caja/ArqueoTable";
import { PageHeader, Card } from "../../components/ui/PageHeader";
import { TextField } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { ConfirmDialog } from "../../components/ui/Modal";
import { abrirTurno, cerrarTurno } from "../../api/cajaApi";
import { apiMessage, errorCode, fieldErrors } from "../../lib/apiError";
import { formatDateTime } from "../../lib/format";
import { formatMoney, isValidAmount } from "../../lib/money";
import { focusFirstInvalid } from "../../lib/forms";

// Express: solo cargos CAJERO o GERENTE (o rol ADMIN) abren turno.
const CARGOS_CAJA = new Set(["CAJERO", "GERENTE"]);

export default function TurnoPage() {
  const { user, branchId, turno, order } = useCaja();
  const [closedShift, setClosedShift] = useState(null);

  const current = turno.data;
  const canOpen = user?.role === "ADMIN" || CARGOS_CAJA.has(user?.cargo);

  return (
    <>
      <PageHeader
        title="Turno de caja"
        description="Abrí tu turno, revisá lo vendido por medio de pago y cerrá con el arqueo."
      />
      <CajaStatus />

      {!branchId ? (
        <EmptyState title="Elegí una sucursal">
          Como administración central, seleccioná en qué sucursal vas a operar la caja.
        </EmptyState>
      ) : turno.loading && current === undefined ? (
        <Loading label="Consultando el turno…" />
      ) : turno.error ? (
        <ErrorState error={turno.error} onRetry={turno.reload} fallback="No se pudo consultar el turno." />
      ) : current ? (
        <OpenShift turno={current} pendingItems={order.items.length} onClosed={setClosedShift} reload={turno.reload} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <OpenShiftForm canOpen={canOpen} cargo={user?.cargo} onOpened={() => { setClosedShift(null); turno.reload(); }} />
          {closedShift && <ClosedShiftSummary turno={closedShift} />}
        </div>
      )}
    </>
  );
}

function OpenShiftForm({ canOpen, cargo, onOpened }) {
  const { branchId, canPickBranch } = useCaja();
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (lock.current) return;
    const value = monto.trim() === "" ? "0" : monto.trim();
    if (!isValidAmount(value)) {
      setError("Ingresá un monto válido, con hasta 2 decimales.");
      focusFirstInvalid(event.currentTarget);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await abrirTurno({ sucursalId: canPickBranch ? branchId : undefined, montoInicial: value });
      toast.success("Turno abierto.");
      onOpened();
    } catch (err) {
      if (errorCode(err) === "TURNO_YA_ABIERTO") {
        toast("Ya tenías un turno abierto en esta sucursal.");
        onOpened();
      } else {
        setError(fieldErrors(err).montoInicial ?? apiMessage(err, "No se pudo abrir el turno."));
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Card title="La caja está cerrada">
      {!canOpen ? (
        <Alert tone="error">
          Tu cargo ({cargo ?? "sin cargo"}) no permite abrir un turno. Solo cajeros y gerentes abren caja; pedí a uno
          que abra el turno.
        </Alert>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-slate-600">
            Contá el fondo de efectivo con el que empezás. Se suma al efectivo esperado al cerrar.
          </p>
          <TextField
            label="Fondo inicial en efectivo (US$)"
            name="montoInicial"
            inputMode="decimal"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="primary" className="inline-flex items-center justify-center gap-2" disabled={busy}>
            <Wallet size={18} aria-hidden="true" />
            {busy ? "Abriendo…" : "Abrir turno"}
          </Button>
        </form>
      )}
    </Card>
  );
}

function OpenShift({ turno, pendingItems, onClosed, reload }) {
  const [form, setForm] = useState({ efectivoContado: "", tarjetaReportada: "", bitcoinReportado: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  function validate() {
    const next = {};
    for (const [key, value] of Object.entries(form)) {
      const text = value.trim() === "" ? "0" : value.trim();
      if (!isValidAmount(text)) next[key] = "Monto inválido (hasta 2 decimales).";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleClose() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError("");
    const body = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? "0" : v.trim()]),
    );
    try {
      const closed = await cerrarTurno(turno.id, body);
      toast.success("Turno cerrado.");
      setConfirming(false);
      onClosed(closed);
      reload();
    } catch (err) {
      setConfirming(false);
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo cerrar el turno."));
      if (errorCode(err) === "TURNO_CERRADO") reload();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const arqueo = turno.arqueo;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card
        title="Resumen del turno"
        actions={
          <Link to="/caja/pos" className="os-btn os-btn--primary inline-flex items-center gap-2">
            <ShoppingCart size={18} aria-hidden="true" /> Ir al punto de venta
          </Link>
        }
      >
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-600">Cajero</dt>
            <dd className="font-semibold">{turno.cajero}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Apertura</dt>
            <dd className="font-semibold">{formatDateTime(turno.abiertoEn)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Fondo inicial</dt>
            <dd className="os-metric text-lg!">{formatMoney(turno.montoInicial)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Total vendido en el turno</dt>
            <dd className="os-metric text-lg!">{formatMoney(arqueo?.totalVendido)}</dd>
          </div>
        </dl>
        <ArqueoTable arqueo={arqueo} />
      </Card>

      <Card title="Cerrar turno">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validate()) setConfirming(true);
            else focusFirstInvalid(e.currentTarget);
          }}
        >
          <p className="text-sm text-slate-600">
            Declarà lo que contaste. El sistema lo compara con lo registrado y muestra las diferencias.
          </p>
          {pendingItems > 0 && (
            <Alert tone="error">Tenés un pedido sin cobrar con {pendingItems} producto(s) en el punto de venta.</Alert>
          )}
          <TextField
            label="Efectivo contado (incluye el fondo)"
            inputMode="decimal"
            placeholder="0.00"
            value={form.efectivoContado}
            onChange={(e) => setForm({ ...form, efectivoContado: e.target.value })}
            error={errors.efectivoContado}
          />
          <TextField
            label="Tarjeta (según cierre del POS bancario)"
            inputMode="decimal"
            placeholder="0.00"
            value={form.tarjetaReportada}
            onChange={(e) => setForm({ ...form, tarjetaReportada: e.target.value })}
            error={errors.tarjetaReportada}
          />
          <TextField
            label="Bitcoin/Chivo Wallet"
            inputMode="decimal"
            placeholder="0.00"
            value={form.bitcoinReportado}
            onChange={(e) => setForm({ ...form, bitcoinReportado: e.target.value })}
            error={errors.bitcoinReportado}
          />
          {formError && <Alert tone="error">{formError}</Alert>}
          <Button type="submit" variant="danger" disabled={busy}>
            Cerrar turno
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={confirming}
        title="¿Cerrar el turno?"
        confirmLabel="Sí, cerrar turno"
        danger
        busy={busy}
        onConfirm={handleClose}
        onClose={() => setConfirming(false)}
      >
        Después de cerrar no se pueden registrar más ventas en este turno. Declarado: efectivo{" "}
        {formatMoney(form.efectivoContado || "0")}, tarjeta {formatMoney(form.tarjetaReportada || "0")}, Bitcoin{" "}
        {formatMoney(form.bitcoinReportado || "0")}.
      </ConfirmDialog>
    </div>
  );
}

function ClosedShiftSummary({ turno }) {
  return (
    <Card title={`Turno #${turno.id} cerrado`}>
      <p className="mb-3 text-sm text-slate-600">
        Cerrado el {formatDateTime(turno.cerradoEn)} · Diferencia = declarado − esperado (negativo es faltante).
      </p>
      <ArqueoTable arqueo={turno.arqueo} closed />
    </Card>
  );
}
