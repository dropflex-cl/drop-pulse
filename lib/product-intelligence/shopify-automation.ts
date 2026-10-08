import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fingerprint } from "@/lib/shopify/publish/mapping";
import { connectionProblem, getPublications, preparePublish, runPublish } from "@/lib/pipeline/publish";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { adminClient } from "@/lib/integrations/admin";
import { commandHash } from "./concurrency";
import { shopifyStrategyRead } from "./automation-active";
import { parseKnowledgeRead, strategyResponse } from "./knowledge";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { checkRevision, requireScopes, toolScopes } from "./policy";
import { contextAccess, contextDatabaseError, type ShopifyAutomationRepository, type KnowledgeRepository } from "./repository";
import { automationStateSchema } from "./shopify-automation-schemas";
import { parseToolInput, parseToolOutput } from "./validation";

export function createShopifyAutomationExecutor(repository: ShopifyAutomationRepository & Partial<KnowledgeRepository>, identity?: DelegatedIdentity,
  wake?: (id: string) => void): DomainExecutor {
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    const tool = command.tool;
    if (tool !== "get_shopify_automation" && tool !== "authorize_shopify_automation" && tool !== "disable_shopify_automation" && tool !== "publish_product")
      throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de publicación automática.");
    const input = parseToolInput(tool, command.input), access = contextAccess(principal, identity);
    const base = { ok: true as const, product_id: input.product_id, request_id: randomUUID() };
    if (tool === "publish_product") {
      const q = parseToolInput(tool, command.input);
      const replay = !q.dry_run && await repository.shopifyAutomation({ p_access: access, p_product_id: q.product_id,
        p_action: "publish_replay", p_key: q.idempotency_key, p_hash: commandHash(tool, q) }, signal);
      if (replay) {
        const data = parseToolOutput(tool, { ...base, revision: q.expected_revision, data: replay });
        if (data.ok && data.data.operation_id && ["queued", "running"].includes(data.data.status)) wake?.(data.data.operation_id);
        return data;
      }
      const state = automationStateSchema.parse(await repository.shopifyAutomation({ p_access: access, p_product_id: q.product_id, p_action: "read" }, signal));
      if (!state.active) throw new ProductIntelligenceError("FORBIDDEN", "Confirma los hooks y autoriza la publicación automática en este chat.");
      const conn = await getShopifyConnection(principal.userId), problem = connectionProblem(conn);
      if (problem || !conn) throw new ProductIntelligenceError("VALIDATION_ERROR", problem ?? "Conecta tu tienda Shopify.");
      const prepared = await preparePublish(principal.userId, q.product_id);
      if (prepared.missing.length) throw new ProductIntelligenceError("VALIDATION_ERROR", prepared.missing[0]);
      if (fingerprint(prepared.input) !== q.expected_fingerprint) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La página cambió. Recupera su estado antes de publicar.");
      const data = z.object({ applied: z.boolean(), dry_run: z.boolean(), operation_id: z.string().uuid().nullable(), status: z.string() }).parse(
        await repository.shopifyAutomation({ p_access: access, p_product_id: q.product_id, p_action: "publish", p_expected_revision: q.expected_revision,
          p_key: q.idempotency_key, p_hash: commandHash(tool, q), p_dry_run: q.dry_run,
          p_payload: { fingerprint: q.expected_fingerprint, shop_domain: conn.shop_domain, authorization_id: state.authorization_id } }, signal));
      if (data.operation_id && !q.dry_run && data.status === "queued") wake?.(data.operation_id);
      return parseToolOutput(tool, { ...base, revision: state.revision, data });
    }
    const q = tool === "authorize_shopify_automation" ? parseToolInput(tool, command.input) : tool === "disable_shopify_automation" ? parseToolInput(tool, command.input) : null;
    if (tool === "authorize_shopify_automation") {
      const request = parseToolInput(tool, command.input);
      const replay = !request.dry_run && await repository.shopifyAutomation({ p_access: access, p_product_id: input.product_id,
        p_action: "authorize_replay", p_key: request.idempotency_key, p_hash: commandHash(tool, request) }, signal);
      if (replay) {
        const data = automationStateSchema.parse(replay);
        return parseToolOutput(tool, { ...base, revision: data.revision, data });
      }
      if (!repository.loadKnowledge) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Falta el contexto de la estrategia.");
      const read = await shopifyStrategyRead(repository, parseKnowledgeRead(await repository.loadKnowledge({ p_access: access,
        p_product_id: input.product_id }, signal), principal, input.product_id), principal, input.product_id, identity, signal);
      checkRevision(request.expected_revision, read.current_revision);
      if (!read.strategy || read.strategy.id !== request.strategy_id || !strategyResponse(read.strategy, read, input.product_id).readiness.ready_for_execution)
        throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Revisa la estrategia y sus datos antes de autorizar la publicación automática.");
    }
    const state = automationStateSchema.parse(await repository.shopifyAutomation({ p_access: access, p_product_id: input.product_id,
      p_action: tool === "get_shopify_automation" ? "read" : tool === "disable_shopify_automation" ? "disable" : "authorize",
      ...(q ? { p_expected_revision: q.expected_revision, p_key: q.idempotency_key, p_hash: commandHash(tool, q), p_dry_run: q.dry_run } : {}),
      ...(tool === "authorize_shopify_automation" ? { p_payload: parseToolInput("authorize_shopify_automation", command.input) } : {}),
    }, signal));
    if (tool !== "get_shopify_automation") return parseToolOutput(tool, { ...base, revision: state.revision, data: state });
    const [prepared, publications, conn] = await Promise.all([preparePublish(principal.userId, input.product_id),
      getPublications(principal.userId, [input.product_id]), getShopifyConnection(principal.userId)]);
    const publication = publications.get(input.product_id), problem = connectionProblem(conn), missing = [...prepared.missing, ...(problem ? [problem] : [])];
    return parseToolOutput(tool, { ...base, revision: state.revision, data: { ...state,
      publication: publication ? { status: publication.status, product_url: publication.product_url, error_message: publication.error_message } : null,
      publish_ready: state.active && missing.length === 0, missing, fingerprint: fingerprint(prepared.input) } });
  };
}

