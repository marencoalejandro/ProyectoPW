import { useId } from "react";
import Select from "./Select";

// Campo de formulario con etiqueta, ayuda y error asociados por aria.
export function Field({ label, error, hint, required, children, className = "" }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`os-field ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="os-help text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="os-help font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, required, className, inputClassName = "", ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(aria) => <input className={`os-input bg-white ${inputClassName}`} {...aria} {...props} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, required, className, children, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(aria) => (
        <Select {...aria} {...props}>
          {children}
        </Select>
      )}
    </Field>
  );
}
