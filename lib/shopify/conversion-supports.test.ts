import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_SUPPORTS } from "./conversion-supports";

// Ejecuta el script del tema: aplicar una arquitectura no debe quitar pruebas o controles
// comerciales. DOM mínimo con marcadores para verificar también restauración al navegar.
function applyExperience(disabled: string[] = []) {
  const source = readFileSync(
    join(__dirname, "components/_shared/snippets/df-pdp-experience.liquid"),
    "utf8",
  );
  const code = source
    .match(/<script>\n([\s\S]*?)<\/script>/)![1]
    .replace(/{{[^}]*}}/g, JSON.stringify(disabled));
  const uuid = "11111111-1111-4111-8111-111111111111";
  const experience = {
    id: uuid,
    product_id: uuid,
    strategy_id: uuid,
    angle_id: uuid,
    persuasion_plan_id: uuid,
    revision: 1,
    plan_revision: 1,
    is_default: true,
    experience_key: "main",
    architecture_variant: "demo",
    landing_angle_id: "clean",
    landing_hook_id: null,
    sections: [
      {
        component: "listing",
        section_key: "hero",
        content_variant_key: "default",
        placement: "hero",
      },
      {
        component: "pain-block",
        section_key: "problem",
        content_variant_key: "default",
        placement: "body",
      },
    ],
  };
  const node = (id: string) => ({
    dataset: { dfPdpComponent: id } as Record<string, string>,
    hidden: false,
    before: () => {},
    closest: () => null,
    querySelectorAll: () => [],
    remove: () => {},
    append: () => {},
  });
  const roots = [...DEFAULT_CONVERSION_SUPPORTS].map(node);
  const main = { after: () => {}, querySelectorAll: () => [] };
  const window = {
    DropFlexLanding: {
      selection: () => ({ angle: null, hook: null }),
      scan: () => {},
    },
    addEventListener: () => {},
  } as unknown as {
    DropFlexPdp: { apply: () => void; restore: () => void };
    DropFlexLanding: unknown;
    addEventListener: unknown;
  };
  const document = {
    getElementById: () => ({
      textContent: JSON.stringify({
        schema_version: "1.0",
        enabled: true,
        experiences: [experience],
      }),
    }),
    querySelectorAll: () => roots,
    querySelector: () => ({ closest: () => main }),
    createElement: () => node("stream"),
    createComment: () => ({ isConnected: true, replaceWith: () => {} }),
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
  runInNewContext(code, { window, document, CustomEvent: class {}, console });
  window.DropFlexPdp.apply();
  return { roots, window };
}

describe("apoyos comerciales de la PDP", () => {
  it("conserva todos los componentes omitidos por el plan", () => {
    const { roots } = applyExperience();
    for (const id of DEFAULT_CONVERSION_SUPPORTS)
      expect(
        roots.find((n) => n.dataset.dfPdpComponent === id)?.hidden,
        id,
      ).toBe(false);
    expect(
      roots.find((n) => n.dataset.dfPdpComponent === "comparison-table")
        ?.hidden,
    ).toBe(false);
  });
  it("respeta exclusiones y restaura el DOM al cambiar de experiencia", () => {
    const { roots, window } = applyExperience(["review-wall"]);
    expect(
      roots.find((n) => n.dataset.dfPdpComponent === "review-wall")?.hidden,
    ).toBe(true);
    window.DropFlexPdp.restore();
    expect(roots.every((n) => !n.hidden)).toBe(true);
  });
});

describe("disponibilidad real", () => {
  it("actualiza stock por variante sin fabricar ventas o escasez", () => {
    const source = readFileSync(
      join(__dirname, "components/inventory/assets/df-inventory.js"),
      "utf8",
    );
    const registry: Record<string, unknown> = {};
    const result = runInNewContext(
      source +
        `
      const inventory = new registry['df-inventory']();
      inventory.dataset = { threshold: '10', showQuantity: 'true', showUntracked: 'false' };
      inventory.className = 'df-inventory--available';
      inventory.classList = { contains: () => true };
      inventory.textEl = { textContent: '' };
      inventory.texts = { available: 'Disponible', limited: 'Quedan {qty} unidades' };
      inventory.variants = { one: { a: true, q: 6, m: 'shopify', p: 'deny' },
        many: { a: true, q: 40, m: 'shopify', p: 'deny' },
        unknown: { a: true, q: 0, m: null, p: 'continue' } };
      inventory.render('one'); const low = inventory.textEl.textContent;
      inventory.render('many'); const available = inventory.textEl.textContent;
      inventory.render('unknown');
      ({ low, available, unknownHidden: inventory.hidden });
    `,
      {
        registry,
        customElements: {
          get: () => null,
          define: (name: string, ctor: unknown) => {
            registry[name] = ctor;
          },
        },
        HTMLElement: class {},
        window: { matchMedia: () => ({ matches: true }) },
        document: {},
      },
    );
    expect(result).toEqual({
      low: "Quedan 6 unidades",
      available: "Disponible",
      unknownHidden: true,
    });
  });
});
