// Mascaras de documentos y telefono de El Salvador.
// El estado guarda solo digitos (valor enviado); la vista muestra el valor
// formateado con guiones (valor de edicion). Asi no viajan guiones a la API.

export const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

// Agrupa los dígitos de forma progresiva: "12345" con [4, 4] → "1234-5".
function group(digits, sizes) {
  const parts = [];
  let i = 0;
  for (const size of sizes) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  return parts.join("-");
}

export const MASKS = Object.freeze({
  // DUI: ########-#
  dui: { maxDigits: 9, inputMode: "numeric", format: (d) => group(d, [8, 1]) },
  // NIT: 9 dígitos (########-#) o 14 (####-######-###-#). Después del noveno
  // dígito se puede seguir escribiendo y pasa al formato de 14.
  nit: {
    maxDigits: 14,
    inputMode: "numeric",
    format: (d) => (d.length <= 9 ? group(d, [8, 1]) : group(d, [4, 6, 3, 1])),
  },
  // NRC: de 1 a 10 dígitos, sin longitud fija ni relleno.
  nrc: { maxDigits: 10, inputMode: "numeric", format: (d) => d },
  // Teléfono: 8 dígitos, ####-####.
  telefono: { maxDigits: 8, inputMode: "tel", format: (d) => group(d, [4, 4]) },
});

/** Solo los dígitos que admite la máscara (valor que se guarda y se envía). */
export function maskDigits(mask, value) {
  return onlyDigits(value).slice(0, MASKS[mask].maxDigits);
}

/** Valor con guiones para mostrar. */
export function formatMasked(mask, value) {
  return MASKS[mask].format(maskDigits(mask, value));
}

/** Posición en el texto formateado justo después del dígito número `count`. */
export function caretAfterDigits(formatted, count) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}
