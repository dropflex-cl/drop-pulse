// Textos del evento por producto (docs/spec-eventos.md › Copy de evento): una llamada chica que
// adapta al evento la barra de aviso, la bajada y la etiqueta del precio, a partir de lo que YA
// aprobó el comerciante. Avatar, ángulos y ficha son solo de lectura: el texto del evento mantiene
// el ángulo principal y cambia el enfoque; nunca crea ángulos ni cambia a quién le habla la página.
// Se guarda aparte (event_copy): el copy de page_components nunca se toca. Puro.
import * as z from "zod/v4";
import { marketBlock } from "@/lib/ai/prompts";
import { FORBIDDEN, INTERNAL, amountsIn } from "@/lib/copy/schemas";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import type { PackLabel } from "@/lib/ai/schemas";
import { ANNOUNCEMENT_MAX, BADGE_MAX, type EventTheme } from "./catalog";

/** Bump cuando cambie el prompt o el esquema. */
export const EVENT_COPY_PROMPT_VERSION = 1;
export const SUBTITLE_MIN = 40;
export const SUBTITLE_MAX = 160;

const plain = (field: string) => z.string().refine((s) => !/[<>*#]/.test(s), { message: `${field}: texto plano, sin HTML ni markdown` });

export const eventCopySchema = z.object({
  announcement: plain("announcement")
    .pipe(z.string().min(10).max(ANNOUNCEMENT_MAX))
    .describe("Barra de aviso arriba de la tienda: el evento + por qué comprar ahora este producto. Una frase."),
  subtitle: plain("subtitle")
    .pipe(z.string().min(SUBTITLE_MIN).max(SUBTITLE_MAX))
    .describe("Bajada bajo el título durante el evento: la descripción corta aprobada con el enfoque del evento. Mismo resultado y mismo dato que la sostiene."),
  badge_label: plain("badge_label")
    .pipe(z.string().min(2).max(BADGE_MAX))
    .describe("Etiqueta junto al precio, en MAYÚSCULAS, sin porcentaje ni montos (la tienda agrega el % real). Ej.: «BLACK», «REGALO»."),
});
export type EventCopy = z.infer<typeof eventCopySchema>;

export const EVENT_COPY_FIELDS: Record<keyof EventCopy, { label: string; max: number }> = {
  announcement: { label: "Barra de aviso", max: ANNOUNCEMENT_MAX },
  subtitle: { label: "Bajada bajo el título", max: SUBTITLE_MAX },
  badge_label: { label: "Etiqueta del precio", max: BADGE_MAX },
};

export interface EventCopyContext {
  event: { name: string; startsLabel: string; endsLabel: string; theme: EventTheme };
  /** La ficha aprobada (lib/copy/listing.ts). */
  listing: { title: string; short_name: string; short_description: string; offer_line: string };
  avatarSummary: string;
  /** El ángulo principal aprobado: se mantiene, solo cambia el enfoque. */
  primaryAngle: { name: string; core_message: string };
  pricing: PricingPlan;
  labels?: PackLabel[];
}

export function eventCopySystem(market: Market): string {
  return [
    "Adaptas los textos de una página de producto a un evento de compras (Cyber, Black Friday, Navidad…) para una tienda de dropshipping con pago contra entrega. La página ya está escrita y aprobada: tú solo escribes tres textos que se ven mientras dura el evento y después desaparecen.",
    "",
    marketBlock(market),
    "",
    "REGLAS QUE NO SE NEGOCIAN",
    "- No cambias a quién le habla la página ni el ángulo: mantienes el ÁNGULO PRINCIPAL y el resultado de la bajada aprobada, y solo cambias el enfoque hacia el evento (ej.: «ahorra tiempo en la cocina» → «el regalo que le ahorra tiempo»).",
    "- Nada inventado: ni descuentos, ni porcentajes, ni cupos, ni «últimas unidades», ni plazos de entrega. La tienda muestra el % de ahorro real y la cuenta regresiva hasta la fecha real del evento.",
    "- Montos: solo los de PRECIO Y OFERTA, tal cual, y solo si hacen falta. Nunca un porcentaje.",
    "- Fechas: solo las del EVENTO que te damos.",
    "- Salud y bienestar: «ayuda a», «diseñado para». Nunca «cura», resultados garantizados ni enfermedades.",
    "- Escribe para el comprador: nunca nombres «la ficha», los ángulos, «precio y oferta» ni el cliente ideal. Sin marcas de terceros. Texto plano, sin emojis.",
  ].join("\n");
}

export function eventCopyUser(c: EventCopyContext, retry: string[] = []): string {
  return [
    `EVENTO: ${c.event.name}. En la tienda desde ${c.event.startsLabel} hasta ${c.event.endsLabel}.`,
    `Concepto: ${c.event.theme.copy_concept}`,
    `Textos por defecto del evento (genéricos, mejóralos para este producto): barra «${c.event.theme.announcement}», etiqueta «${c.event.theme.badge_label}».`,
    "",
    "PÁGINA APROBADA (no la cambias; tus textos tienen que calzar con ella)",
    `- Título: ${c.listing.title}`,
    `- Nombre corto: ${c.listing.short_name}`,
    `- Bajada: ${c.listing.short_description}`,
    `- Oferta: ${c.listing.offer_line}`,
    "",
    `CLIENTE IDEAL (solo lectura): ${c.avatarSummary}`,
    `ÁNGULO PRINCIPAL (solo lectura, se mantiene): ${c.primaryAngle.name}. ${c.primaryAngle.core_message}`,
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Escribe los tres textos del evento.",
  ].join("\n");
}

/** Lo que el esquema no puede ver: montos que no existen, porcentajes, palabras internas, promesas. */
export function eventCopyProblems(copy: EventCopy, facts: { currency: string; amounts: number[] }): string[] {
  const problems: string[] = [];
  for (const [field, text] of Object.entries(copy) as [keyof EventCopy, string][]) {
    if (/%|por ?ciento/i.test(text)) problems.push(`${field}: sin porcentajes (la tienda muestra el ahorro real).`);
    if (INTERNAL.test(text)) problems.push(`${field}: nombra algo interno; escribe para el comprador.`);
    if (FORBIDDEN.some((r) => r.test(text))) problems.push(`${field}: promesa prohibida.`);
    const wrong = amountsIn(text, facts.currency).filter((n) => !facts.amounts.includes(n));
    if (wrong.length) problems.push(`${field}: montos que no están en PRECIO Y OFERTA (${wrong.join(", ")}).`);
  }
  if (copy.badge_label !== copy.badge_label.toUpperCase()) problems.push("badge_label: en mayúsculas.");
  if (/\d/.test(copy.badge_label.replace(/11\.11/g, ""))) problems.push("badge_label: sin números.");
  return problems;
}

/** Valida lo que edita el comerciante (mismos límites que la IA). Devuelve el texto limpio o el error. */
export function parseEditedCopy(input: unknown): { ok: true; copy: EventCopy } | { ok: false; field?: string; error: string } {
  const trimmed = input && typeof input === "object" ? Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) : {};
  const parsed = eventCopySchema.safeParse({ ...trimmed, badge_label: typeof trimmed.badge_label === "string" ? trimmed.badge_label.toUpperCase() : trimmed.badge_label });
  if (parsed.success) return { ok: true, copy: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  const meta = EVENT_COPY_FIELDS[field as keyof EventCopy];
  return { ok: false, field, error: meta ? `${meta.label}: entre ${field === "subtitle" ? SUBTITLE_MIN : field === "announcement" ? 10 : 2} y ${meta.max} caracteres, texto plano.` : "Revisa los textos." };
}
