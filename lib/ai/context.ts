// El contexto que reciben los pasos de IA, en texto corto (docs/spec-prompts-simples.md §3). Reemplaza
// la ficha y el cliente ideal pegados en JSON: con todo el material, el modelo copiaba sus frases en vez
// de pensar (orquestador de ángulos v9, docs/spec-angulos-testeo.md §4.2). Cada paso toma solo lo que
// necesita: los hechos del producto, una línea de quién compra y, solo donde se escribe con sus
// palabras, algunas frases del cliente ideal. Puro, con tests.

import type { CustomerAvatar, ProductBrief } from "@/lib/ai/schemas";
import { speaksToText } from "@/lib/angles/approved";
import { slotLabel, testAngleName, type TestAngle } from "@/lib/angles/catalog";
import { money } from "@/lib/format";

/** Lo que el comerciante escribió puede ser largo (texto del proveedor): basta el comienzo. */
export const SUPPLIER_TEXT_MAX = 2500;
/** Una reseña citable: más larga, se corta. */
const REVIEW_MAX = 300;

const bullets = (items: string[]) => items.map((i) => `- ${i}`);
const clean = (items: (string | null | undefined)[]) => [...new Set(items.map((t) => t?.trim()).filter((t): t is string => Boolean(t)))];

/** Lo comprobado del producto (qué hace, cómo funciona y sus datos), una viñeta por hecho. */
export function productFactLines(b: ProductBrief): string[] {
  return bullets(clean([b.what_it_does, b.how_it_works, ...(b.key_facts ?? []).map((f) => `${f.label}: ${f.value}`)]));
}

/** El producto: su nombre y lo comprobado en la foto y la ficha. No lo que promete el proveedor. */
export function productFacts(b: ProductBrief): string {
  return [`PRODUCTO: ${b.product_name}`, "Lo comprobado en la foto y la ficha:", ...productFactLines(b)].join("\n");
}

/** El texto del proveedor tal cual, recortado: para quien tiene que criticarlo. */
export function supplierText(baseInfo: string): string {
  const base = baseInfo.trim();
  if (!base) return "(nada)";
  return base.length > SUPPLIER_TEXT_MAX ? `${base.slice(0, SUPPLIER_TEXT_MAX)}…` : base;
}

/** Quién compra y para quién, en una línea (el resumen del cliente ideal). */
export function buyerLine(a: CustomerAvatar): string {
  return `QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${a.summary}`;
}

/**
 * Hasta `n` frases o momentos del cliente ideal, alternando lo que dice y cuándo le pasa. Solo para los
 * pasos que escriben con sus palabras (ganchos, página, guion): el resto lo copiaba entero.
 */
export function buyerVoice(a: CustomerAvatar, n: number): string[] {
  const voice = clean(a.voice_of_customer ?? []);
  const moments = clean(a.problems?.trigger_moments ?? []);
  const out: string[] = [];
  for (let i = 0; out.length < n && (i < voice.length || i < moments.length); i++) {
    if (i < voice.length) out.push(voice[i]);
    if (out.length < n && i < moments.length) out.push(moments[i]);
  }
  return [...new Set(out)];
}

/** Las pruebas reales: si hay experto y cuántas reseñas (sin citarlas). */
export function proofLine(b: ProductBrief, reviews?: string[]): string {
  const count = (reviews ?? b.proof?.real_reviews ?? []).filter((r) => r.trim()).length;
  const expert = b.proof?.real_expert?.trim();
  return `PRUEBAS REALES: ${expert ? `experto: ${expert}` : "sin experto"}; ${count ? `${count} reseñas de compradores del mismo producto en otra tienda` : "sin reseñas"}.`;
}

/** Hasta `n` reseñas citables, recortadas. Solo donde se citan (la página, el chat de WhatsApp). */
export function reviewQuotes(reviews: string[], n: number): string[] {
  return clean(reviews)
    .slice(0, n)
    .map((r) => (r.length > REVIEW_MAX ? `${r.slice(0, REVIEW_MAX)}…` : r));
}

/** Los montos de mercado que el comerciante verificó al elegir el ángulo, para los prompts que lo desarrollan. */
export function marketAnchorLine(amounts: number[], currency: string): string {
  return `Ancla de mercado verificada por el comerciante: ${amounts.map((n) => money(n, currency)).join(", ")}. Se puede citar como lo que cuesta la alternativa, nunca como precio de la tienda.`;
}

/**
 * Un ángulo en pocas líneas: título, gancho, a quién le habla y tono (lo que hacía angleMessage, en
 * texto). `anchorCurrency`: con la moneda, también el ancla de mercado que verificó el comerciante; solo
 * los ganchos la pueden usar (decisión del comerciante, 2026-10-04): la página, los estáticos y los
 * guiones siguen solo con PRECIO Y OFERTA. Los ángulos de antes del orquestador v7 no traen gancho: van
 * con su dolor o deseo y su promesa.
 */
export function angleLine(a: TestAngle, anchorCurrency?: string): string {
  return [
    `${slotLabel(a.slot)}: «${testAngleName(a)}»`,
    ...bullets(
      clean([
        a.hook ? `Gancho con que lo eligió el comerciante: «${a.hook}»` : null,
        a.speaks_to ? `Le habla a ${speaksToText(a.speaks_to)}.` : null,
        a.tone ? `Tono: ${a.tone}.` : null,
        a.hook ? null : a.pain_or_desire ? `Dolor o deseo: ${a.pain_or_desire}` : null,
        a.hook ? null : a.promise ? `Promesa: ${a.promise}` : null,
        anchorCurrency && a.market_amounts?.length ? marketAnchorLine(a.market_amounts, anchorCurrency) : null,
      ]),
    ),
  ].join("\n");
}
