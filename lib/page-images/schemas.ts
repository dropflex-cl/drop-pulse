// Esquemas del director de galería y del QA de las imágenes de la página (docs/spec-imagenes.md).
// Puro y testeado: la validación en código es lo que el modelo no puede saltarse.

import * as z from "zod/v4";
import { TEXT_ROLES } from "@/lib/creatives/catalog";
import { BENEFIT_SHOTS, GALLERY_SHOTS, SHOT_TYPES, VISUAL_WORLDS, type VisualWorld } from "./catalog";

/**
 * Sube cuando cambia el prompt del director (queda en page_image_runs.prompt_version). 3: el prompt pide
 * los largos con margen (ROLE_PROMPT_LIMITS); la validación sigue en ROLE_LIMITS. 4: el director elige
 * el mundo visual (`visual_world`) en vez de una receta fija, y cada ángulo tiene su beneficio, con el
 * formato de su forma. 5: el contexto corto de lib/ai/context.ts (sin la ficha ni el cliente ideal en JSON),
 * los largos por rol en la descripción de cada texto y el «\\n» literal que el código convierte en salto
 * de línea (normalizePlan). 6: imágenes para COD con texto comercial también en portada y ambiente,
 * sin prohibiciones de precio/oferta ni límites editoriales de texto heredados de anuncios.
 */
export const PAGE_IMAGES_PROMPT_VERSION = 6;

const art = z.object({
  palette: z.string().describe("En inglés: 2 a 4 colores con nombre, los del mundo visual elegido; el producto contrasta con el fondo y los textos van en un acento que se lee."),
  typography: z.string().describe("En inglés: el carácter de la tipografía (p. ej., heavy rounded sans for the headline, clean sans for badges)."),
  mood: z.string().describe("En inglés: 3 a 6 palabras."),
});

const text = z.object({
  role: z.enum(TEXT_ROLES),
  text: z.string().describe("Exactamente como va en la imagen, en el idioma del mercado. Puede incluir precios, packs, descuentos y condiciones reales de pago contra entrega, envío y garantía del contexto vigente. Usa los saltos de línea que necesite la composición."),
  placement: z.string().describe("En inglés: posición, líneas, peso, color y contenedor (solid pill with a line icon, round stamp, card, table cell)."),
  points_to: z.string().nullable().describe("Solo callouts: la parte concreta y VISIBLE del producto a la que llega su línea (en inglés); null en los demás."),
});

const shot = z.object({
  slot: z.enum(["cover", "gallery", "benefit"]),
  benefit: z.number().int().nullable().describe("Solo slot benefit: el número del beneficio (1, 2…) de benefits. null en los demás."),
  type: z.enum(SHOT_TYPES),
  name: z.string().describe("Nombre corto para el comerciante, en el idioma del mercado."),
  look: z.string().describe("Una frase para el comerciante: cómo se verá la imagen. En el idioma del mercado."),
  art,
  scene: z.string().describe("En inglés, 30 a 70 palabras: fondo, superficie, props (solo de props_allowed, descritos con precisión), luz, elementos en movimiento."),
  layout: z.string().describe("En inglés, 20 a 50 palabras: dónde va el producto, cuánto del cuadro ocupa, zonas para el texto."),
  product_units: z.number().int().min(1).max(3),
  kit_parts: z.array(z.string()).describe("Partes del kit que aparecen, escritas igual que en kit. [] si ninguna."),
  hands: z.boolean().describe("true si se ven manos o la parte del cuerpo donde se usa (nunca una cara)."),
  texts: z.array(text).describe("Textos elegidos para la toma, también en portada y ambiente. [] solo cuando se elija una toma sin texto."),
});

