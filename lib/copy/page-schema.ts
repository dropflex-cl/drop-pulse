// Contratos y validación del contenido del editor y del chat. Sin redacción automática.

import * as z from "zod/v4";
import { componentById } from "@/lib/shopify/components/catalog";
import { contentVariants, isVariants, landingSelections, selectVariant, storedContentSchema, variantsSchema } from "./variants";
import { LISTING, listingSchema } from "./listing";
import { COD, FORBIDDEN, INTERNAL, amountAllowed, amountsIn } from "./schemas";

// Los mensajes de validación llegan al comerciante (hoja de edición) y al modelo: en español y
// simples. Los largos y cantidades con frase propia; el resto, el idioma de zod.
z.config(z.locales.es());
z.config({
  customError: (iss) => {
    const n = Number((iss as { maximum?: unknown; minimum?: unknown }).maximum ?? (iss as { minimum?: unknown }).minimum);
    if (iss.code === "too_big" && iss.origin === "string") return `Pasa de ${n} caracteres.`;
    if (iss.code === "too_small" && iss.origin === "string") return n <= 1 ? "Escribe este texto." : `Escribe al menos ${n} caracteres.`;
    if (iss.code === "too_big" && iss.origin === "array") return `Son ${n} como máximo.`;
    if (iss.code === "too_small" && iss.origin === "array") return `Son ${n} como mínimo.`;
    if (iss.code === "invalid_type" && iss.input === undefined) return "Falta este campo.";
    return undefined;
  },
});

/** El esquema estricto de la ficha o de un componente. */
export function baseContentSchema(id: string): z.ZodType | null {
  if (id === LISTING) return listingSchema;
  return componentById(id)?.content ?? null;
}

/** El editor y el MCP guardan objetos legacy o arrays de variantes validadas. */
export function strictSchema(id: string): z.ZodType | null {
  const schema = baseContentSchema(id);
  return schema ? storedContentSchema(schema) : null;
}

export interface PageOutput {
  listing: unknown;
  components: Record<string, unknown>;
}

// ---------------------------------------------------------------- Validación

export interface PageFacts {
  currency: string;
  /** Los montos que se pueden nombrar (lib/copy/schemas.ts › allowedAmounts). */
  amounts: number[];
  /** Ids de las reseñas aprobadas que la IA puede citar. */
  reviewIds: string[];
  /** Los datos que dio el comerciante (ficha y Información base): de aquí salen los números de la pregunta de duración. */
  factText?: string;
}

/** Números de un texto, normalizados («1,5» y «1.5» son el mismo). */
const numbersIn = (t: string) => [...t.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));

/**
 * Números de la pregunta de duración que no salen de los datos del comerciante. Se aceptan también
 * los múltiplos por pack (2 o 3 veces un número de los datos: «3 frascos rinden de 3 a 4 meses»).
 */
export function unsupportedNumbers(answer: string, factText: string): string[] {
  const known = new Set(numbersIn(factText).map(Number));
  const ok = (n: number) => [...known].some((k) => [1, 2, 3].some((m) => Math.abs(k * m - n) < 1e-9)) || n <= 3;
  return numbersIn(answer).filter((x) => !ok(Number(x)));
}

/** Los problemas del esquema estricto, en el formato que entiende el modelo («faq-and-text.items.2.answer: …»). */
export function schemaProblems(id: string, value: unknown): string[] {
  const base = baseContentSchema(id);
  const schema = base && isVariants(value) ? variantsSchema(base) : base;
  if (!schema) return [`${id}: no existe en el catálogo.`];
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.slice(0, 8).map((i) => `${[id, ...i.path].join(".")}: ${i.message}`);
}

/** Todos los textos de un valor json, con su ruta. */
export function textsOf(value: unknown, path: string[] = []): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path: path.join("."), text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => textsOf(v, [...path, String(i)]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => textsOf(v, [...path, k]));
  return [];
}

/** Campos que no son texto para el comprador: claves, ids y enums. */
const NOT_COPY = /(^|\.)(icon|policy|requires|topic|basis|fact|review_id|excerpt_mode)$/;

/** Los ids de reseña que usa un componente. */
function reviewIdsIn(id: string, value: unknown): string[] {
  if (id === "review-slider" || id === "review-wall") return ((value as { items?: { review_id?: string }[] })?.items ?? []).map((i) => i.review_id ?? "");
  if (id === "stats-with-image") {
    const r = (value as { review_id?: string })?.review_id;
    return r ? [r] : [];
  }
  return [];
}

/**
 * Qué está mal en la respuesta: el esquema estricto de cada parte, reseñas que no existen, montos
 * que no son los de PRECIO Y OFERTA, palabras internas, promesas prohibidas, la frase de la oferta
 * sin el pago al recibir y el mismo texto en dos componentes. Vacío si se puede guardar.
 */
