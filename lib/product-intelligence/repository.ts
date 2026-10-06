import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/integrations/admin";
import { ProductIntelligenceError } from "./errors";
import type { Principal } from "./policy";
import type { DelegatedIdentity } from "./oauth";
import type { DomainError } from "./schemas";

export interface GalleryGenerationRepository {
  loadGalleryGeneration(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  enqueueGalleryGeneration(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface LearningRepository {
  loadPerformance(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  loadLearning(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitLearning(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface ContentRepository {
  loadContent(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitContent(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  reviewTip?(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  loadTipReview?(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface ContextRepository {
  load(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commit(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface KnowledgeRepository extends ContextRepository {
  loadKnowledge(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitKnowledge(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface PackLabelsRepository {
  loadPackLabels(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitPackLabels(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface UgcRepository {
  loadUgc(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitUgc(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface LandingRepository {
  loadLanding(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  commitLanding(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
const messages: Partial<Record<DomainError["code"], string>> = {
  FORBIDDEN: "La autorización no permite esta operación o fue revocada.", NOT_FOUND: "No encontramos ese producto o revisión.",
  INVALID_REFERENCE: "Una referencia no pertenece a este producto o no está disponible.",
  REVISION_CONFLICT: "El producto cambió desde tu lectura. Recupera el contexto y concilia el cambio.",
  IDEMPOTENCY_KEY_REUSED: "Esta clave ya se usó con otro contenido. Envía una clave nueva.",
  VALIDATION_ERROR: "Revisa el contexto y los números antes de guardar.",
  DEPENDENCY_IN_USE: "Esta entidad pertenece a la estrategia seleccionada. Sustituye o archiva la selección primero.",
  ARTIFACT_CONFLICT: "La propuesta cambió desde tu lectura. Recupera su contenido y concilia los cambios.",
  GENERATION_IN_PROGRESS: "Hay una generación en curso. Espera a que termine antes de cambiar el contenido.",
  RESPONSE_TOO_LARGE: "La respuesta supera el límite. Consulta un periodo más corto.",
  RATE_LIMITED: "Llegaste al límite de generación. Espera antes de solicitar otra operación.",
};
export function contextDatabaseError(error: { code?: string; message?: string }): ProductIntelligenceError {
  const code = error.message?.match(/^PI_([A-Z_]+)$/)?.[1] as DomainError["code"] | undefined;
  if (code && messages[code]) return new ProductIntelligenceError(code, messages[code]!);
  if (["40001", "40P01", "57014"].includes(error.code ?? "")) return new ProductIntelligenceError("INTERNAL_ERROR", "La transacción se interrumpió. Reintenta con la misma clave.", {}, true);
  if (["23503", "23505"].includes(error.code ?? "")) return new ProductIntelligenceError("INVALID_REFERENCE", "Una referencia no pertenece a este producto o está repetida.");
  if (["23514", "22003", "22001", "22P02", "23502"].includes(error.code ?? "")) return new ProductIntelligenceError("VALIDATION_ERROR", "Revisa los campos y los números antes de guardar.");
  return new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos completar la transacción. Reintenta con la misma clave.", {}, true);
}
export function createContextRepository(db: SupabaseClient = adminClient()): KnowledgeRepository & LandingRepository & PackLabelsRepository & UgcRepository & ContentRepository & LearningRepository & GalleryGenerationRepository {
  async function rpc(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (error) throw contextDatabaseError(error);
    return data as unknown;
  }
  return { loadGalleryGeneration: (args, signal) => rpc("pi_load_gallery_generation", args, signal), enqueueGalleryGeneration: (args, signal) => rpc("pi_enqueue_gallery_generation", args, signal), reviewTip: (args, signal) => rpc("pi_review_tip", args, signal), loadTipReview: (args, signal) => rpc("pi_load_tip_review", args, signal), loadPerformance: (args, signal) => rpc("pi_load_performance", args, signal), loadLearning: (args, signal) => rpc("pi_load_learning", args, signal), commitLearning: (args, signal) => rpc("pi_commit_learning", args, signal), loadContent: (args, signal) => rpc("pi_load_content", args, signal), commitContent: (args, signal) => rpc("pi_commit_content", args, signal), loadUgc: (args, signal) => rpc("pi_load_ugc", args, signal), commitUgc: (args, signal) => rpc("pi_commit_ugc", args, signal), load: (args, signal) => rpc("pi_load_context", args, signal), commit: (args, signal) => rpc("pi_commit_context", args, signal),
    loadKnowledge: (args, signal) => rpc("pi_load_knowledge", args, signal), commitKnowledge: (args, signal) => rpc("pi_commit_knowledge", args, signal),
    loadPackLabels: (args, signal) => rpc("pi_load_pack_labels", args, signal), commitPackLabels: (args, signal) => rpc("pi_commit_pack_labels", args, signal),
    loadLanding: (args, signal) => rpc("pi_load_landing", args, signal), commitLanding: (args, signal) => rpc("pi_commit_landing", args, signal) };
}

/** Identidad firmada separada de argumentos de tool; fail closed para un principal delegado incompleto. */
export function contextAccess(principal: Principal, identity?: DelegatedIdentity) {
  if (principal.actorKind === "delegated" && (!identity || identity.userId !== principal.userId || identity.clientId !== principal.clientId || principal.actorId !== identity.clientId)) {
    throw new ProductIntelligenceError("FORBIDDEN", "Falta la identidad delegada verificada.");
  }
  return { user_id: principal.userId, actor_id: principal.actorId, actor_kind: principal.actorKind, scopes: [...principal.scopes],
    ...(principal.actorKind === "delegated" && identity ? { client_id: identity.clientId, session_id: identity.sessionId,
      token_session_id: identity.tokenSessionId, grant_version: identity.grantVersion, resource_url: identity.resourceUrl,
      token_expires_at: identity.tokenExpiresAt ?? null } : {}) };
}
