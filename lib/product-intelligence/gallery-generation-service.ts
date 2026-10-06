import "server-only";
import { z } from "zod";
import { pageRenderRequest } from "@/lib/page-images/render";
import type { StoredShot } from "@/lib/page-images/schemas";
import { languageName } from "@/lib/creatives/render";
import { IMAGE_COST_BY_PROVIDER } from "@/lib/image-provider";
import { GEMINI_IMAGE_MODEL } from "@/lib/integrations/gemini/client";
import { requireProvider } from "@/lib/pipeline/creatives";
import { requireAiKey } from "@/lib/pipeline/errors";
import { imageQaEnabled } from "@/lib/products/store";
import { commandHash } from "./concurrency";
import { parseToolInput, parseToolOutput } from "./validation";
import { contextAccess, type GalleryGenerationRepository, type ContentRepository, type KnowledgeRepository } from "./repository";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { checkArtifact, checkRevision, requireScopes, toolScopes } from "./policy";
import { parseKnowledgeRead, strategyResponse } from "./knowledge";

export function createGalleryGenerationExecutor(repository: GalleryGenerationRepository & ContentRepository & KnowledgeRepository, identity?: DelegatedIdentity, wake?: (id: string) => void): DomainExecutor {
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    const access = contextAccess(principal, identity);
    if (command.tool === "get_gallery_generation_status") {
      const input = parseToolInput(command.tool, command.input);
      return parseToolOutput(command.tool, await repository.loadGalleryGeneration({ p_access: access, p_product_id: input.product_id, p_operation_id: input.operation_id }, signal));
    }
    if (command.tool !== "generate_gallery_images") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de imágenes de galería.");
    const input = parseToolInput(command.tool, command.input), hash = commandHash(command.tool, input);
    const raw = await repository.loadGalleryGeneration({ p_access: access, p_product_id: input.product_id, p_key: input.idempotency_key, p_hash: hash, p_dry_run: input.dry_run }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(command.tool, raw.replay);
    const read = z.object({ revision: z.number(), content_etag: z.string(), current: z.array(z.object({ id: z.string(), payload: z.unknown(), slot: z.string() })), stamp: z.string() }).parse(raw);
    checkRevision(input.expected_revision, read.revision); checkArtifact(input.expected_content_etag, read.content_etag);
    const knowledge = parseKnowledgeRead(await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id }, signal), principal, input.product_id);
    if (!knowledge.strategy || !strategyResponse(knowledge.strategy, knowledge, input.product_id, "execution").readiness.ready_for_execution) throw new ProductIntelligenceError("VALIDATION_ERROR", "Revisa la estrategia y el plan de galería antes de generar.");
    const shots = input.shot_ids.map(id => read.current.find(s => s.id === id));
    if (shots.some(s => !s || (s.payload as { source?: string }).source !== "mcp_chat")) throw new ProductIntelligenceError("INVALID_REFERENCE", "Usa tomas vigentes guardadas desde el chat.");
    // Reserva conservadora de 2× el precio nominal por variación de proveedor/modelo; no habilita reintentos de QA.
    const estimated = Math.ceil(input.shot_ids.length * IMAGE_COST_BY_PROVIDER[input.provider] * 2 * 10000) / 10000;
    if (estimated > input.max_estimated_usd) throw new ProductIntelligenceError("VALIDATION_ERROR", "La estimación supera el límite autorizado. Reduce las tomas o revisa el límite.");
    const qa = await imageQaEnabled(principal.userId, input.product_id);
    if (!input.dry_run) {
      await requireProvider(principal.userId, "page_images", "imágenes", input.provider);
      if (qa) await requireAiKey(principal.userId);
    }
    const jobs = shots.map(s => {
      const shot = s!, request = pageRenderRequest(shot.slot, shot.payload as StoredShot, languageName(String(knowledge.currentSnapshot.settings?.language ?? "es")));
      return { shot_id: shot.id, slot: shot.slot, endpoint: input.provider === "gemini" ? GEMINI_IMAGE_MODEL : request.endpoint, input: request.input, baked_texts: (shot.payload as StoredShot).texts };
    });
    const result = parseToolOutput(command.tool, await repository.enqueueGalleryGeneration({ p_access: access, p_product_id: input.product_id,
      p_expected_revision: input.expected_revision, p_etag: input.expected_content_etag, p_stamp: read.stamp, p_key: input.idempotency_key, p_hash: hash,
      p_provider: input.provider, p_jobs: jobs, p_estimated: estimated, p_qa: qa, p_dry_run: input.dry_run }, signal));
    if (result.ok && result.data.operation_id) wake?.(result.data.operation_id);
    return result;
  };
}
