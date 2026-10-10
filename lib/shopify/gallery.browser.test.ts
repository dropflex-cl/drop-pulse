/** Opt-in: composición y controles con el slideshow real de Horizon, sin tienda ni red externa. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accentVars } from "@/lib/store-preview/accent";

const theme = join(process.cwd(), "lib/shopify/themes/DropPulse");
const file = (path: string) => readFileSync(join(theme, path), "utf8");
const css = (name: string) =>
  [
    ...file(`snippets/${name}.liquid`).matchAll(
      /{% stylesheet %}([\s\S]*?){% endstylesheet %}/g,
    ),
  ]
    .map((m) => m[1])
    .join("\n");
const selector = file("snippets/df-landing-selector.liquid").replace(
  /<\/?script>/g,
  "",
);
const icons = ["eye", "feather", "shield"];
const benefits = (long = false) =>
  `<ul class="df-gallery-benefits" aria-label="Beneficios principales" role="list">${icons.map((icon, i) => `<li class="df-gallery-benefits__item"><svg class="df-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/></svg><span>${long ? "Una frase de beneficio larga para probar" : ["Uso sencillo", "Ligero y cómodo", "Diseñado para durar"][i]}</span></li>`).join("")}</ul>`;
function html(long = false) {
  const imports = Object.fromEntries(
    ["component", "utilities", "scrolling", "events"].map((name) => [
      `@theme/${name}`,
      `https://gallery.test/assets/${name}.js`,
    ]),
  );
  const vars = Object.entries(accentVars("#873652"))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  const slides = [0, 1, 2]
    .map(
      (i) =>
        `<slideshow-slide ref="slides[]" aria-hidden="${i !== 0}" class="product-media-container"><div class="product-media"><img class="product-media__image" src="/photo-${i}.svg" alt="Producto ${i + 1}"></div></slideshow-slide>`,
    )
    .join("");
  const thumbnails = [0, 1, 2]
    .map(
      (i) =>
        `<button type="button" class="slideshow-control slideshow-controls__thumbnail" ref="thumbnails[]" on:click="/select/${i}" aria-label="Ver imagen ${i + 1}" ${i === 0 ? 'aria-selected="true"' : ""}><img src="/photo-${i}.svg" alt=""></button>`,
    )
    .join("");
  return `<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports })}</script><script>${selector}</script>
  <style>${file("assets/df-components.css")}${css("slideshow-styles")}${css("product-media-container-styles")}${css("df-gallery-benefits")}${css("slideshow-controls")}
  body{margin:0;background:white;font-family:Arial,sans-serif}*{box-sizing:border-box}img{display:block;max-width:100%}media-gallery{display:block}slideshow-container{padding-inline:16px}.product-information{max-width:600px;margin:auto}.product-media{width:100%;height:100%}.product-media__image{width:100%;height:100%}slideshow-controls{display:block}.slideshow-control{padding:0;border:0}.slideshow-controls__thumbnails{padding-inline:16px;gap:8px}.slideshow-controls__thumbnails button{width:64px;aspect-ratio:1;flex:none}.slideshow-control img{width:100%;height:100%;object-fit:contain}</style>
  <script type="module" src="/assets/slideshow.js"></script></head><body><section class="product-information"><media-gallery class="df" style="${vars};--thumbnail-width:64px;--aspect-ratio:1;--minimum-touch-target:44px">
  <slideshow-component ref="slideshow" initial-slide="0" infinite><slideshow-container ref="slideshowContainer"><slideshow-slides ref="scroller" tabindex="-1">${slides}</slideshow-slides>
  <df-landing-content class="df-gallery-benefits-host" data-df-component="df-gallery-benefits"><div data-df-active>${benefits(long)}</div><template data-df-variant="default">${benefits(long)}</template><template data-df-variant="empty" data-angle="empty"></template><script>window.DropFlexLanding.mount(document.currentScript.parentElement);</script></df-landing-content>
  </slideshow-container><slideshow-controls thumbnails pagination-position="center"><div class="slideshow-controls__thumbnails-container" ref="thumbnailsContainer"><div class="slideshow-controls__thumbnails">${thumbnails}</div></div></slideshow-controls></slideshow-component>
  </media-gallery></section><script src="/assets/df-gallery.js" data-autoplay="false" defer></script></body></html>`;
}
describe.runIf(process.env.GALLERY_BROWSER_TEST === "1")(
  "Galería Serena · navegador",
  () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await chromium.launch({ headless: true });
    });
    afterAll(async () => {
      await browser.close();
    });
    async function page(width: number, long = false, reducedMotion = false) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: reducedMotion ? "reduce" : "no-preference",
      });
      const p = await context.newPage();
      await p.route("https://gallery.test/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.startsWith("/assets/"))
          return route.fulfill({
            contentType: "application/javascript",
            body: file(path.slice(1)),
          });
        if (path.endsWith(".svg"))
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect x="180" y="100" width="240" height="400" rx="20" fill="#873652"/></svg>',
          });
        return route.fulfill({ contentType: "text/html", body: html(long) });
      });
      await p.goto("https://gallery.test/products/product");
      await p.waitForFunction(
        () =>
          typeof (
            document.querySelector("slideshow-component") as unknown as {
              select?: unknown;
            }
          ).select === "function",
      );
      return { context, p };
    }
    it.each([320, 390, 1280])(
      "foto, tres tarjetas y miniaturas sin desbordar a %i px",
      async (width) => {
        const { context, p } = await page(width, true);
        try {
          const photo = (await p.locator("slideshow-slides").boundingBox())!;
          const list = (await p.locator(".df-gallery-benefits").boundingBox())!;
          const thumbs = (await p.locator("slideshow-controls").boundingBox())!;
          expect(list.x).toBeGreaterThan(photo.x + photo.width);
          expect(thumbs.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
          expect(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(
            await p
              .locator(".df-gallery-benefits__item")
              .evaluateAll((items) =>
                items.every((item) => item.scrollHeight <= item.clientHeight),
              ),
          ).toBe(true);
          const thumbnailSizes = await p
            .locator('[ref="thumbnails[]"]')
            .evaluateAll((items) =>
              items.map((item) => ({
                width: item.getBoundingClientRect().width,
                height: item.getBoundingClientRect().height,
              })),
            );
          expect(
            thumbnailSizes.every(
              (item) => item.width >= 44 && item.width <= 65,
            ),
            JSON.stringify(thumbnailSizes),
          ).toBe(true);
          if (process.env.GALLERY_SCREENSHOTS)
            await p.screenshot({ path: `/tmp/dropflex-gallery-${width}.png` });
        } finally {
          await context.close();
        }
      },
    );
    it.each([false, true])(
      "miniaturas cambian la foto y conservan beneficios (movimiento reducido: %s)",
      async (reduced) => {
        const { context, p } = await page(390, false, reduced);
        try {
          await p.locator('[ref="thumbnails[]"]').nth(2).click();
          await p.waitForFunction(
            () =>
              (
                document.querySelector("slideshow-component") as unknown as {
                  current: number;
                }
              ).current === 2,
          );
          expect(await p.locator(".df-gallery-benefits__item").count()).toBe(3);
          await p.evaluate(() => {
            history.pushState(null, "", "?angle=empty");
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
          expect(await p.locator(".df-gallery-benefits-host").isHidden()).toBe(
            true,
          );
          const full = (await p.locator("slideshow-slides").boundingBox())!;
          expect(full.width).toBeGreaterThan(350);
        } finally {
          await context.close();
        }
      },
    );
  },
);
