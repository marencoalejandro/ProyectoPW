// Botón base con las variantes de la guía de diseño. Por defecto es
// type="button": los formularios deben pedir type="submit" de forma explícita.
// Los enlaces de React Router siguen siendo <Link>, aunque usen clases de botón.
const VARIANTS = {
  secondary: "os-btn",
  primary: "os-btn os-btn--primary",
  danger: "os-btn os-btn--danger",
  link: "os-link",
};

export default function Button({ variant = "secondary", type = "button", className = "", children, ...props }) {
  const classes = [VARIANTS[variant] ?? VARIANTS.secondary, className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
