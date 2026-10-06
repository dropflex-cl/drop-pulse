// Contrato y validadores de textos de eventos conservados. Sin redacción automática.

import { FORBIDDEN, INTERNAL, amountAllowed, amountsIn } from "@/lib/copy/schemas";
import * as z from "zod/v4";
import { ANNOUNCEMENT_MAX, BADGE_MAX } from "./catalog";

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

/** Lo que el esquema no puede ver: montos que no existen, porcentajes, palabras internas, promesas. */
export function eventCopyProblems(copy: EventCopy, facts: { currency: string; amounts: number[] }): string[] {
  const problems: string[] = [];
  for (const [field, text] of Object.entries(copy) as [keyof EventCopy, string][]) {
    if (/%|por ?ciento/i.test(text)) problems.push(`${field}: sin porcentajes (la tienda muestra el ahorro real).`);
    if (INTERNAL.test(text)) problems.push(`${field}: nombra algo interno; escribe para el comprador.`);
    if (FORBIDDEN.some((r) => r.test(text))) problems.push(`${field}: promesa prohibida.`);
    const wrong = amountsIn(text, facts.currency).filter((n) => !amountAllowed(n, facts.amounts));
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
