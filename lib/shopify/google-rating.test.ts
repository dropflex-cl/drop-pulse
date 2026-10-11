import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {runInNewContext} from "node:vm";
describe("valoración real de Google",()=>{
 it("no fabrica ni recupera puntuaciones guardadas en el navegador",()=>{
  const window: {DropFlexGoogleRating?:{sync:()=>void}}={};
  const source=readFileSync("lib/shopify/components/_landing/assets/df-google-rating.js","utf8");
  runInNewContext(source,{window}); expect(()=>window.DropFlexGoogleRating?.sync()).not.toThrow();
  expect(source).not.toContain("random"); expect(source).not.toContain("localStorage");
 });
 it("solo representa la puntuación y la cantidad de reseñas de la tienda",()=>{
  const snippet=readFileSync("lib/shopify/components/_landing/snippets/df-google-rating.liquid","utf8");
  expect(snippet).toContain("google.rating"); expect(snippet).toContain("google_count > 0"); expect(snippet).toContain("rating: google_score");
 });
});
