// Genera lo que la vista previa en React toma del tema (docs/spec-pagina-componentes.md › 5), para
// que el preview y la tienda no sean dos diseños que se separan con el tiempo:
// - components/store-preview/store.generated.css: df-components.css y el {% stylesheet %} de cada
//   componente, tal cual, con los @media del tema pasados a @container (el preview mide 375 px aunque
//   la pantalla sea ancha);
// - lib/store-preview/theme.generated.ts: los íconos de df-icon.liquid y los valores por defecto de
//   los ajustes de cada componente ({% schema %}).
// Lo corre scripts/store-preview.ts; el test (store-preview.test.ts) exige que esté al día.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const COMPONENTS = join(ROOT, "lib", "shopify", "components");
export const CSS_OUT = join(ROOT, "components", "store-preview", "store.generated.css");
export const TS_OUT = join(ROOT, "lib", "store-preview", "theme.generated.ts");

/**
 * El marco de tienda: lo que el tema define y los componentes leen (--color-foreground…), con los
 * valores del design system que la tienda aplica (config/settings_data.json y df-design-system:
 * tinta #15171c, cobalto, Geist, radios 6/10/14). Fijo: la tienda no tiene modo oscuro.
 */
const FRAME = `.df-store {
  --color-foreground: #15171c;
  --color-background: #ffffff;
  --color-primary-button-background: #1f4bd8;
  --color-primary-button-text: #ffffff;
  --font-body--family: var(--font-geist-sans), "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-heading--family: var(--font-geist-sans), "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-heading--weight: 600;
  --style-border-radius-sm: 6px;
  --style-border-radius-md: 10px;
  --style-border-radius-lg: 14px;
  --style-border-radius-pills: 999px;
  container: store / inline-size;
  color-scheme: light;
  background: #ffffff;
  color: #15171c;
  font-family: var(--font-body--family);
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.df-store h2,
.df-store h3,
.df-store p,
.df-store ul,
.df-store ol,
.df-store figure,
.df-store blockquote {
  margin: 0;
}

.df-store button {
  font: inherit;
  color: inherit;
}

.df-store img {
  display: block;
  max-width: 100%;
}
`;

function liquidFiles(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(COMPONENTS).sort()) {
    const base = join(COMPONENTS, dir);
    if (!statSync(base).isDirectory()) continue;
    for (const sub of ["blocks", "sections", "snippets"]) {
      const from = join(base, sub);
      if (!existsSync(from)) continue;
      for (const f of readdirSync(from).sort()) if (f.endsWith(".liquid")) out.push(join(from, f));
    }
  }
  return out;
}

/** El tema mide la ventana; el preview mide su marco. */
const toContainer = (css: string) => css.replace(/@media\s*\(\s*(min|max)-width:/g, "@container store ($1-width:");

export function storeCss(): string {
  const parts = [
    "/* Generado por scripts/store-preview.ts desde lib/shopify/components. No editar a mano. */",
    FRAME,
    toContainer(readFileSync(join(COMPONENTS, "_shared", "assets", "df-components.css"), "utf8")),
  ];
  for (const file of liquidFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\{%-?\s*stylesheet\s*-?%\}([\s\S]*?)\{%-?\s*endstylesheet\s*-?%\}/g)) {
      const name = file.slice(COMPONENTS.length + 1);
      const body = m[1].replace(/^\n/, "").replace(/\s+$/, "");
      const indent = Math.min(...body.split("\n").filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
      parts.push(`/* ${name} */\n${toContainer(body.split("\n").map((l) => l.slice(indent)).join("\n"))}\n`);
    }
  }
  return parts.join("\n");
}

/** Clave → contenido del <svg> (24×24, trazo). */
export function icons(): Record<string, string> {
  const src = readFileSync(join(COMPONENTS, "_shared", "snippets", "df-icon.liquid"), "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/when '([a-z-]+)'\s*\n\s*assign d = '([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

type Setting = { id?: string; type?: string; default?: unknown };

/** Componente → ajuste → valor por defecto, del archivo principal (content.ts › file). */
export function settingsDefaults(files: Record<string, string>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, file] of Object.entries(files)) {
    const src = readFileSync(join(COMPONENTS, id, file), "utf8");
    const schema = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (!schema) continue;
    const settings = (JSON.parse(schema[1]).settings ?? []) as Setting[];
    out[id] = Object.fromEntries(settings.filter((s) => s.id && s.default !== undefined).map((s) => [s.id!, s.default]));
  }
  return out;
}

export function themeTs(files: Record<string, string>): string {
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return [
    "// Generado por scripts/store-preview.ts desde lib/shopify/components. No editar a mano.",
    "",
    "/** df-icon.liquid: clave → contenido del <svg viewBox=\"0 0 24 24\">. */",
    `export const ICON_PATHS: Record<string, string> = ${JSON.stringify(sorted(icons()), null, 2)};`,
    "",
    "/** Los valores por defecto de los ajustes de cada componente ({% schema %} › settings). */",
    `export const SETTINGS: Record<string, Record<string, unknown>> = ${JSON.stringify(sorted(settingsDefaults(files)), null, 2)};`,
    "",
  ].join("\n");
}
