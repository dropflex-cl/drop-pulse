// Datos de ejemplo de la etapa Creativos (docs/spec-creativos.md §6.6). Las piezas usan las
// ilustraciones genéricas de lib/mock/images.ts: aquí solo importa cómo se ve la pantalla.
import { IMAGE_COST_USD } from "@/lib/creatives/catalog";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { CreativeAssetView, CreativeConceptView, ProductCreatives } from "@/lib/types";
import { videosFixture } from "./videos-fixture";

const NOW = "2026-09-24T10:00:00Z";

const asset = (id: string, over: Partial<CreativeAssetView> = {}): CreativeAssetView => ({
  id,
  ratio: "1:1",
  provider: "higgsfield",
  attempt: 1,
  render: "succeeded",
  src: productImage(Number(id.replace(/\D/g, "")) || 0, 1),
  width: 1024,
  height: 1024,
  qa: { pass: true, issues: [] },
  status: "generado",
  inAds: false,
  createdAt: NOW,
  ...over,
});

function concepts(state: string): CreativeConceptView[] {
  const generated = state !== "concepts";
  const list: CreativeConceptView[] = [
    {
      id: "k1",
      angle: 1,
      angleName: "Mecanismo único",
      family: "explainer",
      familyName: "Explicativo",
      name: "Dentro de cada cápsula",
      why: "Explica por qué funciona desde adentro: quien probó soluciones por fuera entiende la diferencia.",
      look: "El frasco al centro sobre crema, con cuatro callouts finos en azul marino que apuntan a la etiqueta.",
      preset: { id: "00f991c0-2b75-5f44-ac8c-821b51f64193", name: "Callout Fan", group: "Proof & Specs" },
      texts: [
        { role: "headline", text: "DENTRO DE CADA CÁPSULA" },
        { role: "callout", text: "Cepas probióticas para la flora íntima" },
        { role: "callout", text: "pH saludable, ayuda a mantener el equilibrio" },
        { role: "callout", text: "60 cápsulas veganas, sin sabor" },
      ],
      edited: false,
      assets: generated ? [asset("a1", { status: state === "done" ? "aprobado" : "generado", inAds: state === "done" })] : [],
    },
    {
      id: "k2",
      angle: 1,
      angleName: "Mecanismo único",
      family: "hero",
      familyName: "Producto hero",
      name: "Equilibrio que se siente",
      why: "Nombra la sensación, no el síntoma: se lee en un segundo y no apunta a una condición.",
      preset: { id: "f53dec43-8292-53fc-b944-f70e8086b6f0", name: "Capsule Ring", group: "Proof & Specs" },
      texts: [
        { role: "headline", text: "equilibrio que se siente." },
        { role: "badge", text: "FLORA ÍNTIMA en equilibrio" },
        { role: "badge", text: "60 CÁPSULAS VEGANAS" },
      ],
      edited: true,
      assets: generated
        ? [
            asset("a2", { qa: { pass: false, issues: ["Agregó «VAGINAL PROBIOTIC»."] } }),
            asset("a3", { attempt: 2, render: state === "rendering" ? "running" : "succeeded", src: state === "rendering" ? undefined : productImage(3, 1) }),
            asset("a4", { ratio: "9:16", width: 752, height: 1344, render: state === "rendering" ? "queued" : "succeeded", error: state === "rendering" ? "Higgsfield está procesando otras imágenes tuyas. La tuya sigue en cola." : undefined, src: state === "rendering" ? undefined : productImage(4, 1) }),
          ]
        : [],
    },
    {
      id: "k5",
      angle: 1,
      angleName: "Mecanismo único",
      family: "whatsapp_chat",
      familyName: "Chat de WhatsApp",
      name: "Cami y su rutina de noche",
      why: "Una amiga responde la duda del lector («¿de verdad funciona?») con lo que dicen las reseñas.",
      texts: [],
      chat: {
        contact_name: "Cami 🌸",
        contact_gender: "woman",
        clock: "21:48",
        messages: [
          { from: "friend", text: "Amiga, no sabes lo que me está pasando con las cápsulas que te conté", time: "21:40", photo: false },
          { from: "friend", text: "Mira, las tomo cada mañana y me siento mucho más cómoda", time: "21:41", photo: true },
          { from: "me", text: "Jaja las he visto en TikTok, ¿de verdad funcionan?", time: "21:43", photo: false },
          { from: "friend", text: "Demasiado, y son súper fáciles de tomar. Pagué cuando me llegaron", time: "21:45", photo: false },
          { from: "me", text: "Ya, pásame el link porfa", time: "21:47", photo: false },
        ],
      },
      edited: false,
      assets: generated ? [asset("a7", { ratio: "9:16", width: 752, height: 1344, src: productImage(5, 1) })] : [],
    },
    {
      id: "k3",
      angle: 2,
      angleName: "Enemigo común",
      family: "proof",
      familyName: "Comparativa",
      name: "¿Por qué cambiarse?",
      why: "Contrasta con la práctica que ya probó, sin nombrar marcas.",
      look: "A la izquierda el frasco con dos cápsulas; a la derecha una tarjeta blanca con la tabla ✓/✗, sobre rosado y menta.",
      preset: { id: "bea538c0-cb41-4cc3-a435-71d65990a938", name: "Problem → Solution", group: "Problem Solved" },
      texts: [
        { role: "headline", text: "¿Por qué cambiarse a URO?" },
        { role: "table_header", text: "URO" },
        { role: "table_header", text: "Lavados perfumados" },
        { role: "table_row", text: "Actúa desde adentro" },
        { role: "table_row", text: "Respeta el pH natural" },
      ],
      edited: false,
      assets: generated
        ? [
            asset("a5", { render: "failed", src: undefined, qa: undefined, error: "Higgsfield rechazó la imagen por sus reglas de contenido. Cambia los textos o la escena y genera de nuevo." }),
            asset("a6", { ratio: "9:16", render: "failed", src: undefined, qa: undefined, recoverable: true, error: "No pudimos conectarnos con Higgsfield. Intenta de nuevo en un momento." }),
          ]
        : [],
    },
    {
      id: "k4",
      angle: 2,
      angleName: "Enemigo común",
      family: "offer",
      familyName: "Oferta y pack",
      name: "Pack de 2",
      why: "Retargeting: el pack recomendado con el cierre de confianza.",
      preset: { id: "5209b434-ba89-5063-a75b-e47a23f7f975", name: "Giant Pack Stage", group: "Hero Spotlight" },
      texts: [
        { role: "headline", text: "2 por $37.490" },
        { role: "badge", text: "Paga al recibir" },
      ],
      edited: false,
      assets: [],
    },
  ];
  return list;
}

