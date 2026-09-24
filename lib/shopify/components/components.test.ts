// Guarda el contrato de los componentes de conversión (README de esta carpeta).
//
// Recorre las carpetas (no solo el catálogo) para que un componente nuevo quede revisado desde que
// existe. Las reglas de schema son las que en v1 dejaron en 404 todas las fichas: Shopify rechaza
// en silencio la sección y se lleva cada template que la usa.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_KEYS, UI_ICON_KEYS, type ConversionComponent } from "./define";
import { CATALOG } from "./catalog";

const ROOT = __dirname;
const THEME_DIRS = ["sections", "blocks", "snippets", "assets"];
const ids = readdirSync(ROOT).filter((d) => !d.startsWith("_") && statSync(join(ROOT, d)).isDirectory());

function files(id: string): string[] {
  const out: string[] = [];
  for (const sub of THEME_DIRS) {
    const dir = join(ROOT, id, sub);
    if (existsSync(dir)) for (const f of readdirSync(dir)) out.push(join(dir, f));
  }
  return out;
}

function schemaOf(liquid: string): Record<string, unknown> | null {
  const m = liquid.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  return m ? JSON.parse(m[1]) : null;
}

function walk(node: unknown, visit: (n: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((v) => walk(v, visit));
  }
}

describe("íconos", () => {
  it("ICON_KEYS coincide con los que dibuja df-icon.liquid", () => {
    const liquid = readFileSync(join(ROOT, "_shared/snippets/df-icon.liquid"), "utf8");
    const drawn = [...liquid.matchAll(/when '([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(drawn).toEqual([...ICON_KEYS, ...UI_ICON_KEYS].sort());
  });
});

describe("base compartida", () => {
  it("las clases base van con :where() para no ganarle al CSS de los componentes", () => {
    const css = readFileSync(join(ROOT, "_shared/assets/df-components.css"), "utf8");
    for (const cls of ["df-heading", "df-eyebrow", "df-text", "df-icon", "df-container", "df-section-title"]) {
      expect(css, cls).toMatch(new RegExp(`:where\\(\\.${cls}\\) \\{`));
      expect(css, cls).not.toMatch(new RegExp(`\\n\\.${cls} \\{`));
    }
  });
});

describe("catálogo", () => {
  it("registra todas las carpetas, sin repetir", () => {
    expect(CATALOG.map((c) => c.id).sort()).toEqual([...ids].sort());
  });

  it("cada metafield se usa una sola vez", () => {
    const keys = CATALOG.flatMap((c) => [c.metafield?.key, ...c.media.map((m) => m.key)]).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// La tienda como landing (README de _landing): no son del catálogo, pero van al mismo tema con las
// mismas reglas de Shopify.
describe("_landing", () => {
  const landing = files("_landing");

  it("todo archivo del tema empieza con df-", () => {
    expect(landing.length).toBeGreaterThan(0);
    for (const f of landing) expect(f.split("/").pop()).toMatch(/^df-/);
  });

  it("schema válido para Shopify: nombres ≤ 25 y sin defaults vacíos", () => {
    for (const f of landing.filter((f) => f.endsWith(".liquid"))) {
      const schema = schemaOf(readFileSync(f, "utf8"));
      if (!schema) continue;
      walk(schema, (n) => {
        if (typeof n.name === "string" && !n.name.startsWith("t:")) expect(n.name.length, `${f}: ${n.name}`).toBeLessThanOrEqual(25);
        if ("default" in n) expect(n.default, `${f}: ${String(n.id)}`).not.toBe("");
      });
    }
  });

  it("solo usa íconos que existen", () => {
    for (const f of landing) {
      for (const m of readFileSync(f, "utf8").matchAll(/render 'df-icon', name: '([a-z-]+)'/g)) {
        expect([...ICON_KEYS, ...UI_ICON_KEYS] as string[]).toContain(m[1]);
      }
      const schema = f.endsWith(".liquid") ? schemaOf(readFileSync(f, "utf8")) : null;
      walk(schema, (n) => {
        if (n.id !== "icon" || !Array.isArray(n.options)) return;
        for (const o of n.options as { value: string }[]) expect([...ICON_KEYS] as string[]).toContain(o.value);
      });
    }
  });

  it("ningún bloque declara un ajuste de producto (closest.product lo tomaría vacío)", () => {
    const blocks = readdirSync(ROOT).flatMap((d) => (statSync(join(ROOT, d)).isDirectory() ? files(d) : [])).filter((f) => f.includes("/blocks/"));
    for (const f of blocks) {
      walk(schemaOf(readFileSync(f, "utf8")), (n) => {
        expect(n.type === "product" && typeof n.id === "string", `${f}: ajuste «${String(n.id)}» de tipo product`).toBe(false);
      });
    }
  });

  it("el tema usa los bloques de la landing en la ficha", () => {
    const template = readFileSync(join(ROOT, "../themes/DropPulse/templates/product.json"), "utf8");
    for (const type of ["df-hype-badge", "df-social-proof", "df-title", "df-subtitle", "df-price", "df-social-badge", "df-pack-offers"]) {
      expect(template).toContain(`"type": "${type}"`);
    }
  });
});

describe.each(ids)("%s", (id) => {
  const load = async (): Promise<ConversionComponent> => {
    const mod = await import(`./${id}/content.ts`);
    const found = Object.values(mod).find((v) => (v as ConversionComponent)?.id === id);
    if (!found) throw new Error(`${id}/content.ts no exporta un defineComponent con id "${id}"`);
    return found as ConversionComponent;
  };

  it("tiene content.ts, README.md y su archivo principal", async () => {
    const c = await load();
    expect(existsSync(join(ROOT, id, "README.md"))).toBe(true);
    expect(existsSync(join(ROOT, id, c.file))).toBe(true);
    expect(c.file).toBe(`${c.kind === "block" ? "blocks" : "sections"}/df-${id}.liquid`);
  });

  it("todo archivo del tema empieza con df-", () => {
    for (const f of files(id)) expect(f.split("/").pop()).toMatch(/^df-/);
  });

  it("schema válido para Shopify: nombres ≤ 25 y sin defaults vacíos", async () => {
    const c = await load();
    expect(c.name.length).toBeLessThanOrEqual(25);
    for (const f of files(id).filter((f) => f.endsWith(".liquid"))) {
      const schema = schemaOf(readFileSync(f, "utf8"));
      if (!schema) continue;
      walk(schema, (n) => {
        if (typeof n.name === "string" && !n.name.startsWith("t:")) expect(n.name.length, `${f}: ${n.name}`).toBeLessThanOrEqual(25);
        if ("default" in n) expect(n.default, `${f}: ${String(n.id)}`).not.toBe("");
      });
    }
  });

  it("las secciones no usan {% doc %} (solo snippets y bloques lo aceptan)", () => {
    for (const f of files(id).filter((f) => f.includes("/sections/"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\{%-?\s*doc\s*-?%\}/);
    }
  });

  it("solo usa íconos que existen", () => {
    for (const f of files(id)) {
      for (const m of readFileSync(f, "utf8").matchAll(/render 'df-icon', name: '([a-z-]+)'/g)) {
        expect([...ICON_KEYS, ...UI_ICON_KEYS] as string[]).toContain(m[1]);
      }
    }
  });

  it("los ejemplos cumplen el esquema de contenido", async () => {
    const c = await load();
    expect(c.examples.length).toBeGreaterThanOrEqual(2);
    for (const example of c.examples) {
      const parsed = c.content.safeParse(example);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("imprime el texto del metafield escapado", () => {
    for (const f of files(id).filter((f) => f.endsWith(".liquid"))) {
      const src = readFileSync(f, "utf8");
      // Un {{ … }} que imprime contenido/ítems del metafield sin escape es HTML del modelo en la tienda.
      for (const m of src.matchAll(/\{\{-?\s*((?:content|item|card|row|story|faq|stat)\.[a-z_.]+)\s*-?\}\}/g)) {
        throw new Error(`${f}: {{ ${m[1]} }} sin | escape`);
      }
    }
  });
});
