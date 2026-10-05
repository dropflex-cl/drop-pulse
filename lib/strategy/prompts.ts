// El prompt de la extracción (paso strategy_extract): pasa a datos el informe que escribió el mega prompt.
// Vive en el código (no en prompt_templates) porque está atado al esquema de salida: es pegamento, no
// estrategia. No mejora ni reescribe el informe: copia, y deriva solo lo que falta. Puro.

import { PACK_LABEL_RULES } from "@/lib/ai/prompts";
import { pricingBlock } from "@/lib/pricing/prompt";
import type { PricingPlan } from "@/lib/pricing/plan";
import { STRATEGY_ANGLES } from "./catalog";

/** Sube cuando cambie este prompt o el esquema de la extracción (lib/strategy/schemas.ts). */
export const STRATEGY_EXTRACT_PROMPT_VERSION = 1;

export const STRATEGY_EXTRACT_SYSTEM = [
  "Lees un informe de estrategia de ventas que ya escribió un experto (análisis, clientes, hooks, ángulos, conceptos UGC, AIDA, objeciones, ofertas y plan de test) y pasas a datos lo que usan los pasos siguientes: las imágenes y la página del producto, los anuncios y los guiones de video.",
  "",
  "- Copias del informe: no mejoras, no reescribes y no agregas ideas. Si un campo no está tal cual, lo armas con lo más cercano que sí dice el informe sobre ese ángulo o ese cliente.",
  "- Nunca agregas promesas, cifras, testimonios, garantías ni descuentos que el informe y PRECIO Y OFERTA no traigan. Los montos, exactos de PRECIO Y OFERTA.",
  `- angles: los ${STRATEGY_ANGLES} del TOP 5 ÁNGULOS de la priorización, en su orden. Cada uno con su detalle de los ángulos de venta, su AIDA (las estructuras AIDA si las tiene), las objeciones que más le tocan, la oferta y los conceptos UGC que le corresponden.`,
  "- hooks de cada ángulo: el del ángulo primero y después los de la lista de hooks que mejor le sirven (priorizando el TOP 5 HOOKS), cada uno tal cual. Lo que se ve en los primeros segundos sale de la escena de apertura de su concepto UGC.",
  "- avatar: el cliente número 1 del TOP 3 CLIENTES, en frases cortas, sin escenas ni frases textuales.",
  "- brief: los hechos del producto salen de DATOS DEL PRODUCTO; el problema, las alternativas, el diferenciador, las objeciones y las restricciones, del informe.",
  "- Escribes en el idioma del informe, con tuteo.",
  "",
  ...PACK_LABEL_RULES,
].join("\n");

export interface StrategyExtractInput {
  name: string;
  description: string;
  pricing: PricingPlan;
  report: string;
}

/** Lo fijo (los datos y el informe): va con punto de caché, el reintento lo lee. */
export function strategyExtractContext(c: StrategyExtractInput): string {
  return ["DATOS DEL PRODUCTO", `Producto: ${c.name}`, c.description, "", pricingBlock(c.pricing), "", "EL INFORME", "<informe>", c.report, "</informe>"].join("\n");
}

export type ExtractPart = "profile" | "angles";

const ASK: Record<ExtractPart, string> = {
  profile: "Pasa a datos el producto (brief), el cliente número 1 (avatar), las etiquetas de los packs y los 3 conceptos del primer dólar.",
  angles: `Pasa a datos los ${STRATEGY_ANGLES} ángulos del TOP 5 ÁNGULOS, con sus hooks.`,
};

/** La pregunta de cada parte y, en un reintento, lo que estuvo mal. */
export function strategyExtractTail(part: ExtractPart, retry: string[] = []): string {
  return [...(retry.length ? [`Tu respuesta anterior tenía estos problemas: ${retry.join(" ")} Corrígelos y responde completa.`, ""] : []), ASK[part]].join("\n");
}
