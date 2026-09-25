// El formulario de edición de un componente, armado desde su esquema zod (el mismo que valida): la
// hoja de edición de la etapa Página del producto lo dibuja sin conocer cada componente. Puro.

import type * as z from "zod/v4";
import { toJSONSchema } from "zod/v4";
import { LISTING_FIELDS } from "./listing";

export type FormField =
  | { kind: "text"; key: string; label: string; hint?: string; min?: number; max?: number; optional: boolean; multiline: boolean }
  | { kind: "icon"; key: string; label: string; optional: boolean }
  | { kind: "choice"; key: string; label: string; options: { value: string; label: string }[]; optional: boolean; numeric?: boolean }
  | { kind: "review"; key: string; label: string; optional: boolean }
  | { kind: "cell"; key: string; label: string; options: { value: string; label: string }[]; max?: number }
  | { kind: "group"; key: string; label: string; fields: FormField[]; optional: boolean }
  | { kind: "list"; key: string; label: string; hint?: string; min: number; max: number; item: FormField; optional: boolean };

/** Nombres de los campos en la pantalla. Una clave nueva sin nombre se muestra tal cual (y el test avisa). */
export const FIELD_LABELS: Record<string, string> = {
  ...LISTING_FIELDS,
  heading: "Título",
  moments: "Momentos",
  slot: "Ángulo",
  bridge: "Remate",
  eyebrow: "Rótulo",
  heading_highlight: "Palabras en color",
  label: "Texto",
  items: "Elementos",
  icon: "Ícono",
  text: "Texto",
  policy: "Depende de",
  requires: "Depende de",
  available_text: "Disponible",
  limited_text: "Quedan pocas",
  sold_out_text: "Agotado",
  preorder_text: "Preventa",
  countdown_template: "Con cuenta regresiva",
  closed_template: "Sin cuenta regresiva",
  node_ordered_label: "Paso 1",
  node_ordered_sub: "Bajo el paso 1",
  node_shipped_label: "Paso 2",
  node_delivered_label: "Paso 3",
  node_delivered_sub_suffix: "Nota bajo la entrega",
  cards: "Tarjetas",
  title: "Título",
  body: "Texto",
  review_id: "Reseña",
  excerpt: "Extracto",
  excerpt_mode: "Cómo se citó",
  captions: "Textos de los videos",
  gifs: "Textos de los GIF",
  description: "Descripción",
  bullets: "Razones",
  cta_label: "Botón",
  rating_label: "Línea de calificación",
  stats: "Cifras",
  fact: "Dato",
  stories: "Historias",
  caption_line_1: "Línea 1",
  caption_line_2: "Línea 2",
  us_label: "Nuestra columna",
  other_labels: "Columnas de comparación",
  rows: "Filas",
  feature: "Atributo",
  us: "Nosotros",
  others: "Los demás",
  basis: "Lo respalda",
  footnote: "Nota al pie",
  social_proof_text: "Prueba social",
  question: "Pregunta",
  answer: "Respuesta",
  topic: "Tema",
  benefits: "Beneficios",
};

/** Nombres de los valores de los enums (políticas, temas, modos). Los íconos tienen su propio selector. */
export const CHOICE_LABELS: Record<string, string> = {
  cod: "Pago al recibir",
  free_shipping: "Envío gratis",
  returns: "Cambios y devoluciones",
  warranty: "Garantía",
  whatsapp: "WhatsApp",
  shipping_time: "Plazo de envío",
  delivery: "Plazo de entrega",
  none: "Nada (siempre se muestra)",
  verbatim: "Tal cual",
  condensed: "Acortada",
  translated: "Traducida",
  pago_cod: "Pago al recibir",
  envio: "Envío",
  uso: "Uso",
  talla_compat: "Talla o compatibilidad",
  cuidado: "Cuidado",
  diferencial: "Qué lo hace distinto",
  resultados: "Resultados",
  duracion: "Duración",
  garantia: "Garantía",
  otro: "Otro",
  rating: "Calificación",
  review_count: "Cantidad de reseñas",
  return_days: "Días para cambiarlo",
  warranty_months: "Meses de garantía",
  delivery_days_max: "Días de entrega",
  spec: "La ficha",
  policy: "Tus políticas",
  service: "Tu atención",
  yes: "Sí",
  no: "No",
  partial: "A medias",
};

type Def = { type: string; [k: string]: unknown };
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

/** El ejemplo de la descripción («Ej.: «…»») como ayuda; la descripción entera es para la IA. */
function exampleOf(description?: string): string | undefined {
  const m = description?.match(/Ej\.?:\s*(.+?)(\.|$)/);
  return m ? `Ej.: ${m[1].trim()}` : undefined;
}

function range(schema: z.ZodType): { min?: number; max?: number } {
  try {
    const js = toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, number | undefined>;
    return { min: js.minLength ?? js.minItems, max: js.maxLength ?? js.maxItems };
  } catch {
    return {};
  }
}

