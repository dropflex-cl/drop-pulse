import { describe, expect, it } from "vitest";
import { hasThemeChanges, themeUpdateProblem, UNKNOWN_THEME_CODE } from "./kit-compatibility";
import { planUpdate, type Kit, type RemoteFile } from "./kit";

const kit: Kit = { version: "current", files: [{ path: "snippets/df-example.liquid", data: Buffer.from("new"), md5: "new" }, { path: "templates/product.json", data: Buffer.from("{}"), md5: "template" }] };
const releases = { versions: ["old", "current"], codeChecksums: { "snippets/df-example.liquid": ["old-code", "new"], "snippets/df-removed.liquid": ["removed-code"] } };
const check = (version: string | null, files: RemoteFile[]) => themeUpdateProblem(kit, version, files, planUpdate(kit.files, files), releases);

describe("compatibilidad de versiones del tema", () => {
  it("una huella distinta no anuncia cambios si el código real ya coincide", () => {
    const files = kit.files.map(f => ({ path: f.path, md5: f.md5 }));
    expect(check("unrecognized-record", files)).toBeUndefined();
    expect(hasThemeChanges(planUpdate(kit.files, files))).toBe(false);
  });
  it("permite actualizar un kit anterior conocido y conservar el template del comerciante", () => {
    const files = [{ path: "snippets/df-example.liquid", md5: "old-code" }, { path: "templates/product.json", md5: "merchant" }];
    expect(check("old", files)).toBeUndefined();
    expect(planUpdate(kit.files, files)).toMatchObject({ upsert: ["snippets/df-example.liquid"], skippedProtected: 1 });
  });
  it("sin versión histórica puede reparar archivos cuya procedencia sí se reconoce", () => {
    expect(check(null, [{ path: "snippets/df-example.liquid", md5: "old-code" }])).toBeUndefined();
  });
  it("rechaza un servidor anterior a la versión registrada en Shopify", () => {
    expect(check("future", [{ path: "snippets/df-example.liquid", md5: "newer-code" }])).toBe(UNKNOWN_THEME_CODE);
  });
  it("la versión registrada no permite sobrescribir código futuro o sin checksum", () => {
    for (const md5 of ["newer-code", null]) expect(check("current", [{ path: "snippets/df-example.liquid", md5 }])).toBe(UNKNOWN_THEME_CODE);
  });
  it("no borra archivos nuevos que el servidor no conoce", () => {
    expect(check("current", [{ path: "snippets/df-example.liquid", md5: "new" }, { path: "snippets/df-future.liquid", md5: "future" }])).toBe(UNKNOWN_THEME_CODE);
  });
  it("puede retirar un archivo antiguo reconocido y restaurar archivos faltantes", () => {
    const files = [{ path: "snippets/df-removed.liquid", md5: "removed-code" }];
    expect(check("old", files)).toBeUndefined();
    expect(planUpdate(kit.files, files)).toMatchObject({ remove: ["snippets/df-removed.liquid"], restore: ["templates/product.json"] });
  });
});