export const pagePlanSchema = z.object({
  product_look: z.string().describe("En inglés, ≤ 20 palabras: cómo se ve el producto principal en la IMAGEN BASE (tipo, color, material, detalles). Sin textos de la caja."),
  kit: z.array(z.string()).describe("En inglés: todo lo demás que aparece en la IMAGEN BASE (caja, repuestos, cables, accesorios)."),
  visual_world: z.enum(VISUAL_WORLDS).describe("El mundo visual de toda la galería, elegido para este producto (ver MUNDOS VISUALES)."),
  visual_world_why: z.string().describe("Por qué ese mundo, en una frase para el comerciante, en el idioma del mercado: quién compra, dónde se usa y qué piden los ángulos."),
  brand_art: art.describe("La línea visual común de toda la galería, dentro del mundo elegido."),
  props_allowed: z.array(z.string()).describe("En inglés: props de ambiente que refuerzan la sensación del producto sin prometer nada, cada uno descrito con precisión visual."),
  props_forbidden: z.array(z.string()).describe("En inglés: props tentadores pero engañosos, cada uno con el motivo entre paréntesis."),
  benefits: z
    .array(
      z.object({
        text: z.string().describe("El beneficio en una frase, en el idioma del mercado, con un dato de la FICHA que lo sostiene."),
        angle: z.number().int().nullable().describe("El número del ángulo (1, 2 o 3) que este beneficio prueba; null en el que sobra cuando hay menos ángulos que beneficios."),
      }),
    )
    .describe(`Exactamente ${BENEFIT_SHOTS} beneficios distintos del producto, uno por cada ángulo en su orden y, si sobra, el que más vende del diferenciador.`),
  shots: z.array(shot),
});

export type PagePlan = z.infer<typeof pagePlanSchema>;
export type PlanShot = PagePlan["shots"][number];
export type ShotText = PlanShot["texts"][number];

/** Lo que se guarda de una toma: la del director más lo común de la corrida que el render necesita. */
export type StoredShot = PlanShot & {
  product_look: string;
  kit: string[];
  props_forbidden: string[];
  /** El beneficio que prueba la toma (benefits del director), para la pantalla y la página. */
  pairs?: string;
  /** El mundo visual de la corrida (desde la versión 4; antes, la receta de estudio de color). */
  world?: VisualWorld;
  /** El ángulo que prueba un beneficio (1, 2 o 3). */
  angle?: number | null;
};

/**
 * El ángulo de cada beneficio, en orden: uno por ángulo aprobado (del 1 al 3) y null en los que sobran
 * (van al diferenciador). Con más ángulos que beneficios, los últimos se quedan sin el suyo.
 */
export function benefitAngles(angles: number[], benefits: number = BENEFIT_SHOTS): (number | null)[] {
  const slots = [...new Set(angles)].sort((a, b) => a - b);
  return Array.from({ length: benefits }, (_, i) => slots[i] ?? null);
}

/**
 * Lo que es regla lo arregla el código: el modelo escribe a veces el salto de línea de un badge o un
 * callout como «\\n» literal (dos caracteres; caso de producción del 2026-10-03).
 * Se convierte en un salto de línea de verdad para el render y el QA.
 */
export function normalizePlan(p: PagePlan): PagePlan {
  return { ...p, shots: p.shots.map((s) => ({ ...s, texts: s.texts.map((t) => ({ ...t, text: t.text.replace(/\\n/g, "\n") })) })) };
}

/**
 * Lo que el modelo puede hacer mal y el código puede revisar. Frases para devolverle al director.
 * `angles`: los números de los ángulos aprobados; cada uno necesita su beneficio, en orden.
 */
