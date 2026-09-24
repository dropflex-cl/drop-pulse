// Esquemas del director de galería y del QA de las imágenes de la página (docs/spec-imagenes.md).
// Puro y testeado: la validación en código es lo que el modelo no puede saltarse.

import * as z from "zod/v4";
import { HEADLINE_MAX_WORDS, ROLE_LIMITS, TEXT_ROLES, type TextRole } from "@/lib/creatives/catalog";
import { GALLERY_SHOTS, SHOT_TYPES } from "./catalog";

/** Sube cuando cambia el prompt del director (queda en page_image_runs.prompt_version). */
export const PAGE_IMAGES_PROMPT_VERSION = 1;

const art = z.object({
  palette: z.string().describe("En inglés: 2 a 4 colores con nombre; la escena sale del color del producto y los textos van en un acento profundo del mismo tono."),
  typography: z.string().describe("En inglés: el carácter de la tipografía (p. ej., heavy rounded sans for the headline, clean sans for badges)."),
  mood: z.string().describe("En inglés: 3 a 6 palabras."),
});

const text = z.object({
  role: z.enum(TEXT_ROLES),
  text: z.string().describe("Exactamente como va en la imagen, en el idioma del mercado."),
  placement: z.string().describe("En inglés: posición, líneas, peso, color y contenedor (solid pill with a line icon, round stamp, card, table cell)."),
  points_to: z.string().nullable().describe("Solo callouts: la parte concreta y VISIBLE del producto a la que llega su línea (en inglés); null en los demás."),
});

const shot = z.object({
  slot: z.enum(["cover", "gallery", "benefit"]),
  benefit: z.number().int().nullable().describe("Solo slot benefit: el número del beneficio (1, 2…) de TEXTOS DE LA PÁGINA. null en los demás."),
  type: z.enum(SHOT_TYPES),
  name: z.string().describe("Nombre corto para el comerciante, en el idioma del mercado."),
  look: z.string().describe("Una frase para el comerciante: cómo se verá la imagen. En el idioma del mercado."),
  art,
  scene: z.string().describe("En inglés, 30 a 70 palabras: fondo, superficie, props (solo de props_allowed, descritos con precisión), luz, elementos en movimiento."),
  layout: z.string().describe("En inglés, 20 a 50 palabras: dónde va el producto, cuánto del cuadro ocupa, zonas para el texto."),
  product_units: z.number().int().min(1).max(3),
  kit_parts: z.array(z.string()).describe("Partes del kit que aparecen, escritas igual que en kit. [] si ninguna."),
  hands: z.boolean().describe("true si se ven manos o la parte del cuerpo donde se usa (nunca una cara)."),
  texts: z.array(text).describe("[] en las tomas sin texto."),
});

export const pagePlanSchema = z.object({
  product_look: z.string().describe("En inglés, ≤ 20 palabras: cómo se ve el producto principal en la IMAGEN BASE (tipo, color, material, detalles). Sin textos de la caja."),
  kit: z.array(z.string()).describe("En inglés: todo lo demás que aparece en la IMAGEN BASE (caja, repuestos, cables, accesorios)."),
  brand_art: art.describe("La línea visual común de toda la galería."),
  props_allowed: z.array(z.string()).describe("En inglés: props de ambiente que refuerzan la sensación del producto sin prometer nada, cada uno descrito con precisión visual."),
  props_forbidden: z.array(z.string()).describe("En inglés: props tentadores pero engañosos, cada uno con el motivo entre paréntesis."),
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
  /** El beneficio que acompaña (texto aprobado en Textos), para la pantalla. */
  pairs?: string;
};

/** Roles que pueden ir en 2 líneas (separadas por «\n»): el titular, y el badge o callout con su línea fina. */
export const TWO_LINES = new Set<string>(["headline", "badge", "callout"]);

/** Precios, montos y ofertas: cambian y la página ya los muestra. Una imagen con eso queda mintiendo. */
const OFFER = /\$|US\$|\d+\s?%|\bgratis\b|\bregalo\b|\bdescuento\b|\boferta\b|\b\d\s?x\s?\d\b|\blleva\s+\d|\bpaga\s+\d/i;

/** Lo que el modelo puede hacer mal y el código puede revisar. Frases para devolverle al director. */
export function planProblems(p: PagePlan, benefits: number): string[] {
  const out: string[] = [];
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
    if (s.slot === "cover" && s.texts.length) out.push(`${tag}: la portada va sin textos.`);
    if (s.type === "hero_mood" && s.texts.length) out.push(`${tag}: hero_mood va sin textos.`);
    const max = s.type === "comparison" ? 7 : 5;
    if (s.texts.length > max) out.push(`${tag} trae ${s.texts.length} textos; máximo ${max}.`);
    if (s.texts.length && s.texts.filter((t) => t.role === "headline").length !== 1) out.push(`${tag} necesita exactamente un headline.`);
    for (const t of s.texts) {
      const lim = ROLE_LIMITS[t.role as TextRole];
      const lines = t.text.split("\n").map((l) => l.trim());
      const words = t.text.trim().split(/\s+/).length;
      if (!t.text.trim() || lines.some((l) => !l)) out.push(`${tag} trae un texto vacío.`);
      if (lines.length > (TWO_LINES.has(t.role) ? 2 : 1)) out.push(`${tag}: «${lines.join(" / ")}» tiene ${lines.length} líneas; ${TWO_LINES.has(t.role) ? "máximo 2" : "va en una"}.`);
      const long = t.role === "headline" ? (lines.join(" ").length > lim ? lines.join(" ") : null) : lines.find((l) => l.length > lim);
      if (long) out.push(`${tag}: «${long}» pasa de ${lim} caracteres (${t.role}).`);
      if (t.role === "headline" && words > HEADLINE_MAX_WORDS) out.push(`${tag}: el headline «${t.text}» pasa de ${HEADLINE_MAX_WORDS} palabras.`);
      if (t.role === "headline" && /^[¿¡«"]?\p{Ll}/u.test(t.text.trim())) out.push(`${tag}: el headline «${t.text}» empieza con minúscula; va con mayúscula inicial.`);
      if (OFFER.test(t.text)) out.push(`${tag}: «${t.text}» trae un precio, un descuento o una oferta.`);
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
