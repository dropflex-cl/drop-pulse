// Datos de ejemplo de la etapa Anuncios (PantallasAnuncios1 y AnunciosEscritorio1): el corrector de
// postura con 3 creativos, como AdCreatives y AD_TREE de design-system/reference/bundle.js.
import { carouselFixture } from "@/lib/ads/carousel-fixtures";
import { buildPreset } from "@/lib/ads/presets";
import { productImage } from "@/lib/mock/images";
import { productPresentation } from "@/lib/products/presentation";
import type { AdMedia, ProductAds } from "@/lib/types";

const TEXTS = {
  primary_texts: [
    "¿Terminas el día con la espalda cargada? El corrector sujeta tus hombros atrás mientras trabajas.\n\n2 por $39.990 · Paga al recibir",
    "Después de los 35, la postura se nota en cada foto. Tela delgada que no se ve bajo la camisa.\n\n2 por $39.990 · Paga al recibir",
  ],
  headlines: ["Corrector de postura", "2 por $39.990 · Paga al recibir"],
  description: "Envío gratis · Paga al recibir",
};

const MEDIA: AdMedia[] = [
  { id: "00000000-0000-4000-8000-000000000001", kind: "video", name: "ugc-espalda.mp4", url: "", ratio: "9:16", angleSlot: 1, format: "ugc", durationS: 18, status: "ready", error: null },
  { id: "00000000-0000-4000-8000-000000000002", kind: "image", name: "antes-despues.jpg", url: productImage(3, 1), ratio: "1:1", angleSlot: 2, format: null, durationS: null, status: "ready", error: null },
  { id: "00000000-0000-4000-8000-000000000003", kind: "image", name: "problema.jpg", url: productImage(0, 1), ratio: "4:5", angleSlot: null, format: null, durationS: null, status: "ready", error: null },
];

/** Los textos de hoy cuando el borrador quedó con ángulos anteriores (?state=angles). */
const NEW_TEXTS = {
  ...TEXTS,
  primary_texts: [
    "No es la silla: es cómo te sientas 9 horas. El corrector sujeta tus hombros atrás sin que se note.\n\n2 por $39.990 · Paga al recibir",
    "Adiós a la faja rígida. Tela delgada con ajuste cruzado que no aprieta la cintura.\n\n2 por $39.990 · Paga al recibir",
    "A las 4 de la tarde la espalda ya pesa. Corrígela mientras trabajas.\n\n2 por $39.990 · Paga al recibir",
  ],
};

/** ?state=locked|meta|empty|ready|launching|failed|angles|relaunch (el producto ya tiene una campaña) */
export function fixture(state: string): ProductAds {
  const pageDone = state !== "locked";
  const pos = productPresentation({ content: { hasContent: pageDone, missing: pageDone ? [] : ["Guarda la ficha del producto"], stale: false } });
  const carousel = carouselFixture();
  const sample: AdMedia = { id: "00000000-0000-4000-8000-000000000004", kind: "carousel", name: "Carrusel de prueba", url: productImage(3, 1), ratio: "4:5", angleSlot: null, format: null, durationS: null, status: "ready", error: null,
    carousel: { id: "00000000-0000-4000-8000-000000000004", content: carousel, etag: "a".repeat(64), ready: true, problem: null,
      cards: carousel.cards.map((c, i) => ({ ...c, storage_path: "fixture.jpg", width: 800, height: 1000, size_bytes: 100, problem: null, url: productImage(i, 1) })) } };
  const media = state === "empty" ? [] : state === "carousel" ? [...MEDIA, sample] : MEDIA;
  const preset = buildPreset("impulso", { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: media.map((m) => m.id), texts: TEXTS });
  if (state === "ready" || state === "launching" || state === "failed") preset.launch.min_age = 23;
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Corrector de postura",
      image: productImage(1, 1),
      sku: "",
      filter: pos.filter,
      reason: pos.reason,
      tone: pos.tone,
      sections: pos.sections,
      publicationReady: pos.publicationReady,
      summary: pos.summary,
      status: pos.status,
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    locked: state === "locked" ? "Termina la página del producto para lanzar anuncios." : state === "meta" ? "Conecta Meta Ads y elige cuenta, página y píxel en Ajustes." : null,
    meta: { ready: state !== "meta", account: "DropFlex Chile", page: "Corrector Pro", pixel: "Píxel tienda" },
    currency: "CLP",
    timezone: "America/Santiago",
    country: "CL",
    cpaLimit: 6000,
    spendCap: state === "empty" ? null : 60000,
    productUrl: "https://corrector.cl/products/corrector-de-postura",
    draft: {
      id: state === "empty" ? null : "d1",
      name: "Corrector de postura · Testeo",
      structure: "abo",
      templateKey: "impulso",
      templateId: null,
      launch: preset.launch,
      engine: preset.engine,
      status: state === "launching" ? "launching" : state === "failed" ? "failed" : "draft",
      progress: state === "launching" ? { step: "Subiendo creativos", done: 2, total: 3 } : null,
      error: state === "failed" ? "Meta rechazó el conjunto 2: revisa el público." : null,
    },
    media,
    templates: [],
    campaigns:
      state === "relaunch"
        ? [{ id: "00000000-0000-4000-8000-0000000000c1", name: "Corrector de postura | ABO | Video UGC + Imagen | 20-09-2026", structure: "abo", status: "active", launchedAt: "2026-09-20T12:00:00Z", publishedAt: "2026-09-20T12:05:00Z" }]
        : [],
    defaultTexts: state === "angles" ? NEW_TEXTS : TEXTS,
    draftAngles: state === "angles" ? { stale: true, oldCreatives: [MEDIA[1].id], newCreatives: [] } : null,
    source: null,
    sourceId: null,
  };
}
