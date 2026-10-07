import { ProductIntelligenceError } from "./errors";
import type { ToolInputs, ToolName } from "./schemas";

export const PI_SCOPES = ["product_intelligence:read", "product_intelligence:write", "product_intelligence:verify", "landing:generate", "ugc:generate", "performance:read"] as const;
export type PiScope = (typeof PI_SCOPES)[number];

/** Solo el backend autenticado construye el principal; no se parsea de argumentos MCP. */
export interface Principal {
  readonly userId: string;
  readonly actorId: string;
  readonly actorKind: "merchant" | "delegated";
  readonly clientId?: string;
  readonly scopes: readonly PiScope[];
}
export interface ProductAccess {
  readonly id: string;
  readonly userId: string;
  readonly deleting: boolean;
}
export interface DelegatedGrant {
  readonly userId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly productId: string | null;
  readonly scopes: readonly PiScope[];
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export const toolScopes: Record<ToolName, readonly PiScope[]> = {
  get_pdp_planning_context: ["product_intelligence:read"], get_component_catalog: ["product_intelligence:read"],
  get_angle_persuasion_plan: ["product_intelligence:read"], validate_angle_persuasion_plan: ["product_intelligence:read"],
  save_angle_persuasion_plan: ["product_intelligence:read", "product_intelligence:write"],
  get_landing_experience: ["product_intelligence:read"], save_landing_experience: ["product_intelligence:read", "product_intelligence:write"],
  generate_gallery_images: ["product_intelligence:read", "landing:generate"], get_gallery_generation_status: ["product_intelligence:read"],
  get_product_performance: ["product_intelligence:read", "performance:read"], get_product_learning: ["product_intelligence:read", "performance:read"],
  save_product_learning: ["product_intelligence:write", "performance:read"],
  get_creative_content: ["product_intelligence:read"], save_creative_content: ["product_intelligence:read", "product_intelligence:write"],
  get_gallery_content: ["product_intelligence:read"], save_gallery_content: ["product_intelligence:read", "product_intelligence:write"],
  get_event_content: ["product_intelligence:read"], save_event_content: ["product_intelligence:read", "product_intelligence:write"],
  get_usage_tip: ["product_intelligence:read"], save_usage_tip: ["product_intelligence:read", "product_intelligence:write"],
  get_ugc_content: ["product_intelligence:read"], get_ugc_montage: ["product_intelligence:read"], save_ugc_content: ["product_intelligence:read", "product_intelligence:write"],
  get_pack_labels: ["product_intelligence:read"], save_pack_labels: ["product_intelligence:write"],
  get_landing_content: ["product_intelligence:read"], save_landing_content: ["product_intelligence:write"],
  get_product_context: ["product_intelligence:read"], get_product_strategy: ["product_intelligence:read"], get_generation_status: ["product_intelligence:read"],
  save_product_context: ["product_intelligence:write"], save_product_analysis: ["product_intelligence:write"], patch_product_analysis: ["product_intelligence:write"], save_research: ["product_intelligence:write"], set_product_strategy: ["product_intelligence:write"],
  generate_ugc: ["product_intelligence:read", "ugc:generate"],
};

export function requireScopes(principal: Principal, scopes: readonly PiScope[]): void {
  if (!scopes.every((scope) => principal.scopes.includes(scope))) throw new ProductIntelligenceError("FORBIDDEN", "Tu autorización no permite esta operación.");
}

export function authorizeTool<K extends ToolName>(principal: Principal, product: ProductAccess | null, tool: K, input: ToolInputs[K], grant: DelegatedGrant | null, now: Date): Principal {
  if (!product || product.userId !== principal.userId || product.id !== input.product_id) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos ese producto.");
  const required = [...toolScopes[tool]];
  if (tool === "get_product_context" && (input as ToolInputs["get_product_context"]).include?.includes("performance")) required.push("performance:read");
  requireScopes(principal, required);
  if (principal.actorKind === "delegated") {
    const valid = grant && !grant.revoked && grant.userId === principal.userId && grant.actorId === principal.actorId && grant.clientId === principal.clientId && (grant.productId === null || grant.productId === product.id) && new Date(grant.expiresAt).getTime() > now.getTime();
    if (!valid || !required.every((scope) => grant.scopes.includes(scope))) throw new ProductIntelligenceError("FORBIDDEN", "La autorización delegada venció o fue revocada.");
  }
  if (product.deleting && !tool.startsWith("get_")) throw new ProductIntelligenceError("NOT_FOUND", "El producto ya no está disponible para cambios.");
  return principal.actorKind === "delegated" && grant ? { ...principal, scopes: principal.scopes.filter((scope) => grant.scopes.includes(scope)) } : principal;
}

export function checkRevision(expected: number, current: number): void {
  if (expected !== current) throw new ProductIntelligenceError("REVISION_CONFLICT", "El producto cambió desde tu lectura. Recupera el contexto y concilia tu cambio.", { expected_revision: expected, current_revision: current });
}

export function checkArtifact(expected: string, current: string): void {
  if (expected !== current) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "La pieza cambió desde tu revisión. Recupera su estado antes de continuar.", { expected_artifact_etag: expected, current_artifact_etag: current });
}
