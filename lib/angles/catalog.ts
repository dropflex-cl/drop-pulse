// Los 6 ángulos de venta del orquestador (agentes-creativos/angle-router.md) y cómo se puntúan: los
// criterios con su peso y la penalización fuerte de cada uno. Puro: lo usan el prompt del orquestador,
// el cálculo del puntaje (score.ts), la pantalla y los tests.

export const SALES_ANGLES = ["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"] as const;
export type SalesAngle = (typeof SALES_ANGLES)[number];

export type AngleRole = "primary" | "secondary";

export interface Criterion {
  key: string;
  /** Rótulo del desglose (“Cómo se calculó”). */
  label: string;
  weight: number;
  /** Qué significa 0 y 5, para el prompt del orquestador. */
  guide: string;
  /** Lo decide el sistema con un dato de la ficha, no el modelo (no va en el prompt ni en scores). */
  bySystem?: boolean;
}

export interface AnglePenalty {
  key: string;
  /** El riesgo en palabras del comerciante. */
  label: string;
  points: number;
  /** Cuándo aplica, para el prompt del orquestador. */
  when: string;
}

export interface AngleDef {
  key: SalesAngle;
  /** Nombre en la pantalla. */
  name: string;
  /** Qué hace, en una línea (prompt y pantalla). */
  gist: string;
  criteria: Criterion[];
  penalty: AnglePenalty;
}

export const ANGLES: Record<SalesAngle, AngleDef> = {
  authority: {
    key: "authority",
    name: "Autoridad (experto)",
    gist: "Un profesional real explica el problema y usa el producto él mismo.",
    criteria: [
      { key: "professional_domain", label: "Problema de un profesional reconocible", weight: 3, guide: "5: el problema es terreno claro de un kinesiólogo, dentista, dermatólogo, veterinario…; 0: nada que ver con un oficio." },
      { key: "expert_would_use", label: "Es lo que el experto usaría", weight: 2, guide: "5: se ve natural en su consulta o su casa; 0: moda, estatus o impulso." },
      { key: "real_expert", label: "Hay un experto real", weight: 3, guide: "5: la ficha nombra un experto real con credencial que acepta aparecer; 0: no hay." },
    ],
    penalty: { key: "no_real_expert", label: "No hay experto real", points: 40, when: "No hay un experto real (no se inventa)." },
  },
  common_enemy: {
    key: "common_enemy",
    name: "Enemigo común",
    gist: "Lo que la industria no te dice: no es tu culpa, te vendieron lo incorrecto.",
    criteria: [
      { key: "failed_popular_solution", label: "Hay una solución popular que falló", weight: 3, guide: "5: el cliente ya probó algo masivo que falla o tiene un costo oculto; 0: no probó nada." },
      { key: "high_sophistication", label: "El comprador ya vio muchas promesas", weight: 2, guide: "Lo calcula el sistema con la sofisticación del cliente ideal." },
      { key: "attackable_practice", label: "Se ataca una práctica, no una marca", weight: 2, guide: "5: el enemigo es una práctica, categoría o creencia; 0: solo se podría atacar a una marca." },
    ],
    penalty: { key: "only_brand_target", label: "Solo se podría atacar a una marca", points: 25, when: "La única forma de oponerse es nombrar a una marca concreta." },
  },
  unique_mechanism: {
    key: "unique_mechanism",
    name: "Mecanismo único",
    gist: "La causa real es otra: el producto es la pieza que faltaba.",
    criteria: [
      { key: "one_line_principle", label: "Se explica en una frase", weight: 3, guide: "5: tiene un principio físico o técnico real explicable en una frase; 0: genérico, sin diferencia técnica." },
      { key: "alternatives_wrong_cause", label: "Las alternativas atacan otra causa", weight: 3, guide: "5: lo que usa hoy falla por atacar otra causa o por diseño; 0: no hay contraste." },
      { key: "visualizable", label: "Se puede mostrar en un diagrama", weight: 2, guide: "5: el mecanismo se dibuja o anima fácil; 0: invisible e inexplicable." },
    ],
    penalty: { key: "unsupported_medical", label: "Exige promesas de salud sin respaldo", points: 30, when: "Explicar el mecanismo obliga a afirmaciones médicas que no se pueden sustentar." },
  },
  age_identity: {
    key: "age_identity",
    name: "Edad e identidad",
    gist: "Segmenta en el gancho por etapa de vida o rol: la gente como yo usa esto.",
    criteria: [
      { key: "life_stage_problem", label: "Problema típico de una etapa o rol", weight: 3, guide: "5: aparece o empeora en una etapa (40+, posparto) o un rol (turnos largos, dueños de perro); 0: universal." },
      { key: "recognizable_audience", label: "Audiencia estrecha que se reconoce", weight: 2, guide: "5: se reconoce en una línea; 0: no hay grupo dominante." },
      { key: "peer_spokesperson", label: "El vocero puede ser uno de ellos", weight: 2, guide: "5: se consigue un vocero del grupo; 0: imposible." },
    ],
    penalty: { key: "second_person_only", label: "Solo funciona en segunda persona (Meta lo rechaza)", points: 20, when: "Solo se puede decir afirmando un atributo del espectador («¿Tienes más de 40 y…?»)." },
  },
  personal_story: {
    key: "personal_story",
    name: "Historia personal",
    gist: "Un relato real en primera persona, con detalles concretos y un momento detonante.",
    criteria: [
      { key: "narrative_reviews", label: "Hay reseñas reales con historia", weight: 3, guide: "5: reseñas reales con un antes, un momento y un después; 0: no hay reseñas reales." },
      { key: "emotional_trigger", label: "El problema tiene carga emocional", weight: 2, guide: "5: hay un evento detonante o vergüenza social; 0: problema trivial." },
      { key: "medium_consideration", label: "Compra que necesita convencer", weight: 1, guide: "5: consideración media, el comprador duda; 0: impulso barato." },
    ],
    penalty: { key: "no_real_testimonials", label: "No hay testimonios reales", points: 40, when: "No hay testimonios reales (no se inventan historias)." },
  },
  offer: {
    key: "offer",
    name: "Oferta",
    gist: "El pack es el mensaje: lleva más, paga menos por unidad, sin riesgo.",
    criteria: [
      { key: "low_ticket_bundle", label: "Precio bajo para su mercado y pack posible", weight: 3, guide: "5: ticket bajo para el país y el pack gana más que 1 unidad; 0: ticket alto sin pack." },
      { key: "impulse_or_consumable", label: "Impulso, consumible o con variantes", weight: 2, guide: "5: se compra por impulso, se gasta o se regala; 0: compra única y meditada." },
      { key: "obvious_result", label: "Se entiende sin explicación", weight: 2, guide: "5: se entiende en 1 segundo; 0: necesita educar." },
      { key: "real_event", label: "Hay una fecha comercial real", weight: 1, guide: "5: la ficha menciona una fecha real (CyberDay, Día de la Madre); 0: no hay.", bySystem: true },
    ],
    penalty: { key: "thin_margin", label: "El margen no alcanza para empujar el pack", points: 20, when: "Ningún pack gana más que 1 unidad o la ganancia no aguanta el descuento." },
  },
};

export const angleName = (a: SalesAngle) => ANGLES[a].name;

/** Los criterios que puntúa el modelo, en el orden de scores. */
export const modelCriteria = (a: SalesAngle) => ANGLES[a].criteria.filter((c) => !c.bySystem);

export const ROLE_LABEL: Record<AngleRole, string> = { primary: "principal", secondary: "secundario" };
