import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Coffee, Minus, Plus, Search, ShoppingCart, Trash2, Wallet } from "lucide-react";

import { useCaja } from "./cajaContext";

import CajaStatus from "../../components/caja/CajaStatus";
import ClienteSelector from "../../components/caja/ClienteSelector";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import Button from "../../components/ui/Button";

import { registrarVenta } from "../../api/cajaApi";

import { apiMessage, errorCode, errorDetails, errorStatus, newOperationKey } from "../../lib/apiError";
import { DOC_LABELS, PAYMENT_LABELS, formatQuantity } from "../../lib/format";
import { formatMoney, isValidAmount, toCents } from "../../lib/money";

const IVA_DIVISOR = 1.13;

// Estimación local (precios con IVA incluido, igual que Express): total =
// suma de líneas; subtotal = total / 1.13; IVA = total − subtotal. El
// comprobante muestra siempre los importes confirmados por la API.
function estimate(items) {
  const total = items.reduce((sum, item) => sum + toCents(item.precio) * item.cantidad, 0);
  const subtotal = Math.round(total / IVA_DIVISOR);
  return { total, subtotal, iva: total - subtotal };
}

export default function PosPage() {
  const { branchId, turno, menu, order } = useCaja();
  const current = turno.data;

  return (
    <>
      <PageHeader title="Punto de venta" description="Tomá el pedido, elegí el comprobante y cobrá." />
      <CajaStatus />

      {!branchId ? (
        <EmptyState title="Elegí una sucursal">Seleccioná la sucursal donde vas a vender.</EmptyState>
      ) : turno.loading && current === undefined ? (
        <Loading label="Consultando el turno…" />
      ) : turno.error ? (
        <ErrorState error={turno.error} onRetry={turno.reload} fallback="No se pudo consultar el turno." />
      ) : !current ? (
        <EmptyState
          icon={Wallet}
          title="La caja está cerrada"
          action={
            <Link to="/caja" className="os-btn os-btn--primary mt-2 inline-flex items-center gap-2">
              <Wallet size={18} aria-hidden="true" /> Abrir turno
            </Link>
          }
        >
          Para vender necesitás un turno abierto en esta sucursal.
          {order.items.length > 0 && " Tu pedido en curso se conserva."}
        </EmptyState>
      ) : (
        <div className="grid gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_24rem] xl:pb-0">
          <MenuGrid menu={menu} />
          <OrderPanel turno={current} />
        </div>
      )}
    </>
  );
}

