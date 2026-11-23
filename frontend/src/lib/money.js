// La API envía dinero como cadenas decimales ("3.50"). En el navegador se
// trabaja en centavos enteros para no acumular errores de punto flotante.

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,}))?$/.exec(text);
  if (!match) return 0;
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return sign ? -cents : cents;
}

export function centsToDecimal(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const usd = new Intl.NumberFormat("es-SV", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

/** Formatea una cadena decimal de la API o un número de centavos. */
export function formatMoney(value, { cents = false } = {}) {
  const amount = cents ? value / 100 : toCents(value) / 100;
  return usd.format(amount);
}

/** Valida un monto escrito por el usuario: hasta `decimals` decimales, >= 0. */
export function isValidAmount(text, decimals = 2) {
  return new RegExp(String.raw`^\d{1,9}(\.\d{1,${decimals}})?$`).test(String(text).trim());
}
