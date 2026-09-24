// Lo que la pantalla de la etapa Página del producto dice de cada componente: nombre, grupo, qué
// espacios de imagen faltan y un resumen en texto para lectores de pantalla (la vista previa es
// decorativa). Puro.

import { componentById } from "@/lib/shopify/components/catalog";
import type { ConversionComponent, ImageSlot } from "@/lib/shopify/components/define";
import type { ImagePick } from "@/lib/types";
import { LISTING, LISTING_INFO } from "./listing";
import { textsOf } from "./page-schema";

export const PAGE_GROUPS = [
  { kind: "block", title: "Junto al botón de compra", hint: "En la columna del producto, cerca del precio y del botón." },
  { kind: "section", title: "Cuerpo de la página", hint: "Secciones bajo la ficha, en este orden." },
] as const;

/** «DropFlex · Disponibilidad» → «Disponibilidad». */
export function componentName(id: string): string {
  if (id === LISTING) return LISTING_INFO.name;
  return componentById(id)?.name.replace(/^DropFlex · /, "") ?? id;
}

/**
 * La duda que responde, en una línea para la tarjeta. La objeción completa de content.ts es para la
 * IA; esta es para el comerciante. Un componente nuevo sin frase usa el comienzo de su objeción.
 */
const PITCH: Record<string, string> = {
  "review-stars": "¿Otros lo compraron y les fue bien? Estrellas junto al título.",
  "benefit-usps": "¿Cuánto sale el envío? ¿Pago antes? Lo que evita el riesgo, sobre el botón.",
  inventory: "¿Lo tienen y cuándo llega? El stock real y el plazo.",
  "shipping-timeline": "¿Cuándo me llega? Las fechas de despacho y entrega.",
  "benefit-double-box": "¿Cómo pago y qué pasa si no me sirve? Dos tarjetas bajo el botón.",
  "review-slider": "¿Llega bien? ¿Es como en las fotos? Reseñas reales bajo el botón.",
  "ugc-slider": "¿Se ve igual en la vida real? Videos de uso.",
  "stats-with-image": "¿Esto funciona? El resultado con fotos, calificación y un testimonio.",
  "scrolling-benefits": "¿Es seguro comprar aquí? Una cinta con el pago, el envío y los cambios.",
  "image-with-benefits": "¿Qué tiene de especial? La foto con sus razones alrededor.",
  "insta-story": "¿Cómo es en la vida real? Historias con fotos de uso.",
  "comparison-table": "¿Por qué aquí y no algo genérico? Una tabla comparativa.",
  "faq-and-text": "Las últimas dudas antes de pedir, respondidas.",
};

export function componentPitch(c: ConversionComponent): string {
  return PITCH[c.id] ?? `${c.objection.split(/(?<=[?.])\s/)[0]}`;
}

/** Los espacios de imagen con menos fotos que su mínimo. */
export function missingImages(id: string, images: ImagePick[]): ImageSlot[] {
  return (componentById(id)?.imageSlots ?? []).filter((s) => images.filter((p) => p.slot === s.key).length < s.min);
}

const NOT_COPY = /(^|\.)(icon|policy|requires|topic|basis|fact|review_id|excerpt_mode)$/;

/** Lo que dice el componente, en texto plano (sin **, con los tokens tal cual). */
export function componentSummary(content: unknown, max = 220): string {
  const text = textsOf(content)
    .filter((t) => !NOT_COPY.test(t.path))
    .map((t) => t.text.replaceAll("**", "").trim())
    .filter(Boolean)
    .join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