/** Cola durable: un replay despierta el mismo trabajo; el lease evita dos escrituras simultáneas. */
export async function runAutomaticShopifyPublication(id: string): Promise<void> {
  const db = adminClient(), token = randomUUID();
  const claimed = await db.rpc("pi_claim_shopify_publication", { p_id: id, p_token: token });
  if (claimed.error) throw contextDatabaseError(claimed.error);
  if (!claimed.data) return;
  const job = z.object({ product_id: z.string().uuid(), user_id: z.string().uuid(), fingerprint: z.string(), shop_domain: z.string() }).parse(claimed.data);
  const guard = async () => {
    const checked = await db.rpc("pi_guard_shopify_publication", { p_id: id, p_token: token });
    if (checked.error) throw contextDatabaseError(checked.error);
    if (checked.data !== true) throw new ProductIntelligenceError("FORBIDDEN", "La autorización automática cambió o venció.");
    const conn = await getShopifyConnection(job.user_id);
    if (!conn || connectionProblem(conn) || conn.shop_domain !== job.shop_domain)
      throw new ProductIntelligenceError("FORBIDDEN", "La conexión de Shopify cambió. Recupera el estado antes de publicar.");
    const prepared = await preparePublish(job.user_id, job.product_id);
    if (prepared.missing.length || fingerprint(prepared.input) !== job.fingerprint)
      throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La página cambió. Recupera el estado antes de volver a publicar.");
  };
  try {
    await guard();
    await runPublish(job.user_id, job.product_id, { expectedFingerprint: job.fingerprint, beforeWrite: guard });
    const row = (await getPublications(job.user_id, [job.product_id])).get(job.product_id);
    const finished = await db.rpc("pi_finish_shopify_publication", { p_id: id, p_token: token,
      p_error: row?.status === "published" ? null : row?.error_message ?? "No pudimos completar la publicación." });
    if (finished.error) throw contextDatabaseError(finished.error);
  } catch (error) {
    const finished = await db.rpc("pi_finish_shopify_publication", { p_id: id, p_token: token,
      p_error: error instanceof ProductIntelligenceError ? error.message : "La publicación se interrumpió. Recupera el estado antes de reintentar." });
    if (finished.error) console.error("[automatic-publish]", finished.error.code);
  }
}
