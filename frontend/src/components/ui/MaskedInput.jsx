import { useLayoutEffect, useRef } from "react";
import { Field } from "./Field";
import { caretAfterDigits, MASKS, maskDigits, onlyDigits } from "../../lib/masks";

// Campo administrativo con máscara: mask = "dui" | "nit" | "nrc" | "telefono".
// `value` son solo dígitos y `onValueChange(digitos)` devuelve solo dígitos:
// eso es lo que se valida y se envía. El input muestra el valor con guiones.
// Acepta pegar con o sin guiones, conserva ceros iniciales y mantiene el cursor
// al editar en medio; el retroceso sobre un guion borra el dígito anterior.
export default function MaskedInput({
  mask,
  value,
  onValueChange,
  onKeyDown,
  label,
  error,
  hint,
  required,
  className,
  inputClassName = "",
  ...props
}) {
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const config = MASKS[mask];
  const digits = maskDigits(mask, value);
  const display = config.format(digits);

  // Tras pintar el nuevo valor formateado se recoloca el cursor.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caretRef.current === null || !input) return;
    if (document.activeElement === input) input.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  });

  function commit(input, nextDigits, digitsBeforeCaret) {
    const formatted = config.format(nextDigits);
    const caret = caretAfterDigits(formatted, digitsBeforeCaret);
    if (nextDigits === digits) {
      // Sin cambio de dígitos (una letra, un guion de más): React no vuelve a
      // pintar, así que se restauran el texto y el cursor aquí mismo.
      input.value = formatted;
      input.setSelectionRange(caret, caret);
      return;
    }
    caretRef.current = caret;
    onValueChange(nextDigits);
  }

  function handleChange(event) {
    const input = event.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const nextDigits = onlyDigits(raw).slice(0, config.maxDigits);
    const before = Math.min(onlyDigits(raw.slice(0, caret)).length, nextDigits.length);
    commit(input, nextDigits, before);
  }

  // Borrar sobre un separador elimina el dígito vecino en vez de solo mover el
  // cursor por encima del guion.
  function handleKeyDown(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const input = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = input;
    if (start === null || start !== end) return;
    const text = input.value;
    if (event.key === "Backspace" && start > 0 && !/\d/.test(text[start - 1])) {
      const index = onlyDigits(text.slice(0, start)).length - 1;
      if (index < 0) return;
      event.preventDefault();
      commit(input, digits.slice(0, index) + digits.slice(index + 1), index);
    } else if (event.key === "Delete" && start < text.length && !/\d/.test(text[start])) {
      const index = onlyDigits(text.slice(0, start)).length;
      if (index >= digits.length) return;
      event.preventDefault();
      commit(input, digits.slice(0, index) + digits.slice(index + 1), index);
    }
  }

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(aria) => (
        <input
          ref={inputRef}
          type="text"
          inputMode={config.inputMode}
          autoComplete="off"
          className={`os-input bg-white ${inputClassName}`}
          {...aria}
          {...props}
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      )}
    </Field>
  );
}
