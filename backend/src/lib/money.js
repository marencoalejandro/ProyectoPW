// Dinero en centavos enteros: evita los errores de redondeo de float.
// La BD devuelve NUMERIC como texto ("3.50") y las respuestas usan texto.

export const IVA_TASA_BP = 1300; // 13 % en puntos básicos

export function toCents(value) {
  const text = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Monto inválido: ${text}`);
  const [, sign, units, decimals = ''] = match;
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  return sign ? -cents : cents;
}

export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// División entera redondeando la mitad hacia arriba (enteros no negativos).
function divRound(numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Desglose de un total con IVA incluido (precio al público).
 * subtotal = total / 1.13 redondeado a centavos; IVA = total - subtotal.
 * Ej.: 1130 → { subtotal: 1000, iva: 130, total: 1130 }.
 */
export function desglosarIva(totalCents) {
  const subtotal = divRound(totalCents * 10000, 10000 + IVA_TASA_BP);
  return { subtotal, iva: totalCents - subtotal, total: totalCents };
}
