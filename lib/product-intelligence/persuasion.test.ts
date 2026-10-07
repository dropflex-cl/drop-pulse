import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { COMPONENT_CAPABILITIES } from "./component-capabilities";
import { persuasionPlanSchema, landingExperienceSchema } from "./persuasion-schemas";
import { validatePersuasionPlan, validateLandingExperience, contentAttentionIssues } from "./persuasion-validation";
import { persuasionPlanFixture, persuasionContextFixture } from "./persuasion-fixtures";
import { parseToolInput } from "./validation";
import { experienceQuery, resolveLandingExperience, runtimeExperience } from "./experience-resolver";
import { canonicalHash } from "./concurrency";
import { persuasionEnabled } from "./persuasion-flags";
const uuid = "e0000000-0000-4000-8000-000000000001";
const codes = (plan = persuasionPlanFixture(), context = persuasionContextFixture()) => validatePersuasionPlan(plan, context).map(i => i.code);
function experience() {
  const plan = persuasionPlanFixture();
  return landingExperienceSchema.parse({ schema_version: "1.0", strategy_id: plan.strategy_id, angle_id: plan.angle_id, persuasion_plan_id: uuid,
    plan_revision: 1, landing_angle_id: plan.landing_angle_id, experience_key: "desk_default", architecture_variant: "compact", status: "draft",
    sections: plan.sections.map(s => ({ section_key: s.section_key, component: s.selected_component, content_variant_key: "default", persuasion_job: s.primary_job, belief_keys: s.belief_keys, enabled: true })) });
}
describe("PDP · argumento mínimo y contratos reales", () => {
  it("cubre exactamente el catálogo real y mantiene flags apagados", () => {
    expect(COMPONENT_CAPABILITIES.map(c => c.component)).toEqual(["listing", ...CATALOG.map(c => c.id)]);
    expect(persuasionEnabled({})).toBe(false); expect(persuasionEnabled({ PDP_PERSUASION_ENABLED: "true" })).toBe(true);
    expect(persuasionEnabled({ PDP_PERSUASION_ENABLED: "false" })).toBe(false);
  });
  it("acepta una narrativa breve con un objetivo y contribución por bloque", () => { expect(codes()).toEqual([]); });
  it("rechaza presupuestos inflados, múltiples mensajes y enums inventados", () => {
    const p = persuasionPlanFixture();
    expect(persuasionPlanSchema.safeParse({ ...p, attention_budget: { ...p.attention_budget, max_primary_sections: 8 } }).success).toBe(false);
    expect(persuasionPlanSchema.safeParse({ ...p, attention_budget: { ...p.attention_budget, max_primary_messages_per_section: 2 } }).success).toBe(false);
    expect(persuasionPlanSchema.safeParse({ ...p, sections: [{ ...p.sections[0], primary_job: "trust" }] }).success).toBe(false);
  });
  it("detecta demasiadas secciones, redundancia y cobertura rota", () => {
    const p = persuasionPlanFixture(); p.attention_budget.max_primary_sections = 3;
    expect(codes(p)).toContain("attention_budget");
    p.sections.push({ ...p.sections[2], section_key: "proof_again" });
    expect(codes(p)).toContain("removable_section"); expect(codes(p)).toContain("redundant_job");
    p.beliefs[0].resolution_section_key = "missing"; expect(codes(p)).toContain("belief_coverage");
  });
  it("valida pertenencia, candidato, job, persona y apoyos del hero", () => {
    const p = persuasionPlanFixture(); p.sections[1].selected_component = "inventory";
    p.audience_state.persona_id = uuid;
    expect(codes(p)).toEqual(expect.arrayContaining(["invalid_reference", "component_job", "component_candidate", "hero_support"]));
    p.sections.push({ ...p.sections[0], section_key: "commerce", selected_component: "shipping-timeline" }); expect(codes(p)).toContain("runtime_placement");
  });
  it("no usa evidencia contradictoria ni enlaces de otros facts", () => {
    const p = persuasionPlanFixture(), c = persuasionContextFixture(), fact = c.graph.Fact[0].value, evidence = c.graph.EvidenceLink[0].value;
    p.claims = [{ key: "compartments", text_intent: fact.statement, type: "product_fact", fact_ids: [fact.id], evidence_ids: [evidence.id], review_ids: [], restrictions: [] }];
    p.sections[1].claim_keys = ["compartments"];
    c.graph.Fact[0].value = { ...fact, verification_status: "verified", usage_status: "approved" };
    expect(codes(p, c)).not.toContain("claim_evidence");
    c.graph.EvidenceLink[0].value = { ...evidence, relation: "contradicts" };
    expect(codes(p, c)).toEqual(expect.arrayContaining(["restricted_claim", "claim_evidence"]));
    p.claims[0].fact_ids = []; expect(codes(p, c)).toContain("unbound_evidence");
  });
  it("requiere reseñas reales y no verifica alcance clínico por tener una referencia", () => {
    const p = persuasionPlanFixture(); p.claims = [{ key: "customer", type: "testimonial", text_intent: "Me funcionó", fact_ids: [], evidence_ids: [], review_ids: [uuid], restrictions: [] }];
    expect(codes(p)).toContain("synthetic_testimonial"); p.claims[0].type = "clinical"; expect(codes(p)).toContain("claim_scope_review");
    p.sections[1].source_asset_refs = [{ source: "ugc", id: uuid, role: "proof" }]; expect(codes(p)).toContain("synthetic_proof");
  });
  it("cuenta copy real sin SEO y detecta hero cargado y bullets excesivos", () => {
    const p = persuasionPlanFixture();
    expect(contentAttentionIssues("hero", "listing", { title: "a".repeat(71), short_description: "b".repeat(151), seo_description: "z".repeat(600) }, p.attention_budget)).toHaveLength(2);
    expect(contentAttentionIssues("fit", "image-with-benefits", { benefits: Array.from({ length: 4 }, () => ({ title: "Útil", body: "b".repeat(110) })) }, p.attention_budget).length).toBe(1);
  });
  it("una experiencia no activa contenido sin aprobación ni cubre beliefs con secciones apagadas", () => {
    const p = persuasionPlanFixture(), c = persuasionContextFixture(), e = experience();
    e.status = "active"; e.sections[1].enabled = false;
    expect(validateLandingExperience(e, p, 2, c).map(i => i.code)).toEqual(expect.arrayContaining(["plan_binding", "plan_approval", "belief_coverage", "content_approval"]));
  });
  it("metadata opt-in exige versión nueva y rechaza campos inventados", () => {
    const request = { product_id: uuid, schema_version: "1.0", expected_revision: 0, expected_planning_stamp: "b".repeat(64), expected_etag: "a".repeat(64), idempotency_key: "fixture-key", plan: persuasionPlanFixture() };
    expect(() => parseToolInput("save_angle_persuasion_plan", request)).not.toThrow();
    expect(() => parseToolInput("save_angle_persuasion_plan", { ...request, generate: true })).toThrow();
    expect(() => parseToolInput("save_angle_persuasion_plan", { ...request, plan: { ...request.plan, verified: true } })).toThrow();
  });
});
describe("PDP · resolver y fallback", () => {
  const base = runtimeExperience({ id: uuid, revision: 1, etag: "a".repeat(64), payload: experience() }, uuid);
  const fallback = { ...base, experience_key: "product_default", landing_angle_id: "other", is_default: true };
  const exact = { ...base, experience_key: "mirror", landing_hook_id: "mirror" };
  const manifest = { schema_version: "1.0", enabled: true, experiences: [base, exact, fallback] };
  it("exacto → ángulo → default → legacy", () => {
    expect(resolveLandingExperience(manifest, new URLSearchParams("angle=desk&hook=mirror"))?.experience_key).toBe("mirror");
    expect(resolveLandingExperience(manifest, new URLSearchParams("df_angle=desk&df_hook=unknown"))?.experience_key).toBe("desk_default");
    expect(resolveLandingExperience(manifest, new URLSearchParams("angle=unknown"))?.experience_key).toBe("product_default");
    expect(resolveLandingExperience({ ...manifest, experiences: [base] }, new URLSearchParams("angle=unknown"))).toBeNull();
    expect(resolveLandingExperience(null, new URLSearchParams("angle=desk"))).toBeNull();
  });
  it("duplicados, aliases conflictivos y entrada maliciosa nunca interpretan una ruta", () => {
    for (const q of ["angle=desk&angle=other", "angle=desk&df_angle=other", "angle=<script>", "hook=mirror"]) expect(experienceQuery(new URLSearchParams(q)).angle).toBeNull();
    expect(experienceQuery(new URLSearchParams("angle=desk&df_angle=desk"))).toEqual({ angle: "desk", hook: null });
  });
  it("orden es parte de la identidad, no se normaliza como relaciones", () => {
    expect(canonicalHash({ sections: ["a", "b"] })).not.toBe(canonicalHash({ sections: ["b", "a"] }));
  });
  it("componentes desconocidos y rutas ambiguas siempre vuelven a legacy", () => {
    expect(resolveLandingExperience({ ...manifest, experiences: [base, base] }, new URLSearchParams("angle=desk"))).toBeNull();
    expect(resolveLandingExperience({ ...manifest, experiences: [{ ...base, sections: [{ ...base.sections[0], component: "unknown" }] }] }, new URLSearchParams("angle=desk"))).toBeNull();
  });
});
