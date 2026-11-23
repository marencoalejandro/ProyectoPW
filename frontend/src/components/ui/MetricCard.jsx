// Tarjeta de métrica para usar dentro de un <dl>: etiqueta (dt), valor (dd) y,
// si se indica, el período al que corresponde (dd secundario).
export default function MetricCard({ label, value, period, className = "" }) {
  return (
    <div className={className ? `os-card bg-white/70 ${className}` : "os-card bg-white/70"}>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="os-metric">{value}</dd>
      {period && <dd className="os-help text-slate-600">{period}</dd>}
    </div>
  );
}
