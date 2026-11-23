export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="os-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }) {
  return (
    <section className={`os-card bg-white/70 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="os-heading">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const BADGE_TONES = {
  default: "os-badge",
  attention: "os-badge os-badge--attention",
  ok: "os-badge bg-accent/30",
  muted: "os-badge bg-slate-200 text-slate-700",
};

export function Badge({ tone = "default", className = "", children }) {
  const toneClass = BADGE_TONES[tone] ?? BADGE_TONES.default;
  return <span className={className ? `${toneClass} ${className}` : toneClass}>{children}</span>;
}

// Tabla dentro de .os-scroll: si desborda, la región es enfocable y tiene
// nombre, para poder desplazarla con el teclado (guía de diseño, §6).
export function TableScroll({ label, children }) {
  return (
    <div
      className="os-scroll rounded-(--radius-control) border border-secondary bg-white"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
