// Datos de ejemplo de la etapa Anuncios (PantallasAnuncios1 y AnunciosEscritorio1): el corrector de
// postura con 3 creativos, como AdCreatives y AD_TREE de design-system/reference/bundle.js.
import { buildPreset } from "@/lib/ads/presets";
import { copyProgress } from "@/lib/copy/progress";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { AdMedia, ProductAds } from "@/lib/types";

const NOW = "2026-09-24T10:00:00Z";
const TEXTS = {
  primary_texts: [
    "¿Terminas el día con la espalda cargada? El corrector sujeta tus hombros atrás mientras trabajas.\n\n2 por $39.990 · Paga al recibir",
    "Después de los 35, la postura se nota en cada foto. Tela delgada que no se ve bajo la camisa.\n\n2 por $39.990 · Paga al recibir",
  ],
  headlines: ["Corrector de postura", "2 por $39.990 · Paga al recibir"],
  description: "Envío gratis · Paga al recibir",
};

const MEDIA: AdMedia[] = [
  { id: "00000000-0000-4000-8000-000000000001", kind: "video", name: "ugc-espalda.mp4", url: "", ratio: "9:16", durationS: 18, status: "ready", error: null },
  { id: "00000000-0000-4000-8000-000000000002", kind: "image", name: "antes-despues.jpg", url: productImage(3, 1), ratio: "1:1", durationS: null, status: "ready", error: null },
  { id: "00000000-0000-4000-8000-000000000003", kind: "image", name: "problema.jpg", url: productImage(0, 1), ratio: "4:5", durationS: null, status: "ready", error: null },
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

/** ?state=locked|meta|empty|ready|launching|failed|angles */
export function fixture(state: string): ProductAds {
  const pageDone = state !== "locked";
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado", createdAt: NOW },
    angles: { ranking: { status: "succeeded", confirmed: true }, briefs: [] },
    copy: { run: { status: "succeeded" }, progress: pageDone ? { ...copyProgress([]), complete: true } : copyProgress([]) },
    ads: { metaReady: state !== "meta", campaigns: 0, launching: state === "launching" },
  });
  const media = state === "empty" ? [] : MEDIA;
  const preset = buildPreset("impulso", { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: media.map((m) => m.id), texts: TEXTS });
  if (state === "ready" || state === "launching" || state === "failed") preset.launch.min_age = 23;
  return {
    product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Corrector de postura",
      image: productImage(1, 1),
      sku: "",
      filter: pos.filter,
      meter: pos.meter,
      reason: pos.reason,
      tone: pos.tone,
      nextStage: pos.nextStage,
      stages: pos.stages,
      summary: pos.summary,
      status: pos.status,
      copyPhase: pageDone ? "done" : "review",
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
    productUrl: "https://corrector.myshopify.com/products/corrector-de-postura",
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
    campaigns: [],
    defaultTexts: state === "angles" ? NEW_TEXTS : TEXTS,
    draftAngles: state === "angles" ? { stale: true, oldCreatives: [MEDIA[1].id], newCreatives: [] } : null,
    source: null,
    sourceId: null,
  };
}
