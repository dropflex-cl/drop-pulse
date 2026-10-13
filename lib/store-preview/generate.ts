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
import postcss from "postcss";

const ROOT = join(__dirname, "..", "..");
const COMPONENTS = join(ROOT, "lib", "shopify", "components");
export const CSS_OUT = join(
  ROOT,
  "components",
  "store-preview",
  "store.generated.css",
);
export const TS_OUT = join(ROOT, "lib", "store-preview", "theme.generated.ts");

/**
 * El marco de tienda: lo que el tema define y los componentes leen (--color-foreground…), con los
 * valores del design system que la tienda aplica (config/settings_data.json y df-design-system:
 * tinta #15171c, cobalto, Geist, radios 6/10/14). Fijo: la tienda no tiene modo oscuro.
 */
const THEME = join(ROOT, "lib", "shopify", "themes", "DropPulse");

export function storeAssets(): { path: string; bytes: Buffer }[] {
  return [...["df-geist-400.woff2", "df-geist-500.woff2", "df-geist-600.woff2", "df-google-logo.svg"].map(name => ({
    path: join(ROOT, "public", "store-preview", name),
    bytes: readFileSync(join(COMPONENTS, "_landing", "assets", name)),
  })), { path: join(ROOT, "public", "store-preview", "df-shipping-timeline.js"),
    bytes: readFileSync(join(COMPONENTS, "shipping-timeline", "assets", "df-shipping-timeline.js")) },
    { path: join(ROOT, "public", "store-preview", "df-purchase-cta.js"),
    bytes: readFileSync(join(COMPONENTS, "_landing", "assets", "df-purchase-cta.js")) }];
}

/** Valores de la tienda instalada; no usar los tokens de la app ni los fallbacks portables. */
function frameCss(): string {
  const current = JSON.parse(readFileSync(join(THEME, "config/settings_data.json"), "utf8")).current;
  const variables = readFileSync(join(THEME, "snippets/theme-styles-variables.liquid"), "utf8");
  const base = readFileSync(join(THEME, "assets/base.css"), "utf8");
  const design = readFileSync(join(COMPONENTS, "_landing/snippets/df-design-system.liquid"), "utf8");
  const literal = (source: string, name: string) => {
    const value = source.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];
    if (!value) throw new Error(`Falta ${name} en el tema`);
    return value;
  };
  const margins = [...base.matchAll(/--page-margin:\s*([^;]+);/g)].map(m => m[1]);
  const fonts = [...design.matchAll(/@font-face\s*\{[\s\S]*?\n    \}/g)].map(m => m[0]
    .replace(/'Geist'/g, "'DropFlex Store Geist'")
    .replace(/\{\{\s*'([^']+)'\s*\|\s*asset_url\s*\}\}/g, "/store-preview/$1")).join("\n");
  return `${fonts}\n.df-store {
  --color-foreground: ${current.color_palette.foreground};
  --color-background: ${current.color_palette.background};
  --color-primary-button-background: ${current.color_palette.color1};
  --color-primary-button-text: ${current.color_palette.background};
  --font-body--family: "DropFlex Store Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-heading--family: var(--font-body--family);
  --font-heading--weight: ${literal(design, "--font-heading--weight")};
  --style-border-radius-sm: ${literal(design, "--style-border-radius-sm")};
  --style-border-radius-md: ${literal(design, "--style-border-radius-md")};
  --style-border-radius-lg: ${literal(design, "--style-border-radius-lg")};
  --style-border-radius-pills: ${current.pills_border_radius}px;
  --gap-md: ${literal(variables, "--gap-md")};
  --page-margin: ${margins[0]};
  container: store / inline-size;
  color-scheme: light;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-body--family);
  font-size: ${current.type_size_paragraph}px;
  font-weight: 400;
  line-height: ${literal(variables, `--line-height--${current.type_line_height_paragraph}`)};
  -webkit-font-smoothing: antialiased;
}

:where(.df-store) :where(h1, h2, h3, h4, h5, h6, p, ul, ol, figure, blockquote) {
  margin: 0;
}

:where(.df-store) :where(button, input, textarea, select) {
  font: inherit;
  color: inherit;
}

:where(.df-store) :where(img, picture, video, canvas, svg) {
  display: block;
  max-width: 100%;
}
:where(.df-store) img { width: 100%; height: auto; }
:where(.df-store) :where(p, h1, h2, h3, h4, h5, h6) { overflow-wrap: break-word; }
:where(.df-store) p:empty { display: none; }
:where(.df-store) :where(.df-price, .df-pack-offers) { font-variant-numeric: tabular-nums; }
@container store (min-width: 750px) {
  .df-store > * { --page-margin: ${margins[1]}; }
}
`;
}

function liquidFiles(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(COMPONENTS).sort()) {
    const base = join(COMPONENTS, dir);
    if (!statSync(base).isDirectory()) continue;
    for (const sub of ["blocks", "sections", "snippets"]) {
      const from = join(base, sub);
      if (!existsSync(from)) continue;
      for (const f of readdirSync(from).sort())
        if (f.endsWith(".liquid")) out.push(join(from, f));
    }
  }
  return out;
}

