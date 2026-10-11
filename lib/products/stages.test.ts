import { describe, expect, it } from "vitest";
import { productPosition } from "./stages";
import { contentSituation } from "./content-state";
const facts = { price: 24990, currency: "CLP" };
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
    const position=productPosition({...facts,ai:false,base:{described:false,priced:false},intelligence:{selected:false,ready:false},reviews:{pending:12,approved:0,total:12},content:{hasContent:true,missing:[],stale:false}});
    expect(position.contentState).toBe("ready");
    expect(position.meter).toEqual([]);
    expect(position.stages.every(s=>s.state==="available")).toBe(true);
  });
  it("conserva la clasificación publicado aunque haya cambios sin publicar", () => {
    expect(productPosition({...facts,publish:{status:"published"},content:{hasContent:true,missing:["Falta imagen"],stale:true}})).toMatchObject({filter:"publicados",contentState:"updated",status:"publicado"});
    expect(productPosition({...facts,publish:{status:"error",error:"Intenta de nuevo"}})).toMatchObject({filter:"detenidos",contentState:"error"});
  });
});