export function pageProblems(out: PageOutput, ids: string[], facts: PageFacts): string[] {
  if (ids.some((id) => isVariants(id === LISTING ? out.listing : out.components?.[id]))) {
    const all = ids.map((id) => id === LISTING ? out.listing : out.components?.[id]);
    const shape = ids.flatMap((id, i) => schemaProblems(id, all[i]));
    if (shape.length) return shape;
    const checks = landingSelections(all).flatMap((selection) => {
      const selected = Object.fromEntries(ids.map((id, i) => [id, selectVariant(all[i], selection).content]));
      return pageProblems({ listing: selected.listing ?? null, components: selected }, ids, facts)
        .map((p) => `${selection.key}: ${p}`);
    });
    // También validar variantes que comparten selector entre componentes (no se pierden por el map).
    for (const id of ids) for (const v of contentVariants(id === LISTING ? out.listing : out.components?.[id])) {
      checks.push(...pageProblems({ listing: id === LISTING ? v.content : null, components: { [id]: v.content } }, [id], facts).map((p) => `${v.key}: ${p}`));
    }
    return [...new Set(checks)];
  }
  const problems: string[] = [];
  const parts: [string, unknown][] = [];
  for (const id of ids) {
    const value = id === LISTING ? out.listing : out.components?.[id];
    if (value == null) {
      problems.push(`Falta ${id === LISTING ? "listing" : `components.${id}`}.`);
      continue;
    }
    problems.push(...schemaProblems(id, value));
    parts.push([id, value]);
  }

  for (const [id, value] of parts) {
    const used = reviewIdsIn(id, value);
    const unknown = used.filter((r) => !facts.reviewIds.includes(r));
    if (unknown.length) problems.push(`${id}: estas reseñas no están en RESEÑAS APROBADAS: ${unknown.join(", ")}. Usa solo esos ids.`);
    if (new Set(used).size < used.length) problems.push(`${id}: repetiste una reseña.`);
  }

  const texts = parts.flatMap(([id, value]) => textsOf(value, [id]).filter((t) => !NOT_COPY.test(t.path)));
  const internal = texts.find((t) => INTERNAL.test(t.text));
  if (internal) problems.push(`${internal.path} usa una palabra interna («${internal.text.match(INTERNAL)![0]}»): escribe para el comprador, sin nombrar la ficha, los ángulos ni el precio y oferta.`);
  // La ruta identifica el campo que debe corregirse en el editor o en el chat.
  for (const t of texts) {
    const wrong = [...new Set(amountsIn(t.text, facts.currency).filter((n) => !amountAllowed(n, facts.amounts)))];
    if (wrong.length) problems.push(`${t.path}: estos montos no están en PRECIO Y OFERTA: ${wrong.join(", ")}. Usa solo esos números.`);
  }
  for (const re of FORBIDDEN) {
    const hit = texts.find((t) => re.test(t.text));
    if (hit) problems.push(`${hit.path} tiene una promesa prohibida («${hit.text.match(re)![0]}»): usa «ayuda a» o «diseñado para».`);
  }

  // La pregunta de duración puede llevar números, pero solo los que dio el comerciante.
  if (facts.factText !== undefined) {
    const faq = parts.find(([id]) => id === "faq-and-text")?.[1] as { items?: { topic?: string; answer?: string }[] } | undefined;
    (faq?.items ?? []).forEach((item, i) => {
      if (item.topic !== "duracion" || !item.answer) return;
      const bad = unsupportedNumbers(item.answer, facts.factText!);
      if (bad.length) problems.push(`faq-and-text.items.${i}.answer: ${bad.join(", ")} no sale de los datos del producto. Usa solo el rendimiento que dio el comerciante.`);
    });
  }

  const offer = (out.listing as { offer_line?: string } | null)?.offer_line;
  if (ids.includes(LISTING) && offer && !COD.test(offer)) problems.push("listing.offer_line tiene que cerrar con el pago al recibir («Paga al recibir»).");

  // La misma frase en dos componentes: cada objeción se responde en un solo lugar. Las etiquetas
  // cortas («Pagas al recibir») sí se repiten a propósito: el pago al recibir va en varios.
  const seen = new Map<string, string>();
  for (const t of texts) {
    const key = t.text.trim().toLowerCase();
    if (key.length < 40) continue;
    const first = seen.get(key);
    const owner = t.path.split(".")[0];
    if (first && first.split(".")[0] !== owner) problems.push(`${t.path} repite lo que ya dice ${first}: cada componente responde algo distinto.`);
    else if (!first) seen.set(key, t.path);
  }
  return problems;
}
