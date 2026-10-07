/** Opt-in: Chromium local sobre Liquid publicado, sin tienda ni red externa. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import { experienceManifestSchema } from "@/lib/product-intelligence/experience-resolver";
const script = (path: string) => [...readFileSync(path,"utf8").matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
const selector = script("lib/shopify/components/_shared/snippets/df-landing-selector.liquid");
const runtime = script("lib/shopify/components/_shared/snippets/df-pdp-experience.liquid");
const id="a0000000-0000-4000-8000-000000000001";
const section=(component:string, placement:"hero"|"body", content_variant_key="default")=>({section_key:component,component,placement,content_variant_key,persuasion_job:"recognition"});
const base={id,product_id:id,strategy_id:id,angle_id:id,persuasion_plan_id:id,revision:1,plan_revision:1,landing_angle_id:"desk",landing_hook_id:null,experience_key:"desk-default",architecture_variant:"compact",is_default:false,
  sections:[section("listing","hero"),section("faq-and-text","body"),section("pain-block","body","alternate")]};
const manifest=experienceManifestSchema.parse({schema_version:"1.0",enabled:true,experiences:[base,{...base,id:"a0000000-0000-4000-8000-000000000002",landing_hook_id:"mirror",experience_key:"mirror",sections:[section("listing","hero"),section("pain-block","body")] }]});
function host(component:string){return `<df-landing-content data-df-component="df-${component}"><div data-df-active>${component}: default</div><template data-df-variant="default">${component}: default</template><template data-df-variant="alternate" data-angle="desk">${component}: alternate</template></df-landing-content>`;}
function html(data:unknown, missing=false){return `<!doctype html><html><head><script>${selector}</script><script type="application/json" id="df-pdp-manifest">${JSON.stringify(data)}</script><script>${runtime}</script></head><body>
<section class="shopify-section" id="main"><form id="cart"><input name="quantity" value="2"><button>Add to cart</button></form>${host("title")}${host("subtitle")}${host("pack-offers")}<div data-df-pdp-component="benefit-usps">Legacy benefits</div><div data-df-pdp-component="gif-strip">Legacy gifs</div></section>
<section class="shopify-section" id="pain"><div data-df-pdp-component="pain-block">${host("pain-block")}</div></section>
${missing?"":`<section class="shopify-section" id="faq"><div data-df-pdp-component="faq-and-text">${host("faq-and-text")}</div></section>`}
<section id="unrelated">Theme extension</section></body></html>`;}
describe.runIf(process.env.PDP_BROWSER_TEST==="1")("PDP · runtime Shopify real en Chromium",()=>{
  let browser:Browser;
  beforeAll(async()=>{browser=await chromium.launch({headless:true});});afterAll(async()=>{await browser.close();});
  async function page(data:unknown=manifest,query="angle=desk",missing=false,javaScriptEnabled=true){
    const context=await browser.newContext({javaScriptEnabled,viewport:{width:390,height:844}}),p=await context.newPage();
    await p.route("https://store.test/**",r=>r.fulfill({contentType:"text/html",body:html(data,missing)}));
    await p.goto(`https://store.test/products/organizer?${query}`);return {context,p};
  }
  it("reordena cuerpos, elige copy vinculado y conserva form/galería de compra",async()=>{
    const {context,p}=await page();try{
      expect(await p.locator(".df-pdp-stream > .shopify-section").evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(["faq","pain"]);
      expect(await p.locator('#pain [data-df-active]').textContent()).toBe("pain-block: alternate");
      expect(await p.locator('[data-df-pdp-component="benefit-usps"]').isHidden()).toBe(true);
      expect(await p.locator('#cart input').inputValue()).toBe("2");expect(await p.locator('#unrelated').textContent()).toBe("Theme extension");
      expect(await p.evaluate(()=>document.querySelector("#cart")?.closest(".shopify-section")?.id)).toBe("main");
    }finally{await context.close();}
  });
  it("hook comparte plan y cambia arquitectura solo por experiencia explícita; popstate restaura legacy",async()=>{
    const {context,p}=await page(manifest,"angle=desk&hook=mirror");try{
      expect(await p.locator(".df-pdp-stream > .shopify-section").evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(["pain"]);
      await p.evaluate(()=>{history.pushState(null,"","?angle=unknown");window.dispatchEvent(new PopStateEvent("popstate"));});
      expect(await p.locator(".df-pdp-stream").count()).toBe(0);expect(await p.locator('#faq').isVisible()).toBe(true);
      expect(await p.locator('[data-df-pdp-component="benefit-usps"]').isVisible()).toBe(true);
      expect(await p.locator('#pain [data-df-active]').textContent()).toBe("pain-block: default");
      await p.evaluate(()=>{history.pushState(null,"","?df_angle=desk");window.dispatchEvent(new PopStateEvent("popstate"));});
      expect(await p.locator(".df-pdp-stream > .shopify-section").count()).toBe(2);
    }finally{await context.close();}
  });
  it("faltan componentes o manifiesto corrupto: ninguna mutación parcial",async()=>{
    for(const [data,missing]of [[manifest,true],[{...manifest,experiences:[{...base,sections:[section("injected","body")]}]},false]] as const){
      const {context,p}=await page(data,"angle=desk",missing);try{
        expect(await p.locator(".df-pdp-stream").count()).toBe(0);expect(await p.locator('[data-df-pdp-component="benefit-usps"]').isVisible()).toBe(true);
        expect(await p.locator('#cart input').inputValue()).toBe("2");
      }finally{await context.close();}
    }
  });
  it("sin JavaScript y parámetros inválidos conserva legacy",async()=>{
    for(const [query,js]of [["angle=desk",false],["angle=desk&angle=other",true],["angle=%3Cscript%3E",true]] as const){
      const {context,p}=await page(manifest,query,false,js);try{
        expect(await p.locator(".df-pdp-stream").count()).toBe(0);expect(await p.locator('#faq').isVisible()).toBe(true);
      }finally{await context.close();}
    }
  });
});
