import "server-only";
import { randomUUID } from "node:crypto";
import { commandHash } from "./concurrency";
import { cursorBinding, verifyContextCursor } from "./context-cursor";
import { ProductIntelligenceError } from "./errors";
import { boundedResult, graphMutationResult, graphRecords, mutationContext, parseKnowledgeRead, prepareStrategy, strategyResponse } from "./knowledge";
import { knowledgeContextResponse } from "./knowledge-context";
import type { DomainExecutor } from "./mcp";
import { prepareAnalysisMutation, preparePatchMutation, prepareResearchMutation } from "./mutations";
import type { DelegatedIdentity } from "./oauth";
import { requireScopes, toolScopes } from "./policy";
import { contextAccess, type KnowledgeRepository } from "./repository";
import { createContextExecutor } from "./service";
import { parseToolInput, parseToolOutput } from "./validation";
import { createLandingExecutor } from "./landing-service";
import { createPackLabelsExecutor } from "./pack-labels-service";
import type { PackLabelsRepository } from "./repository";
import type { LandingRepository } from "./repository";

export const PERSISTED_INTELLIGENCE_TOOLS = ["get_product_context", "save_product_context", "save_product_analysis", "patch_product_analysis", "save_research", "set_product_strategy", "get_product_strategy", "get_landing_content", "save_landing_content", "get_pack_labels", "save_pack_labels"] as const;
/** Adaptador común para UI/MCP. Ningún comando llama proveedores o publica. */
export function createProductIntelligenceExecutor(repository: KnowledgeRepository & Partial<LandingRepository & PackLabelsRepository>, identity?: DelegatedIdentity, cursorSecret = process.env.OAUTH_STATE_SECRET ?? ""): DomainExecutor {
  const context = createContextExecutor(repository, identity);
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    if (command.tool === "get_pack_labels" || command.tool === "save_pack_labels") {
      if (!repository.loadPackLabels || !repository.commitPackLabels) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Falta el repositorio de etiquetas de packs.");
      return createPackLabelsExecutor(repository as PackLabelsRepository, identity)(principal, command, signal);
    }
    if (command.tool === "get_landing_content" || command.tool === "save_landing_content") {
      if (!repository.loadLanding || !repository.commitLanding) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Falta el repositorio de contenido de página.");
      return createLandingExecutor(repository as KnowledgeRepository & LandingRepository, identity)(principal, command, signal);
    }
    if (command.tool === "save_product_context") return context(principal, command, signal);
    const access = contextAccess(principal, identity);
    if (command.tool === "get_product_context") {
      const input = parseToolInput(command.tool, command.input);
      if (input.include?.includes("performance")) requireScopes(principal, ["performance:read"]);
      const cursor = input.cursor ? verifyContextCursor(input.cursor, cursorBinding(principal, input), cursorSecret) : undefined;
      const raw = await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id, p_revision: cursor?.revision ?? input.at_revision ?? null,
        p_performance: input.include?.includes("performance") ?? false }, signal);
      return parseToolOutput(command.tool, knowledgeContextResponse(parseKnowledgeRead(raw, principal, input.product_id), input, principal, randomUUID(), cursorSecret, cursor));
    }
    if (command.tool === "get_product_strategy") {
      const input = parseToolInput(command.tool, command.input);
      const read = parseKnowledgeRead(await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id, p_strategy_id: input.strategy_id ?? null }, signal), principal, input.product_id);
      const version = input.strategy_id ? read.requestedStrategy : read.strategy;
      return parseToolOutput(command.tool, boundedResult({ ok: true, product_id: input.product_id, revision: read.current_revision, request_id: randomUUID(),
        data: version ? strategyResponse(version, read, input.product_id, input.include) : null,
        warnings: version ? [] : [{ code: "NO_SELECTED_STRATEGY", message: "Elige una estrategia antes de iniciar la generación.", field: "strategy" }] }));
    }
    if (command.tool !== "save_product_analysis" && command.tool !== "patch_product_analysis" && command.tool !== "save_research" && command.tool !== "set_product_strategy") {
      throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación todavía está en implementación.");
    }
    const tool = command.tool;
    const input = parseToolInput(tool, command.input), hash = commandHash(tool, input);
    const raw = await repository.loadKnowledge({ p_access: access, p_product_id: input.product_id, p_tool: tool,
      p_key: input.idempotency_key, p_hash: hash, p_dry_run: input.dry_run,
      ...(tool === "set_product_strategy" && "strategy_id" in input ? { p_strategy_id: input.strategy_id } : {}) }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(tool, raw.replay);
    const read = parseKnowledgeRead(raw, principal, input.product_id), requestId = randomUUID();
    const common = { p_access: access, p_product_id: input.product_id, p_expected_revision: input.expected_revision,
      p_stamp: read.stamp, p_tool: tool, p_key: input.idempotency_key, p_hash: hash, p_dry_run: input.dry_run };
    if (tool === "set_product_strategy") {
      const prepared = prepareStrategy(read, parseToolInput(tool, command.input), principal, requestId, randomUUID());
      const result = boundedResult(parseToolOutput(tool, prepared.result));
      return parseToolOutput(tool, await repository.commitKnowledge({ ...common, p_graph: null, p_notes: null, p_reviewed_ids: [],
        p_strategy: prepared.strategy, p_archive: prepared.archive, p_result: result }, signal));
    }
    const mutation = mutationContext(read, principal, input.product_id, randomUUID);
    const prepared = tool === "save_product_analysis" ? prepareAnalysisMutation(mutation, parseToolInput(tool, command.input)) :
      tool === "save_research" ? prepareResearchMutation(mutation, parseToolInput(tool, command.input)) : preparePatchMutation(mutation, parseToolInput(tool, command.input));
    const result = boundedResult(parseToolOutput(tool, graphMutationResult(read, prepared, input.product_id, requestId, mutation.pricing)));
    const newFacts = prepared.graph.Fact.filter(({ value }) => !read.graph.Fact.some((row) => row.value.id === value.id));
    let newFactIndex = 0;
    const reviewedIds = tool === "save_research" ? parseToolInput(tool, command.input).facts?.flatMap((fact) => {
      const id = "id" in fact ? fact.id : newFacts[newFactIndex++].value.id;
      return fact.reason?.trim() ? [id] : [];
    }) ?? [] : [];
    return parseToolOutput(tool, await repository.commitKnowledge({ ...common, p_graph: graphRecords(prepared.graph), p_notes: prepared.methodologicalNotes,
      p_reviewed_ids: reviewedIds, p_strategy: null, p_archive: null, p_result: result }, signal));
  };
}
