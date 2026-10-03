// Qué ganchos de un desarrollo se pueden usar y cómo llegan a los pasos siguientes (video, estáticos,
// chat y el texto del anuncio). Puro, con tests.

import { HOOK_DELIVERY_DEFS, PATTERN_NAMES, type AiOpeningShot } from "./catalog";
import type { AngleHook, HooksMeta } from "./schemas";

/** Lo de un desarrollo que leen los ganchos (los de antes no traen el meta). */
export type HookSource = { hooks: AngleHook[]; recommended_hook: number } & HooksMeta;

/**
 * ¿Se puede usar sin inventar nada ni arriesgar la cuenta? Fuera: los que rozan la política, los de
 * riesgo alto y los que piden material real que no hay (un testimonio, la bodega, un experto). Los
 * pasos con IA no tienen ese material: lo grabaría el comerciante.
 */
export function isUsable(h: AngleHook): boolean {
  return h.policy_ok !== false && h.risk !== "high" && !h.needs_real_material?.trim() && Boolean(h.text.trim());
}

/**
 * Para qué se usa: `any` (estáticos, chat, texto del anuncio), `ai_video` (el video con una persona de
 * IA: sin los que piden grabación real) o `mascot` (solo los que tienen versión de mascota).
 */
export type HookUse = "any" | "ai_video" | "mascot";

/** La primera toma de un gancho para el video con IA (los de antes de la versión 2 abren con la persona). */
export const openingShotOf = (h: AngleHook): AiOpeningShot | null => {
  const shot = h.opening_shot ?? "selfie_talk";
  return shot === "real_footage" ? null : shot;
};

function fits(h: AngleHook, use: HookUse): boolean {
  if (!isUsable(h)) return false;
  if (use === "ai_video") return openingShotOf(h) !== null;
  if (use === "mascot") return Boolean(h.mascot);
  return true;
}

const total = (h: AngleHook) => Object.values(h.scores ?? {}).reduce<number>((n, v) => n + (v ?? 0), 0);

/**
 * Los ganchos que se pueden usar, del mejor al peor: el recomendado (lo elige el comerciante), después
 * el top de los de antes (versión ≤ 3), después por su lugar (`rank`, desde la versión 4: el del
 * crítico) y al final por puntaje. `index` es su posición en el desarrollo.
 */
export function usableHooks(src: HookSource, use: HookUse = "any"): { index: number; hook: AngleHook }[] {
  const order = [src.recommended_hook, ...(src.hook_top ?? []).map((t) => t.hook)];
  const first = (i: number) => {
    const k = order.indexOf(i);
    return k < 0 ? order.length : k;
  };
  const place = (h: AngleHook) => h.rank ?? Number.MAX_SAFE_INTEGER;
  return src.hooks
    .map((hook, index) => ({ index, hook }))
    .filter(({ hook }) => fits(hook, use))
    .sort((a, b) => first(a.index) - first(b.index) || place(a.hook) - place(b.hook) || total(b.hook) - total(a.hook) || a.index - b.index);
}

/** El gancho que abre el anuncio cuando nadie elige (el texto principal del anuncio). */
export function bestHook(src: HookSource): AngleHook | null {
  return usableHooks(src)[0]?.hook ?? null;
}

/** El texto principal del anuncio: el hablado del mejor gancho y su segunda frase. Vacío si no hay. */
export function adHookText(src: HookSource | null | undefined): string {
  const h = src ? bestHook(src) : null;
  return h ? [h.text, h.follow_up].filter((t) => t?.trim()).join(" ") : "";
}

/** Cómo se dice el gancho (versión 4), para la voz de A1: «Confidencia (low and close…)». */
function deliveryOf(h: AngleHook): { delivery?: string } {
  const d = h.delivery ? HOOK_DELIVERY_DEFS[h.delivery] : undefined;
  return d ? { delivery: `${d.name} (${d.voice})` } : {};
}

/**
 * Un gancho como lo lee un prompt: la tríada, su patrón y si lo escribió el comerciante. Para el video,
 * también su primera toma; para la mascota, su versión (lo que dice el personaje y su escena).
 */
export function hookForPrompt(index: number, h: AngleHook, use: HookUse = "any") {
  if (use === "mascot" && h.mascot) {
    return {
      index,
      ...(h.pattern ? { pattern: `${PATTERN_NAMES[h.pattern]} (${h.pattern})` } : {}),
      ...(h.mechanism ? { mechanism: h.mechanism } : {}),
      spoken: h.mascot.text,
      on_screen: h.mascot.on_screen,
      ...deliveryOf(h),
      scene: h.mascot.scene,
      first_motion: h.mascot.first_motion,
    };
  }
  const video =
    use === "ai_video"
      ? { opening_shot: openingShotOf(h), ...(h.first_motion ? { first_motion: h.first_motion } : {}), ...(h.edited ? {} : deliveryOf(h)) }
      : {};
  return {
    index,
    ...(h.pattern ? { pattern: `${PATTERN_NAMES[h.pattern]} (${h.pattern})` } : {}),
    ...(h.mechanism ? { mechanism: h.mechanism } : {}),
    spoken: h.text,
    ...(h.follow_up ? { follow_up: h.follow_up } : {}),
    ...(h.on_screen ? { on_screen: h.on_screen } : {}),
    ...(h.visual_first_3s ? { visual_first_3s: h.visual_first_3s } : {}),
    ...video,
    ...(h.edited ? { edited_by_merchant: true } : {}),
  };
}

/** Los ganchos usables listos para un prompt, el recomendado primero. */
export function hooksForPrompt(src: HookSource, use: HookUse = "any") {
  return usableHooks(src, use).map(({ index, hook }) => hookForPrompt(index, hook, use));
}
