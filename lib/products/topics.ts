// Temas que cubre el texto de Información base (ProductInfoInput › cobertura). Se detectan con reglas,
// sin llamar al modelo, para responder al instante en cada autoguardado. Puro y testeable.

export const TOPICS = ["Beneficios", "Medidas", "Materiales", "Qué incluye", "Modo de uso", "Garantía", "Para quién es"] as const;
export type Topic = (typeof TOPICS)[number];

const PATTERNS: Record<Topic, RegExp[]> = {
  Beneficios: [/\bbenefici/i, /\bayuda\b/i, /\bayuda a\b/i, /\bmejora/i, /\breduc/i, /\balivi/i, /\bevita/i, /\bpermite\b/i, /\bideal para\b/i, /\bsin (esfuerzo|dolor)\b/i],
  Medidas: [/\d+(?:[.,]\d+)?\s?(cm|mm|m|kg|g|gr|ml|l|lts?|pulgadas?|mah|w|v)\b/i, /\bmedidas?\b/i, /\btalla/i, /\bdimensi/i, /\btamaño\b/i, /\bpeso\b/i, /\bcapacidad\b/i],
  Materiales: [/\bmaterial/i, /\bneopreno\b/i, /\balgod[oó]n\b/i, /\bsilicona\b/i, /\bpl[aá]stico\b/i, /\bacero\b/i, /\baluminio\b/i, /\bmadera\b/i, /\bpoli[eé]ster\b/i, /\bnylon\b/i, /\bcuero\b/i, /\bvidrio\b/i, /\babs\b/i],
  "Qué incluye": [/\bincluye\b/i, /\bviene con\b/i, /\ben la caja\b/i, /\bcontenido del (paquete|empaque)\b/i, /\bkit\b/i, /\bunidades\b/i, /\bset de\b/i],
  "Modo de uso": [/\bmodo de uso\b/i, /\bc[oó]mo (se )?usa/i, /\bse usa\b/i, /\buso\b/i, /\bmin(utos)? al d[ií]a\b/i, /\bhoras al d[ií]a\b/i, /\bse coloca\b/i, /\binstrucciones\b/i, /\bpaso \d/i, /\bse carga\b/i],
  Garantía: [/\bgarant[ií]a/i, /\bdevoluci/i, /\breembolso\b/i, /\bcambio sin costo\b/i],
  "Para quién es": [/\bpara (quien|quienes|personas|mujeres|hombres|niñ|adult|mayores|mam[aá]s|pap[aá]s|mascotas|perros|gatos|deportistas|oficinistas)/i, /\brecomendado para\b/i, /\bideal si\b/i],
};

/** Temas presentes en el texto, en el orden de TOPICS. */
export function detectTopics(text: string): Topic[] {
  const t = text.normalize("NFC");
  return TOPICS.filter((topic) => PATTERNS[topic].some((re) => re.test(t)));
}
