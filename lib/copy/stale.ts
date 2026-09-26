import { stampChanged, type BriefStampEntry } from "@/lib/angles/approved";
import type { Differentiator } from "@/lib/ai/schemas";

// Qué cambió del contexto del producto después de escribir la página. Cada escritura guarda en
// `input.context` la huella de lo que usó (cliente ideal, ficha, diferenciador, versión del prompt);
// los desarrollos de ángulo ya iban en `input.briefs`. Puro.

export type CopyStaleReason = "angles" | "avatar" | "brief" | "differentiator" | "prompt";

export interface CopyContextStamp {
  /** El cliente ideal aprobado: id y última edición. */
  avatar: string;
  /** La ficha vigente (product_briefs.id). */
  brief: string | null;
  /** El diferenciador que se usó (confirmado o propuesto), como texto. */
  differentiator: string | null;
  prompt_version: number;
}

/** Lo que una escritura guardó en `input`. Las de antes de la huella solo traen avatar_id y briefs. */
export interface CopyRunContext {
  avatar_id?: string;
  briefs?: unknown;
  context?: CopyContextStamp;
}

export const avatarStamp = (a: { id: string; edited_at?: string | null }) => `${a.id}:${a.edited_at ?? ""}`;

export const differentiatorStamp = (d: Differentiator | null | undefined) => (d ? `${d.versus.trim()} | ${d.claim.trim()}` : null);

/** Lo que diría la pantalla, en el orden en que se muestra. */
export const STALE_REASON_LABEL: Record<CopyStaleReason, string> = {
  angles: "tus ángulos",
  avatar: "tu cliente ideal",
  brief: "la ficha del producto",
  differentiator: "tu diferenciador",
  prompt: "la forma en que la IA escribe la página",
};

const ORDER: CopyStaleReason[] = ["angles", "avatar", "brief", "differentiator", "prompt"];

/**
 * Qué cambió desde las escrituras que dejaron la página actual (una por cada run_id de sus
 * componentes: «Volver a escribir con IA» un componente no pone al día el resto).
 * `avatar` es null si hoy no hay un cliente ideal aprobado (entonces no se compara).
 */
export function staleReasons(runs: CopyRunContext[], current: { briefs: BriefStampEntry[]; avatar: string | null; context: Omit<CopyContextStamp, "avatar"> }): CopyStaleReason[] {
  const found = new Set<CopyStaleReason>();
  for (const run of runs) {
    if (stampChanged(run.briefs, current.briefs)) found.add("angles");
    const c = run.context;
    if (c) {
      if (current.avatar && c.avatar !== current.avatar) found.add("avatar");
      if (c.brief !== current.context.brief) found.add("brief");
      if (c.differentiator !== current.context.differentiator) found.add("differentiator");
      if (c.prompt_version < current.context.prompt_version) found.add("prompt");
    } else {
      // Escrita antes de guardar la huella: solo se sabe el cliente ideal (sin su edición).
      if (current.avatar && run.avatar_id && !current.avatar.startsWith(`${run.avatar_id}:`)) found.add("avatar");
      if (current.context.differentiator) found.add("differentiator");
      found.add("prompt");
    }
  }
  return ORDER.filter((r) => found.has(r));
}