function MenuGrid({ menu }) {
  const { order, addItem } = useCaja();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const items = useMemo(() => menu.data ?? [], [menu.data]);
  const categories = useMemo(
    () => [...new Set(items.map((p) => p.categoria).filter(Boolean))].sort(),
    [items],
  );
  const visible = items.filter(
    (p) =>
      (!category || p.categoria === category) &&
      (!search.trim() || p.nombre.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const inCart = (id) => order.items.find((i) => i.platilloId === id)?.cantidad ?? 0;

  return (
    <section aria-labelledby="menu-title" className="min-w-0">
      <h3 id="menu-title" className="os-sr">Menú</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="os-sr">Buscar producto</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-edge" aria-hidden="true" />
          <input
            type="search"
            className="os-input bg-white pl-9"
            placeholder="Buscar producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categorías">
        {["", ...categories].map((c) => (
          <button
            key={c || "todas"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${category === c ? "border-primary bg-primary text-canvas" : "border-secondary bg-white hover:bg-secondary"
              }`}
          >
            {c || "Todo"}
          </button>
        ))}
      </div>

      {menu.loading && !menu.data ? (
        <Loading label="Cargando menú…" />
      ) : menu.error && !menu.data ? (
        <ErrorState error={menu.error} onRetry={menu.reload} fallback="No se pudo cargar el menú." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Coffee}
          title="Sin productos"
          onClearFilters={category || search ? () => { setCategory(""); setSearch(""); } : undefined}
        >
          No hay productos que coincidan con el filtro.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
          {visible.map((p) => {
            const qty = inCart(p.id);
            const soldOut = p.disponibles !== undefined && p.disponibles <= qty;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => addItem(p)}
                  className="relative flex h-full w-full flex-col justify-between gap-2 rounded-(--radius-control) border border-secondary bg-white p-3 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                  aria-label={`Agregar ${p.nombre}, ${formatMoney(p.precio)}${soldOut ? ", sin existencias" : ""}`}
                >
                  <span className="font-semibold leading-tight">{p.nombre}</span>
                  <span className="flex items-end justify-between gap-2">
                    <span className="os-metric text-base!">{formatMoney(p.precio)}</span>
                    <span className={`text-xs ${p.disponibles <= 5 ? "font-semibold text-red-800" : "text-slate-600"}`}>
                      {soldOut ? "Agotado" : `${p.disponibles} disp.`}
                    </span>
                  </span>
                  {qty > 0 && (
                    <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                      {qty}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OrderPanel({ turno }) {
  const { order, setQuantity, updateOrder, clearOrder, turno: turnoRes, menu } = useCaja();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [recibido, setRecibido] = useState("");
  const lock = useRef(false);
  // Una clave por pedido: se reutiliza al reintentar el MISMO pedido (p. ej.
  // tras un corte de red) para que Express no registre dos ventas.
  const keyRef = useRef({ signature: null, key: null });
  const chargeRef = useRef(null);
  // En pantallas angostas la barra inferior se oculta cuando el botón Cobrar
  // ya está a la vista, para no taparlo.
  const [chargeVisible, setChargeVisible] = useState(false);

  useEffect(() => {
    const el = chargeRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setChargeVisible(entry.isIntersecting), {
      rootMargin: "0px 0px -88px 0px",
      threshold: 1,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totals = estimate(order.items);
  const menuById = useMemo(() => new Map((menu.data ?? []).map((p) => [p.id, p])), [menu.data]);
  const isCcf = order.tipoDoc === "CCF";
  const missingClient = isCcf && !order.cliente;
  const missingNrc = isCcf && order.cliente && !order.cliente.nrc;
  const cashCents = isValidAmount(recibido) ? toCents(recibido) : null;
  const change = order.metodoPago === "EFECTIVO" && cashCents !== null ? cashCents - totals.total : null;

  const blocker = !order.items.length
    ? "Agregá al menos un producto."
    : missingClient
      ? "Seleccioná o registrá el cliente para el CCF."
      : missingNrc
        ? "Completá el NRC del cliente antes de cobrar."
        : null;

  async function charge() {
    if (lock.current || blocker) return;
    lock.current = true;
    setBusy(true);
    setError(null);

    const payload = {
      turnoId: turno.id,
      tipoDoc: order.tipoDoc,
      metodoPago: order.metodoPago,
      clienteId: isCcf ? order.cliente.id : undefined,
      items: order.items.map((i) => ({ platilloId: i.platilloId, cantidad: i.cantidad })),
    };
    const signature = JSON.stringify(payload);
    if (keyRef.current.signature !== signature) keyRef.current = { signature, key: newOperationKey() };

    try {
      const venta = await registrarVenta({ ...payload, claveOperacion: keyRef.current.key });
      keyRef.current = { signature: null, key: null };
      clearOrder();
      setRecibido("");
      turnoRes.reload();
      menu.reload();
      toast.success(`${order.tipoDoc === "CCF" ? "CCF" : "Factura"} N.º ${venta.numero} emitida.`);
      navigate(`/caja/comprobantes/${venta.id}`, {
        state: { venta, recibido: order.metodoPago === "EFECTIVO" ? cashCents : null },
      });
    } catch (err) {
      const code = errorCode(err);
      setError(err);
      if (code === "TURNO_CERRADO") turnoRes.reload();
      if (code === "PLATILLO_NO_DISPONIBLE" || code === "STOCK_INSUFICIENTE" || code === "RECETA_VACIA") menu.reload();
      if (code === "CLAVE_REUTILIZADA") keyRef.current = { signature: null, key: null };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="order-title" className="min-w-0 xl:sticky xl:top-20 xl:self-start">
      <div className="grid gap-4 rounded-(--radius-control) border border-secondary bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id="order-title" className="os-heading flex items-center gap-2">
            <ShoppingCart size={20} aria-hidden="true" /> Pedido
          </h3>
          {order.items.length > 0 && (
            <button type="button" className="text-sm text-slate-600 underline hover:text-primary" onClick={clearOrder} disabled={busy}>
              Vaciar
            </button>
          )}
        </div>

        {order.items.length === 0 ? (
          <p className="rounded-(--radius-control) bg-canvas px-3 py-6 text-center text-sm text-slate-600">
            Tocá un producto del menú para agregarlo.
          </p>
        ) : (
          <ul className="grid min-w-0 grid-cols-1 gap-2">
            {order.items.map((item) => {
              const max = menuById.get(item.platilloId)?.disponibles;
              return (
                <li
                  key={item.platilloId}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-secondary pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={item.nombre}>{item.nombre}</p>
                    <p className="truncate text-xs text-slate-600">{formatMoney(item.precio)} c/u</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-secondary hover:bg-secondary"
                      onClick={() => setQuantity(item.platilloId, item.cantidad - 1)}
                      aria-label={`Quitar uno de ${item.nombre}`}
                      disabled={busy}
                    >
                      {item.cantidad === 1 ? <Trash2 size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
                    </button>
                    <span className="w-7 shrink-0 text-center font-semibold tabular-nums" aria-label={`Cantidad ${item.cantidad}`}>
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-secondary hover:bg-secondary disabled:opacity-50"
                      onClick={() => setQuantity(item.platilloId, item.cantidad + 1)}
                      aria-label={`Agregar uno de ${item.nombre}`}
                      disabled={busy || (max !== undefined && item.cantidad >= max)}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <span className="min-w-16 shrink-0 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                    {formatMoney(toCents(item.precio) * item.cantidad, { cents: true })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="mb-1 text-sm font-semibold">Comprobante</legend>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DOC_LABELS).map(([value, label]) => (
              <ChoiceButton
                key={value}
                name="tipoDoc"
                value={value}
                checked={order.tipoDoc === value}
                onChange={() => updateOrder({ tipoDoc: value })}
              >
                {value === "CCF" ? "Crédito fiscal" : "Factura"}
                <span className="os-sr"> ({label})</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {isCcf && (
          <div className="grid gap-2">
            <p className="text-sm font-semibold">Cliente del CCF</p>
            <ClienteSelector
              cliente={order.cliente}
              onChange={(cliente) => updateOrder({ cliente })}
              nrcRequested={errorCode(error) === "NRC_REQUERIDO"}
            />
          </div>
        )}

        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="mb-1 text-sm font-semibold">Medio de pago</legend>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <ChoiceButton
                key={value}
                name="metodoPago"
                value={value}
                checked={order.metodoPago === value}
                onChange={() => updateOrder({ metodoPago: value })}
              >
                {value === "BITCOIN" ? "Bitcoin" : label}
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {order.metodoPago === "EFECTIVO" && order.items.length > 0 && (
          <div className="grid grid-cols-2 items-end gap-2">
            <label className="os-field">
              <span className="text-sm font-semibold">Recibido (opcional)</span>
              <input
                className="os-input bg-white"
                inputMode="decimal"
                placeholder="0.00"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                disabled={busy}
              />
            </label>
            <p className="pb-2 text-sm" aria-live="polite">
              {change === null ? "" : change < 0 ? (
                <span className="font-semibold text-red-800">Faltan {formatMoney(-change, { cents: true })}</span>
              ) : (
                <>Cambio: <strong>{formatMoney(change, { cents: true })}</strong></>
              )}
            </p>
          </div>
        )}

        <dl className="grid gap-1 border-t border-secondary pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Subtotal (sin IVA)</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal, { cents: true })}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">IVA 13 %</dt>
            <dd className="tabular-nums">{formatMoney(totals.iva, { cents: true })}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Total estimado</dt>
            <dd className="tabular-nums">{formatMoney(totals.total, { cents: true })}</dd>
          </div>
          <p className="os-help text-slate-600">Precios con IVA incluido. El total, el IVA y el correlativo los confirma el servidor al cobrar.</p>
        </dl>

        {error && <ChargeError error={error} />}

        {/* <button
          ref={chargeRef}
          type="button"
          className="os-btn os-btn--primary inline-flex min-h-12 items-center justify-center gap-2 text-base"
          onClick={charge}
          disabled={busy || Boolean(blocker)}
          aria-describedby={blocker ? "charge-blocker" : undefined}
        >
          <Wallet size={20} aria-hidden="true" />
          {busy ? "Cobrando…" : `Cobrar ${formatMoney(totals.total, { cents: true })}`}
        </button> */}

        <Button
          ref={chargeRef}
          variant="primary"
          type="button"
          className="inline-flex min-h-12 items-center justify-center gap-2 text-base"
          onClick={charge}
          disabled={busy || Boolean(blocker)}
          aria-describedby={blocker ? "charge-blocker" : undefined}
        >
          <Wallet size={20} aria-hidden="true" />
          {busy ? "Cobrando…" : `Cobrar ${formatMoney(totals.total, { cents: true })}`}
        </Button>
        {blocker && order.items.length > 0 && (
          <p id="charge-blocker" className="os-help -mt-2 text-center font-semibold">{blocker}</p>
        )}
      </div>

      {/* En móvil el total y el acceso al cobro quedan siempre visibles. */}
      {order.items.length > 0 && !chargeVisible && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t lg:left-64 border-secondary bg-white/95 px-4 py-3 backdrop-blur-sm xl:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="text-sm">
              <p className="text-slate-600">{order.items.reduce((s, i) => s + i.cantidad, 0)} producto(s)</p>
              <p className="text-base font-bold tabular-nums">{formatMoney(totals.total, { cents: true })}</p>
            </div>
            <button
              type="button"
              className="os-btn os-btn--primary"
              onClick={() => chargeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              Revisar y cobrar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChoiceButton({ name, value, checked, onChange, children }) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-(--radius-control) border px-2 text-center text-sm font-semibold has-focus-visible:outline-3 has-focus-visible:outline-primary ${checked ? "border-primary bg-accent/30" : "border-secondary bg-white hover:bg-canvas"
        }`}
    >
      <input type="radio" className="os-sr" name={name} value={value} checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

function ChargeError({ error }) {
  const code = errorCode(error);
  const details = errorDetails(error);
  const noResponse = errorStatus(error) === null;

  return (
    <Alert tone="error">
      <p className="font-semibold">
        {noResponse
          ? "No se confirmó el cobro. Revisá la conexión y volvé a cobrar: si la venta ya se registró, no se duplicará."
          : apiMessage(error, "No se pudo registrar la venta.")}
      </p>
      {code === "STOCK_INSUFICIENTE" && details.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {details.map((d) => (
            <li key={d.insumoId}>
              {d.insumo}: se necesitan {formatQuantity(d.requerido, d.unidad)}, hay {formatQuantity(d.disponible, d.unidad)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1">El pedido se conservó: corregilo y volvé a cobrar.</p>
    </Alert>
  );
}
