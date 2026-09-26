import "server-only";
import { generateStructured, type AiUsage } from "@/lib/ai/claude";
import type { Market } from "@/lib/market";
import { LISTING } from "./listing";
import { failingParts, mergeOutput, pageProblems, pageSchema, partialOutput, type PageFacts, type PageOutput } from "./page-schema";
import { copySystem, copyUser, type CopyContext, type CopyRetry } from "./prompts";

/** Llamadas por escritura: la página entera y hasta 2 correcciones. */
const MAX_CALLS = 3;

export interface PageAttempt {
  usage: AiUsage;
  problems: string[];
  /** Las partes que se pidieron en esta llamada (todas, o solo las que fallaron). */
  parts: string[];
  partial: boolean;
}

/**
 * Escribe la página y corrige lo que no pasa las reglas (pageProblems). Si los problemas son de
 * algunas partes (un largo, un monto), se reescriben solo esas y lo demás va como contexto: cuesta
 * una fracción de la página. Si no se pueden atribuir, se corrige la página entera, una sola vez.
 * Nunca lanza por reglas: devuelve los problemas que queden. Cada llamada pasa por `onAttempt`
 * (para registrarla en ai_generations).
 */
export async function writePage({
  ctx,
  market,
  facts,
  model,
  onAttempt,
}: {
  ctx: CopyContext;
  market: Market;
  facts: PageFacts;
  model?: string;
  onAttempt: (a: PageAttempt) => Promise<void> | void;
}): Promise<{ data: PageOutput | null; usage: AiUsage | null; problems: string[] }> {
  const write = ctx.write;
  const call = (parts: string[], retry?: CopyRetry, kept?: CopyContext["kept"]) =>
    generateStructured({
      system: copySystem(market),
      content: [{ type: "text", text: copyUser({ ...ctx, write: parts, kept }, retry) }],
      schema: pageSchema(parts),
      effort: "medium",
      maxTokens: 16000,
      model,
      // La corrección por partes cambia el esquema de salida: no lee la caché del system (ai_generations,
      // 2026-09-25: 0 leídos y 26.568 escritos) y escribirla cuesta 1,25×.
      cacheSystem: !retry || parts.length === write.length,
    });

  let data: PageOutput | null = null;
  let usage: AiUsage | null = null;
  let problems: string[] = [];
  let wholeRetried = false;
  for (let i = 0; i < MAX_CALLS; i++) {
    const failing: string[] | null = data ? failingParts(problems, write) : write;
    const partial: boolean = Boolean(data && failing && failing.length < write.length);
    if (data && !partial && wholeRetried) break;
    if (data && !partial) wholeRetried = true;
    const parts: string[] = partial ? failing! : write;
    const kept = partial ? write.filter((id) => !parts.includes(id)).map((id) => ({ component: id, content: id === LISTING ? data!.listing : data!.components[id] })) : undefined;
    const result = await call(parts, data ? { previous: partial ? partialOutput(data, parts) : data, problems } : undefined, kept);
    data = partial ? mergeOutput(data!, result.data as PageOutput, parts) : (result.data as PageOutput);
    usage = result.usage;
    problems = pageProblems(data, write, facts);
    await onAttempt({ usage, problems, parts, partial });
    if (!problems.length) break;
  }
  return { data, usage, problems };
}