/** La galería usa las reglas de Horizon y los ajustes del template, no la maqueta portable. */
function galleryCss(): string {
  const template = JSON.parse(readFileSync(join(THEME, "templates/product.json"), "utf8"));
  const media = template.sections.main.blocks["media-gallery"].settings;
  const main = template.sections.main.settings;
  const details = template.sections.main.blocks["product-details"].settings;
  const divider = template.sections.main.blocks["product-details"].blocks.divider.settings;
  const variables = readFileSync(join(THEME, "snippets/theme-styles-variables.liquid"), "utf8");
  const source = readFileSync(join(THEME, "snippets/slideshow-controls.liquid"), "utf8");
  const sheet = postcss.parse(source.match(/\{% stylesheet %\}([\s\S]*?)\{% endstylesheet %\}/)![1]);
  let thumbnails = "";
  sheet.walkRules(".slideshow-controls__thumbnails", rule => {
    const copy = rule.clone();
    copy.selector = ".df-gallery-preview__thumbnails";
    copy.walkRules(r => { r.selector = r.selector.replaceAll(".slideshow-control", ".df-gallery-preview__thumbnail").replaceAll("aria-selected", "aria-pressed"); });
    thumbnails = copy.toString();
  });
  const design = readFileSync(join(COMPONENTS, "_landing/snippets/df-design-system.liquid"), "utf8");
  const declarations = (selector: string) => {
    const at = design.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`Falta la regla de galería ${selector}`);
    return design.slice(design.indexOf("{", at) + 1, design.indexOf("}", at));
  };
  const token = (source: string, name: string) => source.match(new RegExp(`${name}:\\s*([^;]+);`))![1];
  return toContainer(`/* Galería: slideshow-controls.liquid y df-design-system.liquid. */
  .df-gallery-preview {
    padding-inline: 0;
    --thumbnail-width: ${media.thumbnail_width}px;
    --thumbnail-radius: ${media.thumbnail_radius}px;
    --aspect-ratio: ${media.aspect_ratio};
    --focus-outline-width: ${token(design, "--focus-outline-width")};
    --focus-outline-offset: ${token(design, "--focus-outline-offset")};
    --style-border-width: 0px;
    --padding-sm: ${token(variables, "--padding-sm")};
    --gap-xs: ${token(variables, "--gap-xs")};
  }
  .df-gallery-preview__image { border-radius: ${media.media_radius}px; }
  .df-gallery-preview__image img { object-fit: ${media.media_fit}; }
  .df-gallery-preview__thumbnail { flex: none; padding: 0; background-color: inherit; box-shadow: none; }
  ${thumbnails}
  .df-gallery-preview__thumbnail[aria-pressed='true'] { box-shadow: none; outline-color: var(--df-accent-ink); }
  .df-listing-preview { display: flex; flex-direction: column; padding-block-end: ${main["padding-block-end"]}px; }
  .df-listing-preview__details { display: flex; flex-direction: column; gap: ${details.gap}px; padding-inline: var(--df-gutter); }
  .df-listing-preview__divider { padding-block: ${divider["padding-block-start"]}px ${divider["padding-block-end"]}px; }
  .df-listing-preview__divider hr { margin: 0; border: 0; border-top: ${divider.thickness}px solid ${divider.divider_color}; }
  @media (max-width: 749px) {
    .df-gallery-preview__hero { ${declarations(".product-information media-gallery slideshow-container")} }
    .df-gallery-preview__thumbnails { ${declarations(".product-information slideshow-controls[thumbnails] .slideshow-controls__thumbnails")} }
    .df-gallery-preview__thumbnail { ${declarations(".product-information slideshow-controls[thumbnails] .slideshow-control")} }
    .df-listing-preview__details { ${declarations(".product-information .product-details")} }
  }
  @media (min-width: 750px) {
    .df-listing-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${main.gap}px; padding-block-start: ${main["padding-block-start"]}px; padding-inline: var(--page-margin); max-width: calc(${token(design, "--narrow-page-width")} + var(--page-margin) * 2); margin-inline: auto; }
    .df-listing-preview__details { padding-inline: 0; }
  }
  `).split("\n").map(line => line.trimEnd()).join("\n").trim() + "\n";
}

