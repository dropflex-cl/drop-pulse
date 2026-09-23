// Salida estructurada del orquestador de ángulos y de los agentes de ángulo (agentes-creativos/*.md,
// adaptados a LATAM con pago contra entrega). Una sola definición para el modelo (JSON schema), la
// validación y los tipos. Claves en inglés; textos para el comerciante en español con tuteo.

import * as z from "zod/v4";
import { AWARENESS_LEVELS } from "@/lib/ai/schemas";
import { ANGLES, SALES_ANGLES, type SalesAngle } from "./catalog";

/** Bump cuando cambie el prompt o el esquema del orquestador. */
export const ANGLE_ROUTER_PROMPT_VERSION = 2;
/** Bump cuando cambie el prompt o el esquema de los agentes de ángulo. */
export const ANGLE_BRIEF_PROMPT_VERSION = 2;

const text = z.string();
const maybe = z.string().nullable();

// ---------------------------------------------------------------- Orquestador
// Esquema compacto a propósito: la salida estructurada compila el esquema a una gramática y la API
// rechaza las demasiado grandes (400 «compiled grammar is too large»). Los 6 ángulos comparten una
// forma y los criterios van como lista en el orden de lib/angles/catalog.ts (el prompt lo dice).

const angleItem = z.object({
  angle: z.enum(SALES_ANGLES),
  scores: z.array(z.number().int()).describe("Un número de 0 a 5 por criterio, en el orden en que el sistema los lista para ese ángulo."),
  penalty: z.boolean().describe("Si aplica la penalización del ángulo."),
  why: text.describe("Para el comerciante, una o dos frases en tuteo: por qué encaja o no con SU cliente ideal y SU producto."),
  risks: z.array(text).describe("0 a 3 riesgos concretos, en frases cortas. Sin repetir la penalización."),
});

export const angleRouterSchema = z.object({
  awareness_level: z.enum(AWARENESS_LEVELS),
  sophistication: z.number().int().describe("De 1 a 5."),
  diagnosis: text.describe("Tipo de problema, si el resultado se ve en 3 segundos, las pruebas reales que hay y qué permite la economía, en 2 o 3 frases."),
  angles: z.array(angleItem).describe("Los 6 ángulos, uno por elemento."),
  combinations: z
    .array(z.object({ primary: z.enum(SALES_ANGLES), secondary: z.enum(SALES_ANGLES), how: text }))
    .describe("Las 3 combinaciones principal + secundario con más sentido, la mejor primero. how: qué dice el gancho y cómo lo remata el secundario, en una o dos frases."),
  aida_emphasis: text.describe("Qué etapa AIDA necesita más espacio con este nivel de consciencia, y por qué."),
  missing_inputs: z.array(text).describe("Hasta 3 datos que subirían la precisión, cada uno con qué ángulo mejoraría («Una fecha comercial real: subiría Oferta»). Sin reseñas ni expertos."),
  compliance_flags: z.array(text),
});

export type AngleRouterOutput = z.infer<typeof angleRouterSchema>;

/** La evaluación de un ángulo, con los criterios por nombre (lo que usa lib/angles/score.ts). */
export interface AngleEvaluation {
  criteria: Record<string, number>;
  penalty_applies: boolean;
  why: string;
  risks: string[];
}
export type AngleEvaluations = Record<SalesAngle, AngleEvaluation>;

/** De la lista del modelo a un mapa por ángulo. Un ángulo que falte cuenta como 0 en todo. */
export function evaluationsFrom(output: Pick<AngleRouterOutput, "angles">): AngleEvaluations {
  return Object.fromEntries(
    SALES_ANGLES.map((a) => {
      const item = output.angles.find((x) => x.angle === a);
      const criteria = Object.fromEntries(ANGLES[a].criteria.map((c, i) => [c.key, item?.scores[i] ?? 0]));
      return [a, { criteria, penalty_applies: item?.penalty ?? false, why: item?.why ?? "", risks: item?.risks ?? [] }];
    }),
  ) as AngleEvaluations;
}

