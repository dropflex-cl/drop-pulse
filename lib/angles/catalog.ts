// Las 6 formas de contar un ángulo de venta (agentes-creativos/angle-router.md). Desde
// docs/spec-angulos-testeo.md un ÁNGULO es el mensaje (qué dolor o deseo, para quién, con qué gancho
// y qué promesa) y estas 6 son su FORMA (`frame`): eligen qué especialista lo desarrolla, no limitan
// qué ángulos se proponen (§4.2, orquestador v7). El comerciante testea 2 o 3 ángulos separados, uno
// por conjunto de anuncios. Puro: lo usan los prompts, la pantalla y los tests.

export const SALES_ANGLES = ["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"] as const;
export type SalesAngle = (typeof SALES_ANGLES)[number];

/** Posición de un ángulo de testeo (1, 2 o 3): un conjunto de anuncios por ángulo. */
export type AngleSlot = 1 | 2 | 3;
export const ANGLE_SLOTS: AngleSlot[] = [1, 2, 3];
/** Ángulos que se testean a la vez (la mentoría: 3 en una misma campaña). Con 2 también funciona. */
export const TEST_ANGLES = 3;
export const MIN_TEST_ANGLES = 2;
/** Candidatos que propone el orquestador. */
export const ANGLE_CANDIDATES = 5;
/**
 * Palabras del gancho de un ángulo (la primera frase del anuncio). Fue 24 (la v7 escribía un párrafo
 * de escena) y 14 (cortaba «Si la tele de tu papá se escucha desde la calle, esto es para ustedes.»,
 * 15 palabras, el gancho que motivó la v9). La escena larga va en `aida.attention`.
 */
export const ANGLE_HOOK_MAX_WORDS = 18;
/** Palabras del título de un ángulo (el prompt pide 2 a 5; un título de 11 se cortaba en la pantalla). */
export const ANGLE_TITLE_MAX_WORDS = 6;

/** A quién le habla el ángulo: quien paga o quien usa el producto (a veces no son la misma persona). */
export const SPEAKS_TO = ["buyer", "user"] as const;
export type SpeaksTo = (typeof SPEAKS_TO)[number];

export interface AngleAida {
  attention: string;
  interest: string;
  desire: string;
  action: string;
}

/** Un ángulo de testeo elegido por el comerciante (angle_rankings.chosen_angles). */
export interface TestAngle {
  slot: AngleSlot;
  /** La forma con que se cuenta (una de las 6). */
  frame: SalesAngle;
  /** Nombre corto del ángulo («La crema sella»). Vacío en los elegidos antes de los ángulos de testeo. */
  title: string;
  pain_or_desire: string;
  segment: string;
  promise: string;
  /** El momento del cliente ideal que abre el anuncio y el bloque de dolor de la página. */
  trigger_moment: string;
  /** Qué hace la competencia con este ángulo. Vacío desde el orquestador v7 (no la escribe). */
  competition: string;
  /** La frase que abre el anuncio. Los ángulos de antes del orquestador v7 no la traen. */
  hook?: string;
  /** El anuncio en AIDA, una frase por etapa (lo que propuso el orquestador). */
  aida?: AngleAida;
  speaks_to?: SpeaksTo;
  /** El tono («humor cotidiano», «emocional»). */
  tone?: string;
  /** Por qué va a vender, según el orquestador. */
  why?: string;
  /**
   * Montos de mercado que usa el ángulo y que no son de PRECIO Y OFERTA («un audífono clínico cuesta
   * $400.000»): la pantalla los marca y, al confirmar el ángulo, el comerciante los da por verificados;
   * los ganchos de ese ángulo los pueden usar como ancla.
   */
  market_amounts?: number[];
}

export interface AngleDef {
  key: SalesAngle;
  /** Nombre en la pantalla. */
  name: string;
  /** Qué hace, en una línea (prompts y pantalla). */
  gist: string;
}

export const ANGLES: Record<SalesAngle, AngleDef> = {
  authority: { key: "authority", name: "Autoridad (experto)", gist: "Un profesional real explica el problema y usa el producto él mismo." },
  common_enemy: { key: "common_enemy", name: "Enemigo común", gist: "Lo que la industria no te dice: no es tu culpa, te vendieron lo incorrecto." },
  unique_mechanism: { key: "unique_mechanism", name: "Mecanismo único", gist: "La causa real es otra: el producto es la pieza que faltaba." },
  age_identity: { key: "age_identity", name: "Edad e identidad", gist: "Segmenta en el gancho por etapa de vida o rol: la gente como yo usa esto." },
  personal_story: { key: "personal_story", name: "Historia personal", gist: "Un relato real en primera persona, con detalles concretos y un momento detonante." },
  offer: { key: "offer", name: "Oferta", gist: "El pack es el mensaje: lleva más, paga menos por unidad, sin riesgo." },
};

export const angleName = (a: SalesAngle) => ANGLES[a].name;

/** El nombre que ve el comerciante: el título del ángulo o, en los antiguos, el de su forma. */
export const testAngleName = (a: Pick<TestAngle, "title" | "frame">) => a.title.trim() || ANGLES[a.frame].name;

/** «Ángulo 1 · La crema sella». */
export const slotLabel = (slot: number) => `Ángulo ${slot}`;
