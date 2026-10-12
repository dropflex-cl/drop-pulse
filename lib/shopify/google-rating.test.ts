import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {runInNewContext} from "node:vm";
import { Liquid } from "liquidjs";
describe("valoración compartida de Google",()=>{
 it("no fabrica ni recupera puntuaciones guardadas en el navegador",()=>{
  const window: {DropFlexGoogleRating?:{sync:()=>void}}={};
  const source=readFileSync("lib/shopify/components/_landing/assets/df-google-rating.js","utf8");
  runInNewContext(source,{window}); expect(()=>window.DropFlexGoogleRating?.sync()).not.toThrow();
  expect(source).not.toContain("random"); expect(source).not.toContain("localStorage");
 });
 it("lee el agregado de la PDP, sin exigir el metafield de Google",()=>{
  const snippet=readFileSync("lib/shopify/components/_landing/snippets/df-google-rating.liquid","utf8");
  expect(snippet).toContain("render 'df-pdp-rating'"); expect(snippet).not.toContain("google.rating"); expect(snippet).not.toContain("google.count"); expect(snippet).not.toContain("google_count > 0"); expect(snippet).toContain("rating: google_score");
 });
 it("Liquid limita la nota compartida a 4,4–4,9 y conserva una nota ausente", async()=>{
  const snippet=readFileSync("lib/shopify/components/_shared/snippets/df-pdp-rating.liquid","utf8").replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, "");
  const engine=new Liquid();
  for(const [rating,expected] of [[5,4.9],[3,4.4],[4.46,4.5],[null,0]]) {
   const result=await engine.parseAndRender(snippet,{product:{metafields:{dropflex:{review_summary:{value:{rating,count:8}}}}}});
   const [score,count]=result.trim().split("|").map(Number);
   expect(score).toBeCloseTo(expected!); expect(count).toBe(8);
  }
 });
});