const choice = (values: string[]) => values.map((value) => ({ value, label: CHOICE_LABELS[value] ?? value }));

/** Los campos de un esquema de contenido (objeto zod), en su orden. */
export function formFields(schema: z.ZodType): FormField[] {
  const f = field("", "", schema, false);
  if (f.kind !== "group") throw new Error("form: el contenido de un componente es un objeto");
  return f.fields;
}

function field(key: string, label: string, schema: z.ZodType, optional: boolean, description = schema.description): FormField {
  const def = defOf(schema);
  switch (def.type) {
    case "optional":
    case "nullable": {
      const inner = def.innerType as z.ZodType;
      return field(key, label, inner, true, description ?? inner.description);
    }
    case "pipe": {
      const out = def.out as z.ZodType;
      return field(key, label, out, optional, description ?? out.description ?? (def.in as z.ZodType).description);
    }
    case "object": {
      const shape = def.shape as Record<string, z.ZodType>;
      return { kind: "group", key, label, optional, fields: Object.entries(shape).map(([k, v]) => field(k, FIELD_LABELS[k] ?? k, v, false)) };
    }
    case "array": {
      const { min = 0, max = 10 } = range(schema);
      return { kind: "list", key, label, hint: exampleOf(description), min, max, optional, item: field("", label, def.element as z.ZodType, false) };
    }
    case "union": {
      // La celda de la comparativa: un valor fijo o un texto corto.
      const options = def.options as z.ZodType[];
      const values = options.flatMap((o) => (defOf(o).type === "enum" ? ((o as z.ZodEnum).options as string[]) : []));
      const text = options.find((o) => defOf(o).type === "object");
      const inner = text ? (defOf(text).shape as Record<string, z.ZodType>).text : undefined;
      return { kind: "cell", key, label, options: choice(values), max: inner ? range(inner).max : undefined };
    }
    case "enum": {
      const values = (schema as z.ZodEnum).options as string[];
      if (key === "icon") return { kind: "icon", key, label, optional };
      return { kind: "choice", key, label, options: choice(values), optional };
    }
    case "string": {
      if (key === "review_id") return { kind: "review", key, label, optional };
      const { min, max } = range(schema);
      return { kind: "text", key, label, hint: exampleOf(description), min, max, optional, multiline: (max ?? 0) > 90 };
    }
    case "number": {
      // Un entero chico con mínimo y máximo (el ángulo de un momento): se elige de una lista.
      let js: { minimum?: number; maximum?: number } = {};
      try {
        js = toJSONSchema(schema, { unrepresentable: "any" }) as typeof js;
      } catch {}
      const lo = js.minimum ?? 1;
      const hi = js.maximum ?? lo;
      if (hi - lo > 10) throw new Error(`form: número sin rango chico en ${key}`);
      const options = Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i)).map((v) => ({ value: v, label: key === "slot" ? `Ángulo ${v}` : v }));
      return { kind: "choice", key, label, options, optional, numeric: true };
    }
    default:
      throw new Error(`form: tipo ${def.type} sin campo`);
  }
}

/** Un valor vacío para agregar a una lista (lo que se completa en el formulario). */
export function emptyValue(f: FormField): unknown {
  switch (f.kind) {
    case "text":
    case "review":
      return "";
    case "icon":
      return "check";
    case "choice":
      return f.numeric ? Number(f.options[0]?.value ?? 0) : (f.options[0]?.value ?? "");
    case "cell":
      return f.options[0]?.value ?? "yes";
    case "group":
      return Object.fromEntries(f.fields.filter((c) => !("optional" in c && c.optional)).map((c) => [c.key, emptyValue(c)]));
    case "list":
      return Array.from({ length: f.min }, () => emptyValue(f.item));
  }
}

/** Nombres de los íconos del tema (df-icon.liquid) en el selector. */
export const ICON_LABELS: Record<string, string> = {
  check: "Visto",
  "check-circle": "Visto en círculo",
  "x-circle": "Equis",
  truck: "Camión",
  package: "Paquete",
  home: "Casa",
  cart: "Carro",
  cash: "Billete",
  shield: "Escudo",
  lock: "Candado",
  return: "Devolución",
  clock: "Reloj",
  calendar: "Calendario",
  star: "Estrella",
  heart: "Corazón",
  sparkles: "Destellos",
  bolt: "Rayo",
  leaf: "Hoja",
  droplet: "Gota",
  sun: "Sol",
  moon: "Luna",
  battery: "Batería",
  feather: "Pluma",
  ruler: "Regla",
  target: "Diana",
  "thumbs-up": "Pulgar arriba",
  users: "Personas",
  chat: "Mensaje",
  gift: "Regalo",
  fire: "Fuego",
  eye: "Ojo",
  hand: "Mano",
  globe: "Mundo",
  award: "Medalla",
  phone: "Teléfono",
  headset: "Audífonos",
  flag: "Bandera",
};
