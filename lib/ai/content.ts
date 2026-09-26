import type Anthropic from "@anthropic-ai/sdk";

type Block = Anthropic.Beta.BetaContentBlockParam;

/**
 * El mensaje de un paso que reintenta con el mismo esquema (el ranking, la propuesta de conceptos, el
 * guion): primero lo fijo (imágenes y contexto), con punto de caché, y después lo que cambia en cada
 * intento (los problemas del anterior). El primer intento escribe la caché (1,25× sobre lo fijo) y
 * cada reintento completo la lee a 0,1× (ai_generations, 2026-09-25: tres propuestas seguidas pagaron
 * ~20.000 tokens de fotos y contexto sin caché). Sale a cuenta si al menos ~1 de cada 5 llamadas
 * reintenta. Las correcciones por partes usan otro esquema: no leen esta caché.
 */
export function retryableContent(fixed: Block[], context: string, tail: string): Block[] {
  return [...fixed, { type: "text", text: context, cache_control: { type: "ephemeral" } }, { type: "text", text: tail }];
}
