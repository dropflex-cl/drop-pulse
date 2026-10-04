// El crítico de ganchos: una persona del cliente ideal que recorre Reels y mira los 10 ganchos de un
// ángulo como los vería (1 s, primero sin sonido), sin la justificación del autor. Existe porque el
// agente que escribe los ganchos también se ponía la nota: en el amplificador de sonido (2026-10-03),
// 19 de 20 ganchos sacaron 4 en saliencia y ninguno nombraba el problema en pantalla. Su orden decide
// el recomendado y, si detiene a pocos, los que no lo detienen se reescriben una vez (lib/pipeline/hooks.ts).
// Puro. Regla de caché: el system depende solo del mercado.

import * as z from "zod/v4";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar } from "@/lib/ai/schemas";
import type { Market } from "@/lib/market";
import { OPENING_SHOT_DEFS } from "./catalog";
import type { HooksCritique } from "./prompts";
import type { HookOut, HooksReview } from "./schemas";

/** Bump cuando cambie el prompt o el esquema del crítico. 2: quién eres sale del cliente ideal v6 (por qué compra y qué lo frena, sin frases). */
export const HOOK_CRITIC_PROMPT_VERSION = 2;

const text = z.string();

export const hookCriticSchema = z.object({
  reviews: z
    .array(
      z.object({
        hook: z.number().int().describe("El número del gancho, desde 0."),
        understood_muted: text.describe("Qué entendiste en 1 s SIN sonido, solo con el texto en pantalla y la primera toma, en una frase. Si no sabes de qué se trata, dilo así."),
        stops: z.boolean().describe("¿Te detienes a mirar? Sé honesta: la mayoría de los anuncios no detienen a nadie."),
        why: text.describe("Por qué sí o por qué no, en una frase corta en español, para el comerciante."),
      }),
    )
    .describe("Uno por gancho, en el orden en que vienen."),
  order: z.array(z.number().int()).describe("Los números de todos los ganchos, del que más te detiene al que menos, sin repetir."),
});
export type HookCriticOutput = z.infer<typeof hookCriticSchema>;

export function hookCriticSystem(market: Market): string {
  return [
    "Eres una persona del cliente ideal que se describe abajo. Estás recorriendo Reels en el teléfono, con el sonido apagado al principio, y pasas cada video en menos de un segundo si no te dice nada. No eres redactora ni publicista: no corriges, no sugieres, solo reaccionas como reaccionarías.",
    "",
    marketBlock(market),
    "",
    "CÓMO MIRAS CADA GANCHO",
    "- Primero sin sonido: solo el texto en pantalla y la primera imagen. ¿Sabes de qué se trata? ¿Te importa?",
    "- Después con sonido: la primera frase hablada. ¿Te deja con una pregunta o con algo en juego?",
    "- Te detienes cuando: hay algo raro o que salió mal, un secreto, algo en juego para alguien que quieres, una frase que dirías tú, una pregunta que necesitas responder, algo que te pasa y nadie dice.",
    "- Sigues de largo cuando: describe una escena tranquila sin pregunta; habla de una característica del producto (una perilla, un material, cuántas piezas trae); el texto en pantalla es una etiqueta y no sabes de qué trata; suena a anuncio; la primera frase es de relleno antes de lo importante.",
    "- No juzgas las políticas de Meta ni si es verdad: eso ya se revisó. Solo si te detienes.",
    "",
    "QUÉ ENTREGAS",
    "- reviews: uno por gancho, con lo que entendiste sin sonido, si te detienes y por qué.",
    "- order: todos los ganchos del que más te detiene al que menos. Compáralos entre sí.",
  ].join("\n");
}

export interface HookCriticContext {
  avatar: CustomerAvatar;
  /** A quién le habla el ángulo («quien compra (puede no ser quien lo usa)»). */
  speaksTo?: string;
  hooks: HookOut[];
}

/** El cliente ideal en corto y los ganchos como se ven: sin mecanismo, puntajes ni orden del autor. */
export function hookCriticUser(c: HookCriticContext): string {
  const a = c.avatar;
  return [
    "QUIÉN ERES",
    `- ${a.summary}`,
    ...(a.why_buy ? [`- Por qué lo comprarías: ${a.why_buy}`] : []),
    ...(a.doubts.length ? [`- Lo que te frena: ${a.doubts.join("; ")}`] : []),
    ...(c.speaksTo ? [`- Este anuncio le habla a: ${c.speaksTo}.`] : []),
    "",
    "LOS GANCHOS (los primeros 3 s de cada video)",
    ...c.hooks.map((h, i) =>
      [
        `${i}.`,
        `En pantalla: «${h.on_screen}»`,
        `Primera imagen: ${h.opening_shot === "real_footage" ? "" : `${OPENING_SHOT_DEFS[h.opening_shot].name}. `}${h.visual_first_3s}`,
        `Se dice: «${[h.text, h.follow_up].filter((t) => t?.trim()).join(" ")}»`,
      ].join(" · "),
    ),
    "",
    "Mira cada uno como lo verías en Reels.",
  ].join("\n");
}

/** Qué está mal en la respuesta del crítico (un review y un lugar por gancho). Vacío si sirve. */
export function hookCriticProblems(out: HookCriticOutput, count: number): string[] {
  const problems: string[] = [];
  const all = Array.from({ length: count }, (_, i) => i);
  const reviewed = out.reviews.map((r) => r.hook).sort((a, b) => a - b);
  if (reviewed.length !== count || reviewed.some((h, i) => h !== i)) problems.push(`reviews tiene que traer un review por gancho, del 0 al ${count - 1}, sin repetir.`);
  const ordered = [...out.order].sort((a, b) => a - b);
  if (ordered.length !== count || ordered.some((h, i) => h !== all[i])) problems.push(`order tiene que traer todos los ganchos del 0 al ${count - 1}, una vez cada uno.`);
  return problems;
}

/** La respuesta del crítico como la guarda el desarrollo (hooksToPayload). */
export function toHooksReview(out: HookCriticOutput): HooksReview {
  return { order: out.order, reviews: out.reviews.map((r) => ({ hook: r.hook, stops: r.stops, understood_muted: r.understood_muted.trim(), why: r.why.trim() })) };
}

/** Cuántos ganchos detienen al crítico. */
export const stopsCount = (r: HooksReview) => r.reviews.filter((x) => x.stops).length;

/** Lo que vuelve al agente de ganchos para reescribir: los que no detienen y los que se conservan. */
export function critiqueFor(hooks: HookOut[], r: HooksReview): HooksCritique {
  const weak: string[] = [];
  const keep: string[] = [];
  for (const x of [...r.reviews].sort((a, b) => a.hook - b.hook)) {
    const h = hooks[x.hook];
    if (!h) continue;
    if (x.stops) keep.push(h.text);
    else weak.push(`«${h.text}» / «${h.on_screen}»: sin sonido se entiende «${x.understood_muted}». ${x.why}`);
  }
  return { weak, keep };
}
