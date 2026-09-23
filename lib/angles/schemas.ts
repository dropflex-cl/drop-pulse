// Salida estructurada del orquestador de ángulos y de los agentes de ángulo (agentes-creativos/*.md,
// adaptados a LATAM con pago contra entrega). Una sola definición para el modelo (JSON schema), la
// validación y los tipos. Claves en inglés; textos para el comerciante en español con tuteo.

import * as z from "zod/v4";
import { AWARENESS_LEVELS } from "@/lib/ai/schemas";
import { ANGLES, SALES_ANGLES, type SalesAngle } from "./catalog";

/** Bump cuando cambie el prompt o el esquema del orquestador. */
export const ANGLE_ROUTER_PROMPT_VERSION = 1;
/** Bump cuando cambie el prompt o el esquema de los agentes de ángulo. */
export const ANGLE_BRIEF_PROMPT_VERSION = 1;

const text = z.string();
const maybe = z.string().nullable();
const score05 = z.number().int().describe("De 0 a 5.");

// ---------------------------------------------------------------- Orquestador

function angleEvaluation(a: SalesAngle) {
  const def = ANGLES[a];
  return z.object({
    criteria: z.object(Object.fromEntries(def.criteria.map((c) => [c.key, score05.describe(`${c.label}. ${c.guide}`)]))),
    penalty_applies: z.boolean().describe(`Penalización: ${def.penalty.when}`),
    why: text.describe("Para el comerciante, una o dos frases en tuteo: por qué encaja o no con SU cliente ideal y SU producto. Concreto, sin jerga."),
    risks: z.array(text).describe("Riesgos concretos de usar este ángulo (0 a 3), en frases cortas. Sin repetir la penalización."),
  });
}

export const angleRouterSchema = z.object({
  diagnosis: z.object({
    problem_type: text.describe("Dolor físico, estético, funcional del hogar, mascota o estatus."),
    awareness_level: z.enum(AWARENESS_LEVELS),
    sophistication: z.number().int().describe("De 1 a 5."),
    result_visibility: z.enum(["visible", "invisible"]),
    available_proof: z.array(text).describe("Pruebas reales que hay hoy (de la ficha). Vacío si no hay."),
    economics_note: text.describe("Qué permite el precio y los packs de PRECIO Y OFERTA."),
  }),
  angles: z.object(Object.fromEntries(SALES_ANGLES.map((a) => [a, angleEvaluation(a)])) as Record<SalesAngle, ReturnType<typeof angleEvaluation>>),
  combinations: z
    .array(
      z.object({
        primary: z.enum(SALES_ANGLES),
        secondary: z.enum(SALES_ANGLES),
        how: text.describe("Para el comerciante, una o dos frases: qué dice el gancho y cómo lo remata el secundario, con el producto y el cliente concretos."),
      }),
    )
    .describe("Las 3 combinaciones principal + secundario con más sentido, la mejor primero."),
  aida_emphasis: text.describe("Qué etapa AIDA necesita más espacio con este nivel de consciencia, y por qué."),
  missing_inputs: z
    .array(z.object({ text: text.describe("Qué dato falta, en una línea."), gain: text.describe("Qué ángulo mejoraría y cuánto, en pocas palabras.") }))
    .describe("Datos que subirían la precisión (máximo 3). No incluyas reseñas ni expertos: el sistema los pide solo."),
  compliance_flags: z.array(text),
  test_plan: text.describe("Plan de prueba corto: ángulos × ganchos, presupuesto mínimo y KPI."),
});

export type AngleRouterOutput = z.infer<typeof angleRouterSchema>;
export type AngleEvaluation = AngleRouterOutput["angles"][SalesAngle];

// ---------------------------------------------------------------- Agentes de ángulo

export const AIDA_STAGES = ["attention", "interest", "desire", "action"] as const;
export type AidaStage = (typeof AIDA_STAGES)[number];

const hook = z.object({
  text: text.describe("El gancho tal como se dice o se lee, en el idioma del mercado y con tuteo."),
  type: text.describe("Tipo de gancho según las plantillas del ángulo."),
  visual_first_3s: text.describe("Qué se ve en los primeros 3 segundos."),
  aida_stage: z.enum(AIDA_STAGES),
  meta_policy_check: z.enum(["ok", "review"]).describe("«review» si roza la política de atributos personales de Meta."),
});

