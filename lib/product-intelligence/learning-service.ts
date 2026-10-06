import "server-only";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { contextAccess, type LearningRepository } from "./repository";
import { commandHash } from "./concurrency";
import { parseToolInput, parseToolOutput } from "./validation";
import { outputSchemas } from "./schemas";
import { ProductIntelligenceError } from "./errors";
import { requireScopes, toolScopes } from "./policy";
export function createLearningExecutor(repository: LearningRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    const access = contextAccess(principal, identity);
    if (command.tool === "get_product_performance") {
      const input = parseToolInput(command.tool, command.input);
      return parseToolOutput(command.tool, await repository.loadPerformance({ p_access: access, p_product_id: input.product_id, p_from: input.from, p_through: input.through }, signal));
    }
    if (command.tool === "get_product_learning") {
      const input = parseToolInput(command.tool, command.input);
      const parsed = outputSchemas.get_product_learning.safeParse(await repository.loadLearning({ p_access: access, p_product_id: input.product_id, p_before_revision: input.before_revision ?? null }, signal));
      if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer los aprendizajes.");
      const result = parsed.data;
      if (!result.ok) return result;
      let bytes = 0; const items: unknown[] = [];
      for (const item of result.data.items) {
        const size = Buffer.byteLength(JSON.stringify(item));
        if (bytes + size > 40000) break;
        items.push(item); bytes += size;
      }
      if (!items.length && result.data.items.length) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Un aprendizaje supera el límite de respuesta.");
      if (items.length < result.data.items.length) {
        result.data.items = items; result.data.has_more = true;
        result.data.next_before_revision = (items.at(-1) as { revision: number }).revision;
      }
      return parseToolOutput(command.tool, result);
    }
    if (command.tool !== "save_product_learning") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de aprendizaje.");
    const input = parseToolInput(command.tool, command.input);
    return parseToolOutput(command.tool, await repository.commitLearning({ p_access: access, p_product_id: input.product_id, p_from: input.from, p_through: input.through,
      p_expected_revision: input.expected_revision, p_etag: input.expected_performance_etag, p_key: input.idempotency_key, p_hash: commandHash(command.tool, input),
      p_learning: input.learning, p_dry_run: input.dry_run }, signal));
  };
}
