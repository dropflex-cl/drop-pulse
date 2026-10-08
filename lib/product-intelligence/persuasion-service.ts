import { automationActive, shopifyStrategyRead } from "./automation-active";
import { imagePickSchema } from "@/lib/copy/variants";
import { contentVariants } from "@/lib/copy/variants";
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { componentCapabilityCatalog } from "./component-capabilities";
import { commandHash } from "./concurrency";
import { ProductIntelligenceError } from "./errors";
import { parseKnowledgeRead, strategyResponse, type KnowledgeRead } from "./knowledge";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { checkRevision, requireScopes, toolScopes } from "./policy";
import { contextAccess, type PersuasionRepository } from "./repository";
import { experienceRecordSchema, persuasionRecordSchema, persuasionAssetSchema, type AnglePersuasionPlan } from "./persuasion-schemas";
import { validateLandingExperience, validatePersuasionPlan, type PersuasionValidationContext } from "./persuasion-validation";
import { parseToolInput, parseToolOutput } from "./validation";

export const persuasionReadSchema = z.object({ knowledge: z.unknown(), planning_stamp: z.string(), empty_etag: z.string(), enabled: z.boolean(),
  plans: z.array(persuasionRecordSchema).max(20), experiences: z.array(experienceRecordSchema).max(20),
  assets: z.array(persuasionAssetSchema).max(500),
  landing: z.object({ rows: z.array(z.object({ component: z.string(), proposal: z.unknown(), content: z.unknown().nullable(), images: z.array(imagePickSchema).default([]), enabled: z.boolean(), status: z.string() })),
    reviews: z.array(z.object({ id: z.string(), body: z.string(), rating: z.number() })), review_count: z.number() }),
});
function planSummary(p: z.infer<typeof persuasionRecordSchema>) {
  return { id: p.id, revision: p.revision, etag: p.etag, strategy_id: p.payload.strategy_id, angle_id: p.payload.angle_id,
    landing_angle_id: p.payload.landing_angle_id, status: p.payload.status, primary_sections: p.payload.sections.filter(s => s.kind === "primary").length };
}
function experienceSummary(e: z.infer<typeof experienceRecordSchema>) {
  const p = e.payload;
  return { id: e.id, revision: e.revision, etag: e.etag, strategy_id: p.strategy_id, angle_id: p.angle_id, landing_angle_id: p.landing_angle_id,
    persuasion_plan_id: p.persuasion_plan_id, plan_revision: p.plan_revision, landing_hook_id: p.landing_hook_id, experience_key: p.experience_key,
    architecture_variant: p.architecture_variant, is_default: p.is_default, status: p.status };
}
export function persuasionValidationContext(raw: z.infer<typeof persuasionReadSchema>, principal: Parameters<DomainExecutor>[0], productId: string, strategyId: string, currentRead?: KnowledgeRead): PersuasionValidationContext {
  const read = currentRead ?? parseKnowledgeRead(raw.knowledge, principal, productId);
  const version = read.requestedStrategy?.id === strategyId ? read.requestedStrategy : read.strategy?.id === strategyId ? read.strategy : null;
  if (!version) throw new ProductIntelligenceError("INVALID_REFERENCE", "No encontramos esta estrategia en el producto.");
  return { strategy: strategyResponse(version, read, productId, "execution"), graph: read.currentGraph, assets: raw.assets,
    review_ids: raw.landing.reviews.map(r => r.id), review_count: raw.landing.review_count,
    rows: raw.landing.rows.map(r => ({ ...r, content: r.content ?? r.proposal })) };
}
function blockIssues(issues: ReturnType<typeof validatePersuasionPlan>, strict: boolean) {
  const blocking = issues.filter(i => i.severity === "error" && (strict || i.code === "invalid_reference" || i.code === "unbound_evidence"));
  if (blocking.length) throw new ProductIntelligenceError("VALIDATION_ERROR", blocking[0].message, { fields: blocking.map(i => i.field).slice(0, 100) });
}
export function createPersuasionExecutor(repository: PersuasionRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    requireScopes(principal, toolScopes[command.tool]);
    const tool = command.tool;
    if (!["get_pdp_planning_context", "get_component_catalog", "get_angle_persuasion_plan", "validate_angle_persuasion_plan", "save_angle_persuasion_plan", "get_landing_experience", "save_landing_experience"].includes(tool)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de planificación de páginas.");
    const input = parseToolInput(tool, command.input), access = contextAccess(principal, identity);
    if (!("product_id" in input)) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación requiere un producto.");
    const writing = tool === "save_angle_persuasion_plan" || tool === "save_landing_experience";
    const hash = tool === "save_angle_persuasion_plan" ? commandHash(tool, parseToolInput(tool, command.input)) : tool === "save_landing_experience" ? commandHash(tool, parseToolInput(tool, command.input)) : null;
    const strategyId = "plan" in input ? input.plan.strategy_id : "experience" in input ? input.experience.strategy_id : "strategy_id" in input ? input.strategy_id : null;
    const raw = await repository.loadPersuasion({ p_access: access, p_product_id: input.product_id, p_strategy_id: strategyId,
      p_tool: writing ? tool : null, p_key: "idempotency_key" in input ? input.idempotency_key : null, p_hash: hash,
      p_dry_run: "dry_run" in input ? input.dry_run : false }, signal);
    if (writing && raw && typeof raw === "object" && "replay" in raw) return parseToolOutput(tool, raw.replay);
    const state = persuasionReadSchema.parse(raw);
    if (!state.enabled) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Activa la planificación de páginas para este producto.");
    const automatic = await automationActive(repository, principal, input.product_id, identity, signal);
    const currentRead = parseKnowledgeRead(state.knowledge, principal, input.product_id);
    const read = automatic ? await shopifyStrategyRead(repository, currentRead, principal, input.product_id, identity, signal) : currentRead;
    const base = { ok: true, product_id: input.product_id, revision: read.current_revision, request_id: randomUUID() };
    if (tool === "get_component_catalog") return parseToolOutput(tool, { ...base, data: { catalog: componentCapabilityCatalog(state.landing.review_count) } });
    if (tool === "get_landing_experience") {
      const query = parseToolInput(tool, command.input);
      const current = query.experience_id ? state.experiences.find(e => e.id === query.experience_id) : null;
      if (query.experience_id && !current) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos esta experiencia.");
      return parseToolOutput(tool, { ...base, data: { current: current ?? null, items: state.experiences.map(experienceSummary), etag: current?.etag ?? state.empty_etag, planning_stamp: state.planning_stamp } });
    }
    if (tool === "get_pdp_planning_context" || tool === "get_angle_persuasion_plan") {
      const query = parseToolInput(tool, command.input);
      const context = persuasionValidationContext(state, principal, input.product_id, query.strategy_id, read);
      const angle = context.strategy.snapshot.angles.find(a => a.id === query.angle_id);
      if (!angle) throw new ProductIntelligenceError("INVALID_REFERENCE", "El ángulo no pertenece a esta estrategia.");
      const plans = state.plans.filter(p => p.payload.strategy_id === query.strategy_id && p.payload.angle_id === query.angle_id);
      if (tool === "get_pdp_planning_context") return parseToolOutput(tool, { ...base, data: {
        strategy: context.strategy, angle, context: { product: read.snapshot.catalog, inputs: read.snapshot.context, pricing: read.snapshot.pricing,
          policies: read.snapshot.settings, usage_restrictions: context.strategy.readiness },
        available_assets: state.assets, landing: { review_count: state.landing.review_count, rows: state.landing.rows.map(r => ({ component: r.component, enabled: r.enabled, status: r.status,
          variants: contentVariants(r.content ?? r.proposal).map(v => ({ key: v.key, angle_id: v.angle_id, hook_id: v.hook_id, image_count: (v.images ?? r.images).length })) })) },
        catalog: componentCapabilityCatalog(state.landing.review_count), plans: plans.map(planSummary),
        experiences: state.experiences.filter(e => e.payload.strategy_id === query.strategy_id && e.payload.angle_id === query.angle_id).map(experienceSummary),
        planning_stamp: state.planning_stamp, limitations: ["Las métricas actuales se agregan por campaña; no atribuyen resultados a una arquitectura.",
          "El hero conserva los controles de compra. Los apoyos comerciales preceden al cuerpo narrativo.",
          "UGC generado no es una reseña ni prueba de experiencia real.", "Consulta get_landing_content por componente para escribir su contrato real."] } });
      const id = parseToolInput("get_angle_persuasion_plan", command.input).plan_id;
      const current = id ? plans.find(p => p.id === id) : plans[0];
      if (id && !current) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos este plan para la estrategia y el ángulo.");
      return parseToolOutput("get_angle_persuasion_plan", { ...base, data: { current: current ?? null, etag: current?.etag ?? state.empty_etag, planning_stamp: state.planning_stamp,
        issues: current ? validatePersuasionPlan(current.payload, context) : [] } });
    }
    if (tool === "validate_angle_persuasion_plan") {
      const query = parseToolInput(tool, command.input); checkRevision(query.expected_revision, read.current_revision);
      const issues = validatePersuasionPlan(query.plan, persuasionValidationContext(state, principal, input.product_id, query.plan.strategy_id, read));
      return parseToolOutput(tool, { ...base, data: { valid: !issues.some(i => i.severity === "error"), issues } });
    }
    if (tool !== "save_angle_persuasion_plan" && tool !== "save_landing_experience") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no está disponible.");
    const write = parseToolInput(tool, command.input); checkRevision(write.expected_revision, read.current_revision);
    if (write.expected_planning_stamp !== state.planning_stamp) throw new ProductIntelligenceError("REVISION_CONFLICT", "El contexto de la página cambió. Recupera el recorrido y concilia tu decisión.");
    let issues: ReturnType<typeof validatePersuasionPlan>, id: string | null, payload: AnglePersuasionPlan | typeof state.experiences[number]["payload"];
    if (tool === "save_angle_persuasion_plan") {
      const request = parseToolInput(tool, command.input); id = request.plan_id; payload = request.plan;
      issues = validatePersuasionPlan(request.plan, persuasionValidationContext(state, principal, input.product_id, request.plan.strategy_id, read));
      if (request.plan.status === "approved" && principal.actorKind !== "merchant" && (!automatic || request.plan.strategy_id !== read.currentActiveStrategyId)) throw new ProductIntelligenceError("FORBIDDEN", "Solo el comerciante puede aprobar el plan.");
      blockIssues(issues, ["review", "approved"].includes(request.plan.status));
      // Un plan consumido es inmutable: se crea otra variante sin cambiar experiencias activas.
      if (id && state.experiences.some(e => e.payload.persuasion_plan_id === id && e.payload.status === "active")) throw new ProductIntelligenceError("DEPENDENCY_IN_USE", "Crea otro plan o archiva las experiencias activas antes de cambiarlo.");
    } else {
      const request = parseToolInput(tool, command.input); id = request.experience_id; payload = request.experience;
      const plan = state.plans.find(p => p.id === request.experience.persuasion_plan_id);
      if (!plan) throw new ProductIntelligenceError("INVALID_REFERENCE", "El plan no pertenece a este producto.");
      if (request.experience.status === "active" && principal.actorKind !== "merchant" && (!automatic || request.experience.strategy_id !== read.currentActiveStrategyId)) throw new ProductIntelligenceError("FORBIDDEN", "Solo el comerciante puede activar una experiencia.");
      issues = validateLandingExperience(request.experience, plan.payload, plan.revision,
        persuasionValidationContext(state, principal, input.product_id, plan.payload.strategy_id, read));
      blockIssues(issues, ["review", "active"].includes(request.experience.status));
      const old = state.experiences.find(e => e.id === id);
      if (principal.actorKind !== "merchant") {
        for (const section of request.experience.sections) {
          const prior = old?.payload.sections.find(s => s.section_key === section.section_key);
          if (section.manual_overrides.some(field => !prior?.manual_overrides.includes(field))) throw new ProductIntelligenceError("FORBIDDEN", "Solo el comerciante puede establecer overrides manuales.");
        }
      }
      if (old && principal.actorKind !== "merchant") for (const section of old.payload.sections.filter(s => s.manual_overrides.length)) {
        const next = request.experience.sections.find(s => s.section_key === section.section_key);
        if (!next || section.manual_overrides.some(field => {
          if (field === "order") return old.payload.sections.indexOf(section) !== request.experience.sections.indexOf(next);
          if (field === "content") return section.content_variant_key !== next.content_variant_key;
          if (field === "assets") return JSON.stringify([section.images, section.asset_refs]) !== JSON.stringify([next.images, next.asset_refs]);
          return section[field] !== next[field];
        }) || section.manual_overrides.some(field => !next.manual_overrides.includes(field))) throw new ProductIntelligenceError("DEPENDENCY_IN_USE", "Conserva los cambios manuales del comerciante o crea otra variante.");
      }
    }
    return parseToolOutput(tool, await repository.commitPersuasion({ p_access: access, p_product_id: write.product_id, p_tool: tool,
      p_id: id, p_expected_revision: write.expected_revision, p_etag: write.expected_etag, p_stamp: state.planning_stamp,
      p_key: write.idempotency_key, p_hash: hash, p_payload: payload, p_issues: issues, p_dry_run: write.dry_run }, signal));
  };
}
