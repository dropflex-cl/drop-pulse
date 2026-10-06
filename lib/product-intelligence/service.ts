import "server-only";
import { randomUUID } from "node:crypto";
import { commandHash } from "./concurrency";
import { parseContextRead, prepareProductContext, productContextResponse } from "./context";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { requireScopes, toolScopes } from "./policy";
import { contextAccess, type ContextRepository } from "./repository";
import { parseToolInput, parseToolOutput } from "./validation";

export const PERSISTED_CONTEXT_TOOLS = ["get_product_context", "save_product_context"] as const;

/** La UI y el transporte MCP usan el mismo comando y las mismas transacciones. */
export function createContextExecutor(repository: ContextRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    const access = contextAccess(principal, identity);
    if (command.tool === "get_product_context") {
      const input = parseToolInput(command.tool, command.input);
      if (input.include?.includes("performance")) requireScopes(principal, ["performance:read"]);
      const read = parseContextRead(await repository.load({ p_access: access, p_product_id: input.product_id, p_revision: input.at_revision ?? null,
        p_performance: input.include?.includes("performance") ?? false }, signal));
      return parseToolOutput(command.tool, productContextResponse(read, input, randomUUID()));
    }
    if (command.tool !== "save_product_context") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación todavía está en implementación.");
    const input = parseToolInput(command.tool, command.input);
    const hash = commandHash(command.tool, input);
    const raw = await repository.load({ p_access: access, p_product_id: input.product_id, p_key: input.idempotency_key, p_hash: hash, p_dry_run: input.dry_run }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(command.tool, raw.replay);
    const read = parseContextRead(raw);
    const prepared = prepareProductContext(read, input, randomUUID());
    const result = parseToolOutput(command.tool, prepared.result);
    // Commit puede haber ocurrido cuando llega un timeout. Receipt exacto hace seguro reintentar.
    return parseToolOutput(command.tool, await repository.commit({ p_access: access, p_product_id: input.product_id,
      p_expected_revision: input.expected_revision, p_stamp: read.stamp, p_key: input.idempotency_key, p_hash: hash,
      p_context: prepared.context, p_pricing: prepared.pricing, p_base_image: prepared.baseImage === undefined ? null : { id: prepared.baseImage },
      p_result: result, p_dry_run: input.dry_run }, signal));
  };
}