const briefBase = {
  fit_check: z.object({ score: z.number().int().describe("De 0 a 100."), go: z.boolean(), reason: text }),
  psychological_lever: text.describe("Qué palanca concreta usas y por qué."),
  core_message: text.describe("El mensaje central en una frase."),
  hooks: z.array(hook).describe("10 ganchos, cubriendo al menos 3 tipos."),
  recommended_hook: z.number().int().describe("Índice (desde 0) del gancho que abrirías hoy."),
  aida_summary: z
    .object({ attention: text, interest: text, desire: text, action: text })
    .describe("Una frase por etapa: qué hace el anuncio en cada una (lo que ve el comerciante)."),
  body_beats: z.array(z.object({ beat: text, aida_stage: z.enum(AIDA_STAGES), content: text })),
  aida_emphasis: text.describe("Qué etapa pesa más para este producto según su nivel de consciencia, y por qué."),
  proof_to_show: z.array(text).describe("Solo pruebas reales de la ficha."),
  objection_handling: z.array(z.object({ objection: text, answer: text })).describe("3 a 5, incluida al menos una del pago contra entrega o de comprar online."),
  offer_layer: text.describe("La oferta en una línea, con los números de PRECIO Y OFERTA y el cierre del mercado («Paga al recibir»)."),
  visual_concepts: z.array(z.object({ format: text, description: text, reference: text })).describe("3 conceptos."),
  static_ad_concepts: z.array(z.object({ headline: text, image: text, body: text })).describe("2 estáticos (3 en Oferta)."),
  landing: text.describe("Qué página de producto recomiendas para este ángulo."),
  compliance_flags: z.array(text),
  missing_inputs: z.array(text),
  handoff_to_ugc: z.object({ spokesperson: text, tone: text, must_include: z.array(text), must_avoid: z.array(text) }),
};

const DETAILS: Record<SalesAngle, z.ZodType> = {
  authority: z.object({
    expert_spec: z.object({
      status: z.enum(["real", "to_hire"]),
      name_or_profile: text.describe("El experto real de la ficha o el perfil a contratar (nunca una identidad inventada)."),
      credential: text,
      setting: text,
      why_they_use_it: text,
    }),
  }),
  common_enemy: z.object({ enemy: z.object({ name: text.describe("Práctica, categoría o creencia; nunca una marca."), why_it_fails: text, hidden_cost: text, factual_basis: text }) }),
  unique_mechanism: z.object({
    mechanism: z.object({ assumed_cause: text, real_cause: text, how_product_addresses_it: text, one_line: text, metaphor: text, factual_basis: text }),
    animation_brief: text,
  }),
  age_identity: z.object({
    segment: z.object({ label: text, self_name: text, trigger_moment: text, identity_at_stake: text }),
    additional_segments: z.array(text).describe("Al menos 2 grupos más para probar."),
  }),
  personal_story: z.object({
    story_source: z.object({ type: z.enum(["real_customer", "composite_labeled", "none"]), customer_ref: text, consent: z.enum(["yes", "pending", "no"]) }),
    story: z.object({ protagonist: text, worst_moment: text, escalation: text, turn: text, discovery: text, resolution_detail: text }),
    interview_questions: z.array(text),
  }),
  offer: z.object({
    role: z.enum(["primary", "layer"]),
    recommended_offer: z.object({ structure: text.describe("Uno de los packs de PRECIO Y OFERTA."), why: text, anchor: text, urgency: maybe.describe("Plazo real o null.") }),
  }),
};

export function angleBriefSchema(a: SalesAngle) {
  return z.object({ ...briefBase, details: DETAILS[a] });
}

/** Lo común a los 6 briefs (lo que leen la pantalla y los pasos siguientes). */
export const angleBriefBaseSchema = z.object({ ...briefBase, details: z.record(z.string(), z.unknown()) });
export type AngleBriefPayload = z.infer<typeof angleBriefBaseSchema>;

/** Lo que el comerciante puede editar de un desarrollo. */
export const angleBriefEditSchema = z.object({
  hooks: z.array(z.string().trim().min(1)).min(1).max(12),
  recommended_hook: z.number().int().min(0),
  aida_summary: z.object({ attention: z.string().trim().min(1), interest: z.string().trim().min(1), desire: z.string().trim().min(1), action: z.string().trim().min(1) }),
  objection_handling: z.array(z.object({ objection: z.string().trim().min(1), answer: z.string().trim().min(1) })).max(8),
  offer_layer: z.string().trim().min(1),
});
export type AngleBriefEdit = z.infer<typeof angleBriefEditSchema>;
