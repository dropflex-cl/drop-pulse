import { describe, expect, it } from "vitest";
import { productPresentation } from "./presentation";
import { contentSituation } from "./content-state";
describe("Contenido guardado y operación", () => {
  it.each([
    [false, [], undefined, "empty"],
    [true, ["Elige una portada"], undefined, "incomplete"],
    [true, [], undefined, "ready"],
    [true, [], {status:"publishing"}, "publishing"],
    [true, [], {status:"published",stale:false}, "published"],
    [true, ["Elige una portada"], {status:"published",stale:true}, "updated"],
    [true, [], {status:"error",error:"Shopify rechazó el permiso"}, "error"],
  ] as const)("representa la situación real %s %s %s", (hasContent, missing, publication, expected) => {
    expect(contentSituation({hasContent,missing:[...missing],publication}).state).toBe(expected);
  });
  it("no convierte contexto, estrategia, clave, reseñas ni secciones vacías en tareas obligatorias", () => {
    const position = productPresentation({ content: { hasContent: true, missing: [], stale: false } });
    expect(position.contentState).toBe("ready");
    expect(position.publicationReady).toBe(true);
    expect(position.sections.every(s => s.state === "available")).toBe(true);

  });
  it("conserva la clasificación publicado aunque haya cambios sin publicar", () => {
    expect(productPresentation({publish:{status:"published"},content:{hasContent:true,missing:["Falta imagen"],stale:true}})).toMatchObject({filter:"publicados",contentState:"updated",status:"publicado"});
    expect(productPresentation({publish:{status:"error",error:"Intenta de nuevo"}})).toMatchObject({filter:"detenidos",contentState:"error"});
  });
  it.each([
    [false, [], false],
    [true, ["El archivo no está disponible"], false],
    [true, ["Conecta Shopify"], false],
    [true, [], true],
  ] as const)("deriva disponibilidad de contenido e impedimentos reales", (hasContent, missing, ready) => {
    expect(productPresentation({ content: { hasContent, missing: [...missing], stale: false } }).publicationReady).toBe(ready);
  });
});
