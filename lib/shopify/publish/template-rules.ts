// Reglas que Shopify aplica al importar un tema y que `shopify theme check` no revisa (spec del tema
// §10: «Shopify rechaza en silencio»). Un template JSON con un ajuste inválido (un rango fuera de su
// paso, una opción que no existe, un bloque que su padre no acepta) se descarta entero al importar:
// sin templates/product.json todas las fichas dan 404. Puro sobre el contenido de los archivos.

export interface SettingDef {
  id?: string;
  type: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string }[];
}

export interface Schema {
  settings?: SettingDef[];
  blocks?: { type: string }[];
}

/** El {% schema %} de un Liquid, o null. */
export function schemaOf(liquid: string): Schema | null {
  const m = liquid.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  return m ? (JSON.parse(m[1]) as Schema) : null;
}

/** Shopify antepone un comentario a los JSON que guarda el editor. */
export const parseJson = (text: string) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));

const LIQUID_REF = /^\{\{.*\}\}$/;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA = /^rgba?\(/i;

/** Qué está mal en el valor de un ajuste según su definición; null si está bien. */
export function settingProblem(def: SettingDef, value: unknown): string | null {
  if (typeof value === "string" && LIQUID_REF.test(value)) return null; // referencia dinámica
  switch (def.type) {
    case "range": {
      if (typeof value !== "number") return `debe ser un número (vino ${JSON.stringify(value)})`;
      if (def.min != null && value < def.min) return `${value} es menor que el mínimo ${def.min}`;
      if (def.max != null && value > def.max) return `${value} es mayor que el máximo ${def.max}`;
      const step = def.step ?? 1;
      const base = def.min ?? 0;
      const k = (value - base) / step;
      if (Math.abs(k - Math.round(k)) > 1e-9) return `${value} no cae en el paso ${step} desde ${base}`;
      return null;
    }
    case "select":
    case "radio":
    case "text_alignment": {
      // Un select guarda texto: 32 (número) no es «32» y Shopify descarta el archivo entero.
      if (typeof value !== "string") return `debe ser texto (vino ${JSON.stringify(value)})`;
      const values = (def.options ?? []).map((o) => o.value);
      if (!values.length) return null;
      return values.includes(value) ? null : `«${value}» no es una opción (${values.join(", ")})`;
    }
    case "checkbox":
      return typeof value === "boolean" ? null : "debe ser true o false";
    case "number":
      return value === null || typeof value === "number" ? null : "debe ser un número";
    case "color":
    case "color_background":
      return value === "" || (typeof value === "string" && (HEX.test(value) || RGBA.test(value) || value.includes("gradient"))) ? null : `«${String(value)}» no es un color`;
    default:
      return null;
  }
}

export interface ThemeFiles {
  /** sections/<type>.liquid → contenido. */
  section(type: string): string | null;
  /** blocks/<type>.liquid → contenido. */
  block(type: string): string | null;
}

interface JsonBlock {
  type: string;
  static?: boolean;
  settings?: Record<string, unknown>;
  blocks?: Record<string, JsonBlock>;
  block_order?: string[];
  disabled?: boolean;
}

function checkSettings(where: string, schema: Schema | null, settings: Record<string, unknown> | undefined, out: string[]) {
  const defs = new Map((schema?.settings ?? []).filter((d) => d.id).map((d) => [d.id!, d]));
  for (const [id, value] of Object.entries(settings ?? {})) {
    const def = defs.get(id);
    if (!def) {
      out.push(`${where}: el ajuste «${id}» no existe en el schema`);
      continue;
    }
    const problem = settingProblem(def, value);
    if (problem) out.push(`${where}: «${id}» ${problem}`);
  }
}

/** ¿El padre acepta este tipo de bloque? Los privados (_x) solo si el padre los nombra. */
function accepts(parent: Schema | null, type: string, isStatic: boolean): boolean {
  if (isStatic) return true;
  const allowed = (parent?.blocks ?? []).map((b) => b.type);
  if (allowed.includes(type)) return true;
  return !type.startsWith("_") && allowed.includes("@theme");
}

function checkBlocks(where: string, parent: Schema | null, blocks: Record<string, JsonBlock> | undefined, order: string[] | undefined, files: ThemeFiles, out: string[]) {
  for (const [id, b] of Object.entries(blocks ?? {})) {
    const at = `${where} › ${id} (${b.type})`;
    if (b.type.startsWith("shopify://")) continue; // bloques de apps
    const src = files.block(b.type);
    if (src == null) {
      out.push(`${at}: no existe blocks/${b.type}.liquid`);
      continue;
    }
    if (!accepts(parent, b.type, Boolean(b.static))) out.push(`${at}: su padre no acepta bloques «${b.type}»`);
    const schema = schemaOf(src);
    checkSettings(at, schema, b.settings, out);
    checkBlocks(at, schema, b.blocks, b.block_order, files, out);
  }
  for (const id of order ?? []) if (!blocks?.[id]) out.push(`${where}: block_order nombra «${id}», que no está en blocks`);
}

/** Problemas de un template JSON (o de un grupo de secciones) contra los schemas del tema. */
export function templateProblems(name: string, json: { sections: Record<string, JsonBlock>; order?: string[] }, files: ThemeFiles): string[] {
  const out: string[] = [];
  for (const [id, s] of Object.entries(json.sections ?? {})) {
    const at = `${name} › ${id} (${s.type})`;
    if (s.type.startsWith("shopify://")) continue;
    const src = files.section(s.type);
    if (src == null) {
      out.push(`${at}: no existe sections/${s.type}.liquid`);
      continue;
    }
    const schema = schemaOf(src);
    checkSettings(at, schema, s.settings, out);
    checkBlocks(at, schema, s.blocks, s.block_order, files, out);
  }
  for (const id of json.order ?? []) if (!json.sections?.[id]) out.push(`${name}: order nombra «${id}», que no está en sections`);
  return out;
}

/** Problemas de settings_data.json (current) contra settings_schema.json. */
export function settingsDataProblems(data: { current: Record<string, unknown> | string }, schema: { settings?: SettingDef[] }[]): string[] {
  const out: string[] = [];
  const defs = new Map(schema.flatMap((g) => g.settings ?? []).filter((d) => d.id).map((d) => [d.id!, d]));
  if (typeof data.current !== "object") return out;
  for (const [id, value] of Object.entries(data.current)) {
    if (id === "blocks" || id === "sections" || id === "content_for_index") continue;
    const def = defs.get(id);
    if (!def) {
      out.push(`settings_data › «${id}» no existe en settings_schema.json`);
      continue;
    }
    const problem = settingProblem(def, value);
    if (problem) out.push(`settings_data › «${id}» ${problem}`);
  }
  return out;
}

const BLOCK_TAGS = new Set(["if", "unless", "for", "case", "capture", "tablerow", "form", "paginate", "comment", "raw", "doc"]);

/**
 * {% stylesheet %}, {% javascript %} y {% schema %} van en el nivel superior del archivo. Dentro de
 * un if/for Shopify rechaza el archivo entero al importar (y con él cada template que lo usa);
 * `shopify theme check` no lo avisa.
 */
export function liquidNestingProblems(src: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const m of src.matchAll(/\{%-?\s*(end)?(\w+)[\s\S]*?-?%\}/g)) {
    const [, end, tag] = m;
    if (!end && (tag === "stylesheet" || tag === "javascript" || tag === "schema")) {
      if (stack.length) out.push(`{% ${tag} %} dentro de {% ${stack.join(" › ")} %} (línea ${src.slice(0, m.index).split("\n").length})`);
    } else if (end && BLOCK_TAGS.has(tag)) {
      if (stack[stack.length - 1] === tag) stack.pop();
    } else if (!end && BLOCK_TAGS.has(tag)) {
      stack.push(tag);
    }
  }
  return out;
}
