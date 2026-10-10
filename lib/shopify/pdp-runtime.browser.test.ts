/** Opt-in: Chromium local sobre Liquid publicado, sin tienda ni red externa. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import { experienceManifestSchema } from "@/lib/product-intelligence/experience-resolver";
const script = (path: string) => [...readFileSync(path,"utf8").matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join("\n");
const selector = script("lib/shopify/components/_shared/snippets/df-landing-selector.liquid");
const runtime = script("lib/shopify/components/_shared/snippets/df-pdp-experience.liquid").replace(/\{\{[\s\S]*?\}\}/g, "[]");
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
      expect(await p.locator('[data-df-pdp-component="benefit-usps"]').isHidden()).toBe(false);
      expect(await p.locator('#cart input').inputValue()).toBe("2");expect(await p.locator('#unrelated').textContent()).toBe("Theme extension");
      expect(await p.evaluate(()=>document.querySelector("#cart")?.closest(".shopify-section")?.id)).toBe("main");
    }finally{await context.close();}
  });
  it("hook comparte plan y cambia arquitectura solo por experiencia explícita; popstate restaura legacy",async()=>{
    const {context,p}=await page(manifest,"angle=desk&hook=mirror");try{
      expect(await p.locator(".df-pdp-stream > .shopify-section").evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(["pain", "faq"]);
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

// Las nuevas vistas usan el mismo CSS y controles que el tema. Capturas sin servicios externos.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { mkdirSync } from "node:fs";
import { CATALOG } from "./components/catalog";
import { PREVIEWS } from "@/components/store-preview/registry";
import { FIXTURE_FACTS, EMPTY_FACTS } from "@/lib/store-preview/fixture";
const richIds = ["mechanism", "use-cases", "before-after", "results-timeline", "usage-steps", "product-includes", "customer-stories", "expert-endorsement", "guarantee", "offer-summary"];
const photo = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${color}"/><circle cx="300" cy="300" r="160" fill="white"/></svg>`)}`;
const richImages = { main: [photo("#ddd")], before: [photo("#ddd")], after: [photo("#bcd")], items: [photo("#ddd"), photo("#cbd")], steps: [photo("#ddd"), photo("#cbd")], cases: [photo("#ddd"), photo("#cbd")] };
const css = readFileSync("lib/shopify/components/_shared/assets/df-components.css", "utf8") + readFileSync("lib/shopify/components/_shared/assets/df-rich-pdp.css", "utf8");
const richJs = readFileSync("lib/shopify/components/_shared/assets/df-rich-pdp.js", "utf8");
describe.runIf(process.env.PDP_BROWSER_TEST === "1")("PDP completa · móvil, controles y estados vacíos", () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser.close(); });
  async function richPage(empty = false, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 844 } }), page = await context.newPage();
    const facts = empty ? EMPTY_FACTS : { ...FIXTURE_FACTS, packs: [{ units: 1, price: 29990 }, { units: 2, price: 44990, compareAt: 59980, label: "Pack para compartir" }] };
    const body = richIds.map(id => renderToStaticMarkup(createElement(PREVIEWS[id], { content: empty ? { state: "empty" } : CATALOG.find(c => c.id === id)!.examples[0], facts, images: empty ? {} : richImages }))).join("")
      .replaceAll('data-df-comparison-ready="true"', "");
    await page.route("https://store.test/**", r => r.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif} ${css}</style></head><body><span id="df-product-purchase" tabindex="-1"></span>${body}<script>${richJs}</script></body></html>` }));
    await page.goto("https://store.test/products/demo"); return { page, context };
  }
  it("se adapta a móvil y escritorio sin desbordamiento; compara con teclado y elige usos", async () => {
    for (const width of [390, 1440]) {
      const { page, context } = await richPage(false, width);
      try {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const input = page.locator('[data-df-comparison] input');
        await input.focus(); await input.press("End"); expect(await input.inputValue()).toBe("100");
        await input.press("Home"); expect(await input.inputValue()).toBe("0");
        await input.evaluate((el) => { (el as HTMLInputElement).value = "50"; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.locator('.df-use-cases summary').nth(1).click();
        expect(await page.locator('.df-use-cases details').nth(1).getAttribute("open")).not.toBeNull();
        expect(await page.locator('.df-use-cases details').nth(0).getAttribute("open")).toBeNull();
        mkdirSync("/tmp/df-rich-pdp-qa", { recursive: true });
        await page.screenshot({ path: `/tmp/df-rich-pdp-qa/${width}.png`, fullPage: true });
      } finally { await context.close(); }
    }
  });
  it("sin evidencia todos los estados vacíos quedan visibles", async () => {
    const { page, context } = await richPage(true);
    try { for (const id of richIds) expect(await page.locator(`[data-df-empty="${id}"]`).isVisible()).toBe(true); }
    finally { await context.close(); }
  });
});
