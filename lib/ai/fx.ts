import "server-only";
import { cacheLife } from "next/cache";

// Tipo de cambio para mostrar el costo de IA (que se cobra en dólares) en la moneda de la tienda.
// Es una referencia: la tarjeta siempre muestra también el equivalente en dólares.

/** Unidades por dólar, de respaldo si el servicio de tipo de cambio no responde. */
const FALLBACK: Record<string, number> = {
  ARS: 1200, BOB: 6.9, BRL: 5.5, CLP: 950, COP: 4000, CRC: 510, DOP: 60, GTQ: 7.7,
  HNL: 26, MXN: 18.5, NIO: 36.7, PEN: 3.6, PYG: 7500, USD: 1, UYU: 40,
};

async function latestRates(): Promise<Record<string, number> | null> {
  "use cache";
  cacheLife("days");
  try {
    // Servicio público sin clave; se consulta una vez al día por instancia de caché.
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    return data.result === "success" && data.rates ? data.rates : null;
  } catch {
    return null;
  }
}

/** Unidades de `currency` por dólar. */
export async function usdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  const rate = (await latestRates())?.[currency];
  return rate && rate > 0 ? rate : (FALLBACK[currency] ?? 1);
}
