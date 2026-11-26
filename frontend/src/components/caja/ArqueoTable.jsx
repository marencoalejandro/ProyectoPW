import { formatMoney, toCents } from "../../lib/money";
import { TableScroll } from "../ui/PageHeader";
import DataTable from "../ui/DataTable";

// arqueo.medios[]: { metodo, etiqueta, ventas, vendido, esperado, declarado, diferencia }
export default function ArqueoTable({ arqueo, closed = false }) {
  if (!arqueo?.medios?.length) return null;
  return (
    <TableScroll label="Resumen por medio de pago">
      <DataTable
        caption="Resumen por medio de pago"
        columns={[
          { key: "medio", label: "Medio" },
          { key: "ventas", label: "Ventas", numeric: true },
          { key: "vendido", label: "Vendido", numeric: true },
          { key: "esperado", label: "Esperado", numeric: true },
          closed && { key: "declarado", label: "Declarado", numeric: true },
          closed && { key: "diferencia", label: "Diferencia", numeric: true },
        ]}
        footer={
          <tr>
            <th scope="row">Total vendido</th>
            <td />
            <td className="os-number font-bold">{formatMoney(arqueo.totalVendido)}</td>
            <td />
            {closed && <td />}
            {closed && <Diff value={arqueo.diferenciaTotal} bold />}
          </tr>
        }
      >
        {arqueo.medios.map((m) => (
          <tr key={m.metodo}>
            <th scope="row" className="font-semibold">{m.etiqueta}</th>
            <td className="os-number">{m.ventas}</td>
            <td className="os-number">{formatMoney(m.vendido)}</td>
            <td className="os-number">{formatMoney(m.esperado)}</td>
            {closed && <td className="os-number">{formatMoney(m.declarado)}</td>}
            {closed && <Diff value={m.diferencia} />}
          </tr>
        ))}
      </DataTable>
      {arqueo.anuladas?.ventas > 0 && (
        <p className="os-help px-3 py-2 text-slate-600">
          {arqueo.anuladas.ventas} venta(s) anulada(s) por {formatMoney(arqueo.anuladas.total)}: no cuentan en lo vendido ni en lo esperado.
        </p>
      )}
    </TableScroll>
  );
}

function Diff({ value, bold = false }) {
  const cents = toCents(value);
  const label = cents === 0 ? "Cuadra" : cents < 0 ? "Faltante" : "Sobrante";
  return (
    <td className={`os-number ${bold ? "font-bold" : ""} ${cents < 0 ? "text-red-800" : ""}`}>
      {formatMoney(value)} <span className="os-sr">({label})</span>
      {cents !== 0 && <span aria-hidden="true" className="ml-1 text-xs">{label}</span>}
    </td>
  );
}
