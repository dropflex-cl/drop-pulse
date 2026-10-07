// Formas históricas que siguen identificando contenido guardado. No genera ángulos.
export const SALES_ANGLES = ["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"] as const;
export type SalesAngle = (typeof SALES_ANGLES)[number];

/** Slot operativo de campañas y videos conservados. */
export type AngleSlot = 1 | 2 | 3;

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