/** El tema mide la ventana; el preview mide su marco. */
export function toContainer(css: string): string {
  const root = postcss.parse(css);
  root.walkDecls(d => { d.value = d.value.replace(/(\d*\.?\d+)vw\b/g, "$1cqw"); });
  root.walkAtRules("media", rule => {
    // Conserva prefers-reduced-motion cuando comparte consulta con el breakpoint.
    const width = rule.params.match(/\((?:min|max)-width\s*:[^)]+\)/)?.[0];
    if (!width) return;
    const other = rule.params.replace(width, "").replace(/\b(?:screen|all|and)\b/g, "").trim();
    if (other) {
      const container = postcss.atRule({ name: "container", params: `store ${width}` });
      container.append(rule.nodes ?? []);
      rule.params = other;
      rule.append(container);
    } else {
      rule.name = "container";
      rule.params = `store ${width}`;
    }
  });
  return root.toString();
}

export function storeCss(): string {
  const parts = [
    "/* Generado por scripts/store-preview.ts desde lib/shopify/components. No editar a mano. */",
    frameCss(),
    toContainer(
      readFileSync(
        join(COMPONENTS, "_shared", "assets", "df-components.css"),
        "utf8",
      ),
    ),
    toContainer(
      readFileSync(
        join(COMPONENTS, "_shared", "assets", "df-rich-pdp.css"),
        "utf8",
      ),
    ),
  ];
  for (const file of liquidFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /\{%-?\s*stylesheet\s*-?%\}([\s\S]*?)\{%-?\s*endstylesheet\s*-?%\}/g,
    )) {
      const name = file.slice(COMPONENTS.length + 1);
      const body = m[1].replace(/^\n/, "").replace(/\s+$/, "");
      const indent = Math.min(
        ...body
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.match(/^ */)![0].length),
      );
      parts.push(
        `/* ${name} */\n${toContainer(
          body
            .split("\n")
            .map((l) => l.slice(indent))
            .join("\n"),
        )}\n`,
      );
    }
  }
  parts.push(galleryCss());
  return parts.join("\n");
}

/** Clave → contenido del <svg> (24×24, trazo). */
export function icons(): Record<string, string> {
  const src = readFileSync(
    join(COMPONENTS, "_shared", "snippets", "df-icon.liquid"),
    "utf8",
  );
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/when '([a-z-]+)'\s*\n\s*assign d = '([^']*)'/g))
    out[m[1]] = m[2];
  return out;
}

type Setting = { id?: string; type?: string; default?: unknown };

/** Componente → ajuste → valor por defecto, del archivo principal (content.ts › file). */
export function settingsDefaults(
  files: Record<string, string>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const landing = Object.fromEntries(readdirSync(join(COMPONENTS, "_landing", "blocks"))
    .filter(f => f.endsWith(".liquid")).map(f => [f.replace(/^df-/, "").replace(/\.liquid$/, ""), join("_landing", "blocks", f)]));
  for (const [id, file] of Object.entries({ ...landing, ...Object.fromEntries(Object.entries(files).map(([id, f]) => [id, join(id, f)])) })) {
    const src = readFileSync(join(COMPONENTS, file), "utf8");
    const schema = src.match(
      /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/,
    );
    if (!schema) continue;
    const settings = (JSON.parse(schema[1]).settings ?? []) as Setting[];
    out[id] = Object.fromEntries(
      settings
        .filter((s) => s.id && s.default !== undefined)
        .map((s) => [s.id!, s.default]),
    );
  }
  // Los ajustes explícitos del template ganan a los defaults del schema, igual que en Shopify.
  type TemplateNode = { type?: string; settings?: Record<string, unknown>; blocks?: Record<string, TemplateNode> };
  const visit = (node: TemplateNode) => {
    const id = node.type?.replace(/^df-/, "");
    if (node.type?.startsWith("df-") && id && out[id]) Object.assign(out[id], node.settings);
    for (const child of Object.values(node.blocks ?? {})) visit(child);
  };
  const template = JSON.parse(readFileSync(join(THEME, "templates/product.json"), "utf8"));
  for (const section of Object.values(template.sections)) visit(section as Parameters<typeof visit>[0]);
  return out;
}

export function themeTs(files: Record<string, string>): string {
  const sorted = (o: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(o).sort(([a], [b]) => a.localeCompare(b)),
    );
  return [
    "// Generado por scripts/store-preview.ts desde lib/shopify/components. No editar a mano.",
    "",
    '/** df-icon.liquid: clave → contenido del <svg viewBox="0 0 24 24">. */',
    `export const ICON_PATHS: Record<string, string> = ${JSON.stringify(sorted(icons()), null, 2)};`,
    "",
    "/** Los valores por defecto de los ajustes de cada componente ({% schema %} › settings). */",
    `export const SETTINGS: Record<string, Record<string, unknown>> = ${JSON.stringify(sorted(settingsDefaults(files)), null, 2)};`,
    "",
  ].join("\n");
}
