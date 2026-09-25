// Lo que Shopify rechaza en silencio al importar el tema (y deja las fichas en 404), revisado sobre
// el tema del repo. `shopify theme check` no mira ninguna de estas reglas.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KIT_DIR } from "./kit";
import { liquidNestingProblems, parseJson, settingProblem, settingsDataProblems, templateProblems } from "./template-rules";

const read = (p: string) => (existsSync(join(KIT_DIR, p)) ? readFileSync(join(KIT_DIR, p), "utf8") : null);
const files = { section: (t: string) => read(`sections/${t}.liquid`), block: (t: string) => read(`blocks/${t}.liquid`) };
const liquids = (dir: string) => readdirSync(join(KIT_DIR, dir)).filter((f) => f.endsWith(".liquid")).map((f) => `${dir}/${f}`);

describe("reglas de importación de Shopify", () => {
  it("cada template y grupo de secciones cumple los schemas de sus secciones y bloques", () => {
    const jsons = [...readdirSync(join(KIT_DIR, "templates")).filter((f) => f.endsWith(".json")).map((f) => `templates/${f}`), "sections/header-group.json", "sections/footer-group.json"];
    for (const f of jsons) expect(templateProblems(f, parseJson(read(f)!), files), f).toEqual([]);
  });

  it("settings_data.json cumple settings_schema.json", () => {
    expect(settingsDataProblems(parseJson(read("config/settings_data.json")!), JSON.parse(read("config/settings_schema.json")!))).toEqual([]);
  });

  it("stylesheet, javascript y schema van en el nivel superior de cada Liquid", () => {
    for (const f of ["blocks", "sections", "snippets", "layout"].flatMap(liquids)) expect(liquidNestingProblems(read(f)!), f).toEqual([]);
  });

  it("detecta lo que rompió la primera instalación", () => {
    expect(settingProblem({ type: "select", options: [{ value: "32" }] }, 32)).toMatch(/debe ser texto/);
    expect(settingProblem({ type: "range", min: 0, max: 40, step: 2 }, 7)).toMatch(/paso/);
    expect(liquidNestingProblems("{% if x %}\n{% stylesheet %}a{}{% endstylesheet %}\n{% endif %}")).toHaveLength(1);
    expect(liquidNestingProblems("{% if x %}{% endif %}\n{% stylesheet %}a{}{% endstylesheet %}")).toEqual([]);
  });
});
