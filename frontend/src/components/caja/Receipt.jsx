import { DOC_LABELS, PAYMENT_LABELS, formatDateTime, formatQuantity } from "../../lib/format";
import { formatMoney } from "../../lib/money";

// Comprobante con los importes y el correlativo confirmados por la API.
export default function Receipt({ venta, branchName }) {
  const cliente = venta.cliente ?? (venta.clienteNombre
    ? { nombre: venta.clienteNombre, nit: venta.clienteNit, nrc: venta.clienteNrc }
    : null);

  return (
    <article className="os-receipt mx-auto w-full max-w-md rounded-(--radius-control) border border-secondary bg-white p-5 text-sm" aria-labelledby="receipt-title">
      <header className="mb-4 border-b border-dashed border-edge pb-3 text-center">
        <p className="text-lg font-bold">Orígenes SV</p>
        <p>{venta.sucursal ?? branchName ?? `Sucursal #${venta.sucursalId}`}</p>
        {venta.sucursalDireccion && <p className="text-xs text-slate-600">{venta.sucursalDireccion}</p>}
        <h3 id="receipt-title" className="mt-3 font-bold uppercase tracking-wide">
          {DOC_LABELS[venta.tipoDoc] ?? venta.tipoDoc}
        </h3>
        <p className="os-metric">N.º {venta.numero}</p>
        {venta.anulada && (
          <div className="os-alert os-error mt-3 text-left" role="status">
            <p className="font-bold uppercase">Anulada</p>
            <p className="text-xs">
              {formatDateTime(venta.anuladaEn)}
              {venta.anuladaPor ? ` · por ${venta.anuladaPor}` : ""}
            </p>
            {venta.motivoAnulacion && <p className="text-xs">Motivo: {venta.motivoAnulacion}</p>}
          </div>
        )}
      </header>

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-600">Fecha</dt>
        <dd className="text-right">{formatDateTime(venta.creadoEn)}</dd>
        {venta.cajero && (
          <>
            <dt className="text-slate-600">Cajero</dt>
            <dd className="text-right">{venta.cajero}</dd>
          </>
        )}
        <dt className="text-slate-600">Turno</dt>
        <dd className="text-right">#{venta.turnoId}</dd>
        <dt className="text-slate-600">Pago</dt>
        <dd className="text-right">{PAYMENT_LABELS[venta.metodoPago] ?? venta.metodoPago}</dd>
      </dl>

      {cliente && (
        <div className="mb-3 rounded-(--radius-control) bg-canvas p-2">
          <p className="font-semibold">{cliente.nombre}</p>
          <p className="text-xs">NIT {cliente.nit ?? "Sin datos"} · NRC {cliente.nrc ?? "Sin datos"}</p>
        </div>
      )}

      <table className="w-full border-collapse">
        <caption className="os-sr">Detalle de la venta</caption>
        <thead>
          <tr className="border-b border-secondary text-left text-xs text-slate-600">
            <th scope="col" className="py-1">Cant.</th>
            <th scope="col" className="py-1">Producto</th>
            <th scope="col" className="py-1 text-right">P. unit.</th>
            <th scope="col" className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(venta.items ?? []).map((item) => (
            <tr key={item.platilloId} className="border-b border-secondary/60">
              <td className="py-1 tabular-nums">{item.cantidad}</td>
              <td className="py-1">{item.nombre}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(item.precioUnitario)}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(item.totalLinea)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t border-dashed border-edge pt-3">
        <dt>Subtotal (sin IVA)</dt>
        <dd className="text-right tabular-nums">{formatMoney(venta.subtotal)}</dd>
        <dt>IVA 13 %</dt>
        <dd className="text-right tabular-nums">{formatMoney(venta.iva)}</dd>
        <dt className="text-base font-bold">Total</dt>
        <dd className="text-right text-base font-bold tabular-nums">{formatMoney(venta.total)}</dd>
      </dl>
    </article>
  );
}

export function StockAlerts({ alertas }) {
  if (!alertas?.length) return null;
  return (
    <div className="os-alert os-badge--attention rounded-(--radius-control) text-sm" role="status">
      <p className="font-semibold">Insumos en stock mínimo tras esta venta</p>
      <ul className="mt-1 list-disc pl-5">
        {alertas.map((a) => (
          <li key={a.insumo}>
            {a.insumo}: {formatQuantity(a.stockActual)} (mínimo {formatQuantity(a.stockMinimo)})
          </li>
        ))}
      </ul>
    </div>
  );
}