// ---------------------------------------------------------------- Agentes de ángulo

export const AIDA_STAGES = ["attention", "interest", "desire", "action"] as const;
export type AidaStage = (typeof AIDA_STAGES)[number];

// Compactos por la misma razón que el orquestador: lo que no se muestra ni se valida va como texto.
const hook = z.object({
  text: text.describe("El gancho tal como se dice o se lee, en el idioma del mercado y con tuteo."),
  visual_first_3s: text.describe("Qué se ve en los primeros 3 segundos."),
  policy_ok: z.boolean().describe("false si roza la política de atributos personales de Meta."),
});

const briefBase = {
  go: z.boolean().describe("false si este ángulo no se puede sostener con lo que hay (explica por qué en fit_reason)."),
  fit_reason: text,
  psychological_lever: text.describe("Qué palanca concreta usas y por qué."),
  core_message: text.describe("El mensaje central en una frase."),
  hooks: z.array(hook).describe("10 ganchos de al menos 3 tipos."),
  recommended_hook: z.number().int().describe("Índice (desde 0) del gancho que abrirías hoy."),
  aida_summary: z
    .object({ attention: text, interest: text, desire: text, action: text })
    .describe("Una frase por etapa: qué hace el anuncio en cada una (lo que ve el comerciante)."),
  body_beats: z.array(text).describe("Los beats del cuerpo en orden, cada uno empezando por su etapa: «Interés: …»."),
  aida_emphasis: text.describe("Qué etapa pesa más para este producto según su nivel de consciencia, y por qué."),
  proof_to_show: z.array(text).describe("Solo pruebas reales de la ficha."),
  objection_handling: z.array(z.object({ objection: text, answer: text })).describe("3 a 5, incluida al menos una del pago contra entrega o de comprar online."),
  offer_layer: text.describe("La oferta en una línea, con los números de PRECIO Y OFERTA y el cierre del mercado («Paga al recibir»)."),
  visual_concepts: z.array(text).describe("3 conceptos: «formato: qué se ve (referencia)»."),
  static_ad_concepts: z.array(text).describe("2 estáticos (3 en Oferta): «titular | imagen | texto»."),
  landing: text.describe("Qué página de producto recomiendas para este ángulo."),
  compliance_flags: z.array(text),
  missing_inputs: z.array(text),
  handoff_to_ugc: text.describe("Para el guionista: vocero, tono y lo que se debe evitar."),
};

// Lo propio de cada ángulo, en pocas claves de texto.
const DETAILS: Record<SalesAngle, z.ZodType> = {
  authority: z.object({
    expert: text.describe("El experto real de la ficha o el perfil a contratar (nunca una identidad inventada), su credencial y dónde se graba."),
    expert_is_real: z.boolean(),
    why_they_use_it: text,
  }),
  common_enemy: z.object({ enemy: text.describe("Práctica, categoría o creencia; nunca una marca."), why_it_fails: text, factual_basis: text }),
  unique_mechanism: z.object({ assumed_cause: text, real_cause: text, one_line: text, metaphor: text, factual_basis: text }),
  age_identity: z.object({ segment: text.describe("El grupo y cómo se nombra a sí mismo."), trigger_moment: text, other_segments: z.array(text) }),
  personal_story: z.object({
    story_is_real: z.boolean().describe("true solo si sale de reseñas reales de la ficha."),
    story: text.describe("Protagonista, peor momento, escalada, giro y resolución, en pocas frases."),
    interview_questions: z.array(text),
  }),
  offer: z.object({
    as_layer: z.boolean().describe("true si la oferta va como capa de otro ángulo."),
    structure: text.describe("Uno de los packs de PRECIO Y OFERTA y por qué."),
    anchor: text,
    urgency: maybe.describe("Plazo real o null."),
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
