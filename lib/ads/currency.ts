// Montos de Meta (docs/spec-anuncios.md §4.1 y §9). Portado de dropflex (lib/ads/meta/currency.ts).
// Meta recibe los presupuestos en la unidad mínima de la moneda, y ese factor no siempre es 100:
// CLP, COP o JPY usan 1; BHD o KWD, 1000. Equivocarse financia una campaña 100 veces de más o de
// menos: se convierte siempre de forma explícita. Puro.

import { roundingFor } from "@/lib/pricing/calculator";

/** Monedas sin decimales para Meta (factor 1). */
const ZERO_DECIMAL = new Set(["CLP", "JPY", "KRW", "VND", "COP", "ISK", "HUF", "TWD", "UGX", "PYG"]);
/** Monedas con 3 decimales para Meta (factor 1000). */
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

/** Factor de la unidad mínima (por defecto 100: dos decimales). */
export function currencyMinorUnitFactor(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 1;
  if (THREE_DECIMAL.has(code)) return 1000;
  return 100;
}

/** Monto → entero en unidades mínimas para la API de Meta. */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * currencyMinorUnitFactor(currency));
}

/** Entero en unidades mínimas de Meta → monto. */
export function fromMinorUnits(minor: number, currency: string): number {
  return minor / currencyMinorUnitFactor(currency);
}

/**
 * Pesos chilenos por unidad de cada moneda. Solo sirve para precargar los montos de las plantillas
 * (escritas en CLP) en la moneda de la cuenta: el comerciante los ve y los cambia. No es una
 * cotización y no se usa para nada que cobre.
 */
export const CLP_PER_UNIT: Record<string, number> = {
  CLP: 1,
  USD: 950,
  EUR: 1030,
  MXN: 52,
  COP: 0.23,
  PEN: 255,
  ARS: 1,
  BRL: 170,
  UYU: 23,
  PYG: 0.12,
  BOB: 137,
  GTQ: 123,
  CRC: 1.85,
  DOP: 16,
};

/** Un presupuesto redondeado para la moneda: en miles de a 100 (CLP, COP…), en el resto a la unidad. */
export function roundBudget(amount: number, currency: string): number {
  const step = roundingFor(currency).step;
  return Math.max(step, Math.round(amount / step) * step);
}

/** Un monto de plantilla (en CLP) en la moneda de la cuenta, redondeado. Moneda desconocida: como USD. */
export function fromClp(amountClp: number, currency: string): number {
  const rate = CLP_PER_UNIT[currency.toUpperCase()] ?? CLP_PER_UNIT.USD;
  return roundBudget(amountClp / rate, currency);
}
