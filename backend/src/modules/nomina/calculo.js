import { fromCents, toCents } from '../../lib/money.js';

// Cálculo de la planilla quincenal de El Salvador. Todo en centavos enteros.
//
// IMPORTANTE: los porcentajes, topes y tramos son parámetros legales que
// cambian. Antes de usar el sistema con salarios reales, verificarlos con las
// fuentes oficiales (ISSS, Superintendencia del Sistema Financiero y
// Ministerio de Hacienda). Valores usados (vigentes según el equipo, 2025-2026):
// - ISSS laboral 3 % con salario máximo cotizable de $1,000 mensuales.
// - AFP laboral 7.25 % sobre el salario devengado (el tope del ingreso base
//   de cotización es muy superior a los salarios de la demo; no se aplica).
// - Renta: tabla de retención quincenal del Decreto Ejecutivo No. 10
//   (abril 2025), sobre el salario menos ISSS y AFP.

export const PARAMETROS = Object.freeze({
  isssPorcentajeBp: 300, // 3 % en puntos básicos
  isssTopeQuincenal: toCents('500.00'), // $1,000 mensuales / 2
  afpPorcentajeBp: 725, // 7.25 %
  rentaQuincenal: Object.freeze([
    // hasta (inclusive), exceso sobre, porcentaje (bp), cuota fija
    { hasta: toCents('275.00'), exceso: 0, porcentajeBp: 0, cuota: 0 },
    { hasta: toCents('447.62'), exceso: toCents('275.00'), porcentajeBp: 1000, cuota: toCents('8.83') },
    { hasta: toCents('1019.05'), exceso: toCents('447.62'), porcentajeBp: 2000, cuota: toCents('30.00') },
    { hasta: Infinity, exceso: toCents('1019.05'), porcentajeBp: 3000, cuota: toCents('144.28') },
  ]),
});

// Redondeo a centavos, mitad hacia arriba (igual que ROUND de PostgreSQL).
const porcentaje = (cents, bp) => Math.floor((2 * cents * bp + 10000) / 20000);

export function calcularRenta(gravableCents) {
  const tramo = PARAMETROS.rentaQuincenal.find((t) => gravableCents <= t.hasta);
  if (tramo.porcentajeBp === 0) return 0;
  return porcentaje(gravableCents - tramo.exceso, tramo.porcentajeBp) + tramo.cuota;
}

/**
 * @param {string} salarioBaseMensual  p. ej. "1100.00"
 * @returns montos de la quincena como texto decimal
 */
export function calcularQuincena(salarioBaseMensual) {
  const bruto = Math.floor((toCents(salarioBaseMensual) + 1) / 2);
  const isss = porcentaje(Math.min(bruto, PARAMETROS.isssTopeQuincenal), PARAMETROS.isssPorcentajeBp);
  const afp = porcentaje(bruto, PARAMETROS.afpPorcentajeBp);
  const renta = calcularRenta(bruto - isss - afp);
  const neto = bruto - isss - afp - renta;
  return {
    salarioBruto: fromCents(bruto),
    isss: fromCents(isss),
    afp: fromCents(afp),
    renta: fromCents(renta),
    salarioNeto: fromCents(neto),
  };
}
