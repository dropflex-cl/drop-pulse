/** Solo fixtures de tests; nunca importarlas desde runtime. */
import { persuasionPlanSchema } from "./persuasion-schemas";
import { graphFixture, strategyFixture } from "./test-fixtures";
import type { PersuasionValidationContext } from "./persuasion-validation";
export function persuasionContextFixture(): PersuasionValidationContext {
  const strategy = strategyFixture(); strategy.readiness = { ready_for_execution: true, stale: false, needs_review: false, missing_fields: [] };
  return { strategy, graph: graphFixture(), assets: [], review_ids: [], review_count: 3, rows: [] };
}
export function persuasionPlanFixture() {
  const s = strategyFixture().snapshot;
  const specs = [
    { section_key: "hero", primary_job: "recognition", selected_component: "listing", preferred_medium: "commerce_led" },
    { section_key: "fit", primary_job: "product_fit", selected_component: "image-with-benefits", preferred_medium: "visual_led" },
    { section_key: "proof", primary_job: "social_proof", selected_component: "review-slider", preferred_medium: "proof_led" },
    { section_key: "risk", primary_job: "risk_reversal", selected_component: "faq-and-text", preferred_medium: "copy_led" },
  ];
  return persuasionPlanSchema.parse({ schema_version: "1.0", strategy_id: strategyFixture().id, angle_id: s.angles[0].id, landing_angle_id: "desk",
    status: "draft", audience_state: { persona_id: s.persona.id, awareness_level: "problem_aware", sophistication: "medium", primary_jtbd_ids: [s.jtbd.id],
      primary_pain_ids: [s.pain.id], primary_desire_ids: [], primary_objection_ids: [], entering_context: "Busca un escritorio más ordenado." },
    thesis: { recognition: "Cuesta encontrar cada cosa.", problem: "Los útiles quedan mezclados.", solution_logic: "Separar los útiles por compartimento.",
      product_role: "Un organizador con separaciones.", desired_transformation: "Encuentra lo que necesitas." },
    beliefs: specs.map(s => ({ key: s.section_key, type: s.section_key === "hero" ? "recognition" : s.section_key === "fit" ? "product_fit" : s.section_key,
      current_belief: "No sé si lo necesito.", target_belief: "Entiendo cómo encaja en mi escritorio.", resolution_mode: "section", resolution_section_key: s.section_key })),
    attention_budget: {}, sections: specs.map(s => ({ ...s, kind: "primary", candidate_components: [s.selected_component], belief_keys: [s.section_key],
      message: { headline_intent: "Encuentra lo que necesitas", takeaway: "Cada útil tiene su espacio." }, necessity: `Resuelve la creencia ${s.section_key}.`, cta: s.section_key === "hero" ? "primary" : "none" })), claims: [] });
}