export function planProblems(p: PagePlan, benefits: number = BENEFIT_SHOTS, angles: number[] = []): string[] {
  const out: string[] = [];
  if (p.benefits.length !== benefits) out.push(`Debe haber ${benefits} benefits; hay ${p.benefits.length}.`);
  if (!p.visual_world_why.trim()) out.push("Falta visual_world_why: por qué ese mundo visual.");
  benefitAngles(angles, benefits).forEach((angle, i) => {
    const got = p.benefits[i]?.angle ?? null;
    if (p.benefits[i] && got !== angle) out.push(angle ? `El beneficio ${i + 1} es el del ángulo ${angle} (angle: ${angle}); trae ${got ?? "null"}.` : `El beneficio ${i + 1} no es de un ángulo (angle: null); trae ${got}.`);
  });
  p.benefits.forEach((b, i) => {
    if (!b.text.trim()) out.push(`El beneficio ${i + 1} está vacío.`);
  });
  const by = (s: PlanShot["slot"]) => p.shots.filter((x) => x.slot === s);
  if (by("cover").length !== 1) out.push(`Debe haber 1 cover; hay ${by("cover").length}.`);
  if (by("gallery").length !== GALLERY_SHOTS) out.push(`Debe haber ${GALLERY_SHOTS} gallery; hay ${by("gallery").length}.`);
  const numbers = by("benefit").map((s) => s.benefit);
  for (let i = 1; i <= benefits; i++) {
    const n = numbers.filter((b) => b === i).length;
    if (n !== 1) out.push(n ? `El beneficio ${i} tiene ${n} tomas; debe tener 1.` : `Falta la toma del beneficio ${i}.`);
  }
  if (numbers.some((b) => b == null || b < 1 || b > benefits)) out.push(`Cada benefit lleva su número, de 1 a ${benefits}.`);
  const kit = new Set(p.kit);
  p.shots.forEach((s, i) => {
    const tag = `La toma ${i + 1} («${s.name}», ${s.slot}/${s.type})`;
    for (const t of s.texts) {
      if (!t.text.trim()) out.push(`${tag} trae un texto vacío.`);
      if (t.points_to && t.role !== "callout") out.push(`${tag}: points_to solo va en callouts.`);
    }
    for (const k of s.kit_parts) if (!kit.has(k)) out.push(`${tag}: kit_parts «${k}» no está en kit.`);
  });
  return out;
}

// ---------------------------------------------------------------- QA

export const pageQaSchema = z.object({
  product_matches: z.boolean().describe("true si el producto es el mismo de la foto real: forma, colores, logo y etiqueta."),
  product_issue: z.string().nullable().describe("Qué cambió del producto, en una frase para el comerciante. null si nada."),
  texts: z
    .array(z.object({ expected: z.string(), status: z.enum(["exact", "typo", "missing"]), found: z.string().nullable() }))
    .describe("Uno por cada texto pedido, en el mismo orden. exact: escrito igual, con tildes y signos."),
  extra_texts: z.array(z.string()).describe("Textos de la imagen que no se pidieron. Lo impreso en el producto cuenta como extra si NO está en la foto real."),
  language_ok: z.boolean().describe("false si algún texto pedido quedó traducido a otro idioma."),
  mismatches: z.array(z.string()).describe("Textos pedidos que la imagen contradice (nombra algo que no se ve o se ve otra cosa). [] si ninguno."),
  misleading_props: z.array(z.string()).describe("Objetos que un comprador leería como ingrediente, sabor, accesorio incluido o función que la ficha no dice. [] si ninguno."),
  units_consistent: z.boolean().describe("false si hay varias unidades del producto y no son idénticas (tamaño, forma, color)."),
  anatomy_ok: z.boolean().describe("false si hay manos, dedos o pies deformes."),
});
export type PageQaOutput = z.infer<typeof pageQaSchema>;

export interface PageQaResult extends PageQaOutput {
  pass: boolean;
  /** Los motivos, en español para la pantalla. */
  issues: string[];
}

export function pageQaVerdict(out: PageQaOutput): PageQaResult {
  const issues: string[] = [];
  if (!out.product_matches) issues.push(out.product_issue?.trim() || "El producto no se ve igual a tu foto.");
  if (!out.language_ok) issues.push("Tradujo algún texto a otro idioma.");
  for (const t of out.texts) {
    if (t.status === "missing") issues.push(`Falta «${t.expected}».`);
    else if (t.status === "typo") issues.push(`«${t.expected}» quedó como «${t.found ?? "?"}».`);
  }
  if (out.extra_texts.length) issues.push(`Agregó ${out.extra_texts.map((t) => `«${t}»`).join(", ")}.`);
  issues.push(...out.mismatches.map((m) => m.trim()).filter(Boolean));
  issues.push(...out.misleading_props.map((m) => `Prop que confunde: ${m.trim()}`).filter((m) => m.length > 20));
  if (!out.units_consistent) issues.push("Las unidades del producto no son iguales entre sí.");
  if (!out.anatomy_ok) issues.push("Manos o pies deformes.");
  return { ...out, pass: issues.length === 0, issues };
}
