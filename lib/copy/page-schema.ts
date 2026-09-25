// La salida de la llamada única del redactor de página (docs/spec-pagina-componentes.md › 3): la ficha
// y el contenido de cada componente del catálogo, en un solo objeto. Puro.
//
// Dos esquemas por componente:
// - el ESTRICTO (content.ts): largos, tokens, refinamientos. Valida la respuesta y lo que guarda el
//   comerciante;
// - el HOLGADO (loosen): la misma forma sin límites ni refinamientos, con los límites escritos en la
//   descripción. Es el que va a la salida estructurada: la gramática no admite la mayoría de los
//   límites y un refinamiento que falla dentro del SDK rompería la llamada sin decir qué corregir.
// Si la respuesta no pasa el estricto, se pide otra con los problemas (pageProblems); nunca se
// recorta ni se completa en silencio.

import * as z from "zod/v4";
import { CATALOG, componentById } from "@/lib/shopify/components/catalog";
import type { ConversionComponent } from "@/lib/shopify/components/define";
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

/** Los componentes que escribe la IA (los que tienen metafield de contenido), en el orden de la página. */
export const WRITTEN: ConversionComponent[] = CATALOG.filter((c) => c.metafield);

/**
 * Qué escribir: la ficha y los componentes con texto que no están aprobados. Los que necesitan
 * reseñas aprobadas y no las tienen quedan fuera (la IA elegiría reseñas que no hay).
 */
export function toWrite(rows: { component: string; status: string }[], approvedReviews: number): string[] {
  const kept = new Set(rows.filter((r) => r.status === "approved").map((r) => r.component));
  return [LISTING, ...WRITTEN.filter((c) => approvedReviews >= (c.minReviews ?? 0)).map((c) => c.id)].filter((id) => !kept.has(id));
}

/** El esquema estricto de la ficha o de un componente. */
export function strictSchema(id: string): z.ZodType | null {
  if (id === LISTING) return listingSchema;
  return componentById(id)?.content ?? null;
}

// ---------------------------------------------------------------- Holgado

type Def = { type: string; [k: string]: unknown };
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Los límites que la gramática no aplica, dichos en palabras («8 a 40 caracteres»). */
function limits(s: z.ZodType): string {
  let js: Record<string, unknown>;
  try {
    js = z.toJSONSchema(s, { unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return "";
  }
  const range = (min: unknown, max: unknown, unit: string) => {
    if (typeof min === "number" && typeof max === "number") return min === max ? `exactamente ${min} ${unit}` : `${min} a ${max} ${unit}`;
    if (typeof max === "number") return `máximo ${max} ${unit}`;
    if (typeof min === "number" && min > 0) return `mínimo ${min} ${unit}`;
    return "";
  };
  if (js.type === "string") return range(js.minLength, js.maxLength, "caracteres");
  if (js.type === "array") return range(js.minItems, js.maxItems, "elementos");
  return "";
}

function describe<S extends z.ZodType>(loose: S, description: string | undefined, rule: string): S {
  const text = [description, rule && `(${rule})`].filter(Boolean).join(" ");
  return text ? loose.describe(text) : loose;
}

/** La misma forma sin límites ni refinamientos; las descripciones y los límites quedan en el texto. */
export function loosen(schema: z.ZodType, description = schema.description): z.ZodType {
  const def = defOf(schema);
  switch (def.type) {
    case "optional":
      return loosen(def.innerType as z.ZodType, description ?? (def.innerType as z.ZodType).description).optional();
    case "nullable":
      return loosen(def.innerType as z.ZodType, description ?? (def.innerType as z.ZodType).description).nullable();
    case "pipe": {
      const out = def.out as z.ZodType;
      return loosen(out, description ?? out.description ?? (def.in as z.ZodType).description);
    }
    case "object": {
      const shape = def.shape as Record<string, z.ZodType>;
      return describe(z.object(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, loosen(v)]))), description, "");
    }
    case "array":
      return describe(z.array(loosen(def.element as z.ZodType)), description, limits(schema));
    case "union":
      return describe(z.union((def.options as z.ZodType[]).map((o) => loosen(o)) as [z.ZodType, z.ZodType, ...z.ZodType[]]), description, "");
    case "string":
      return describe(z.string(), description, limits(schema));
    case "enum":
    case "literal":
    case "number":
    case "boolean":
      return description ? schema.describe(description) : schema;
    default:
      throw new Error(`page-schema: tipo ${def.type} sin versión holgada`);
  }
}

/** Lo que pide la escritura: la ficha (si no está aprobada) y los componentes que faltan. */
export function pageSchema(ids: string[]) {
  const components = WRITTEN.filter((c) => ids.includes(c.id));
  return z.object({
    listing: ids.includes(LISTING) ? loosen(listingSchema, "La ficha del producto (campos nativos de Shopify).") : z.null().describe("Ya aprobada: null."),
    components: z
      .object(Object.fromEntries(components.map((c) => [c.id, loosen(c.content, `${c.name}: ${c.objection}`)])))
      .describe("Un objeto por componente, con su id del catálogo."),
  });
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

/** El texto con los datos del producto contra el que se comprueban los números de uso (duración, contenido). */
export function productFactText(brief: { key_facts?: { label: string; value: string }[]; what_it_does?: string } | null, baseInfo: string | null | undefined): string {
  return [...(brief?.key_facts ?? []).map((f) => `${f.label}: ${f.value}`), brief?.what_it_does ?? "", baseInfo ?? ""].join("\n");
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
  const schema = strictSchema(id);
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
  if (id === "review-slider") return ((value as { items?: { review_id?: string }[] })?.items ?? []).map((i) => i.review_id ?? "");
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
  // Con su ruta, para que la corrección reescriba solo la parte que los nombra (failingParts).
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

// ---------------------------------------------------------------- Corrección por partes

/**
 * Las partes (la ficha o un componente) que nombran los problemas, en el orden de `ids`, o null si
 * alguno no se puede atribuir a una parte: entonces se corrige la página entera.
 */
export function failingParts(problems: string[], ids: string[]): string[] | null {
  const owners = new Set<string>();
  for (const p of problems) {
    const owner = p.match(/^Falta (?:components\.)?([\w-]+)\.$/)?.[1] ?? p.split(/[.:\s]/)[0];
    if (!ids.includes(owner)) return null;
    owners.add(owner);
  }
  return ids.filter((id) => owners.has(id));
}

/** Solo esas partes de una respuesta (lo que se le devuelve al modelo para corregir). */
export function partialOutput(out: PageOutput, ids: string[]): PageOutput {
  return {
    listing: ids.includes(LISTING) ? out.listing : null,
    components: Object.fromEntries(Object.entries(out.components ?? {}).filter(([id]) => ids.includes(id))),
  };
}

/** La respuesta con las partes corregidas en lugar de las anteriores. */
export function mergeOutput(out: PageOutput, fix: PageOutput, ids: string[]): PageOutput {
  return {
    listing: ids.includes(LISTING) ? fix.listing : out.listing,
    components: { ...out.components, ...partialOutput(fix, ids).components },
  };
}