export function fixture(state: string, video = "none"): ProductCreatives {
  const withConcepts = ["concepts", "rendering", "review", "done"].includes(state);
  const list = withConcepts ? concepts(state) : [];
  const assets = list.flatMap((c) => c.assets);
  const run: ProductCreatives["run"] =
    state === "proposing"
      ? { id: "r1", status: "running", createdAt: NOW }
      : state === "failed"
        ? { id: "r1", status: "failed", error: "La IA propuso anuncios que no cumplen las reglas. Toca Reintentar.", createdAt: NOW }
        : withConcepts
          ? { id: "r1", status: "succeeded", createdAt: NOW }
          : undefined;
  const brief = (slot: number) => ({ slot, name: slot === 1 ? "Mecanismo único" : "Enemigo común", status: "aprobado" as const, generation: "succeeded" as const });
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado", createdAt: NOW },
    angles: state === "locked" ? { ranking: { status: "succeeded", confirmed: true }, briefs: [brief(1)] } : { ranking: { status: "succeeded", confirmed: true }, briefs: [brief(1), brief(2)] },
    creatives: {
      connected: state !== "key",
      running: state === "proposing",
      concepts: list.length,
      rendering: assets.filter((a) => a.render === "queued" || a.render === "running").length,
      pending: assets.filter((a) => a.render === "succeeded" && a.status === "generado").length,
      approved: assets.filter((a) => a.status === "aprobado").length,
    },
  });
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Probiótico íntimo 60 cápsulas",
      image: productImage(2, 1),
      sku: "",
      filter: pos.filter,
      meter: pos.meter,
      reason: pos.reason,
      tone: pos.tone,
      nextStage: pos.nextStage,
      stages: pos.stages,
      summary: pos.summary,
      status: pos.status,
      supplierCost: 6000,
      price: 24990,
      currency: "CLP",
    },
    locked: state === "locked" ? "Aprueba los 2 desarrollos de Ángulos para crear anuncios." : state === "key" ? "Conecta tu cuenta de Higgsfield en Ajustes para generar anuncios." : null,
    connected: state !== "key",
    imageProvider: {
      value: state === "key" ? null : "higgsfield",
      saved: null,
      options: [
        { id: "higgsfield", name: "Higgsfield", available: state !== "key", ...(state === "key" ? { reason: "Conecta tu cuenta de Higgsfield en Ajustes." } : {}) },
        { id: "gemini", name: "Gemini", available: state !== "key", ...(state === "key" ? { reason: "Conecta tu cuenta de Gemini en Ajustes." } : {}) },
      ],
    },
    run,
    concepts: list,
    imageCostUsd: IMAGE_COST_USD,
    videos: videosFixture(video),
  };
}
