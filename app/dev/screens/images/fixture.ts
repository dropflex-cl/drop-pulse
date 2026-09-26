// Datos de ejemplo de la etapa Imágenes (/dev/screens/images).
import { COVER, GALLERY, GALLERY_MIN, GALLERY_SHOTS, GIFS, SLOT_FORMAT, SLOT_RATIO, benefitSlot } from "@/lib/page-images/catalog";
import { productImage } from "@/lib/mock/images";
import { IMAGE_COST_BY_PROVIDER } from "@/lib/image-provider";
import type { PageImageOptionView, PageImageSlotView, PageImagesState } from "@/lib/types";
import { fixture as publishFixture } from "../publish/fixture";

const NOW = "2026-09-26T10:00:00Z";

const GALLERY_NAMES = ["Ambiente", "Infografía del rodillo", "Comparativa con la piedra", "Lo que llega en la caja", "En uso en el talón"];
const BENEFITS = ["Lima la piel dura en minutos, sin refregar", "Dos rodillos: uno desgasta y el otro pule", "Carga por USB y dura varias sesiones"];

const option = (id: string, shotId: string, i: number, over: Partial<PageImageOptionView> = {}): PageImageOptionView => ({
  id,
  source: "ai",
  shotId,
  render: "succeeded",
  attempt: 1,
  src: productImage(i, i % 4),
  qa: { pass: true, issues: [] },
  chosen: false,
  discarded: false,
  createdAt: NOW,
  ...over,
});

const slot = (key: string, title: string, over: Partial<PageImageSlotView>): PageImageSlotView => {
  const kind = key === COVER ? "cover" : key === GALLERY ? "gallery" : key === GIFS ? "gif" : "benefit";
  return { key, kind, title, required: kind === "cover" || kind === "gallery", format: SLOT_FORMAT[kind], ratio: SLOT_RATIO[kind], shots: [], options: [], ...over };
};

/**
 * ?state=fresh|generated|benefits|failed
 * - fresh: todavía no hay galería (el costo de «Generar la galería» es la portada y 4 de galería).
 * - generated: la IA armó la galería; van solas la portada y 4 de galería, la quinta y los beneficios quedan sin generar.
 * - benefits: el comerciante pidió los beneficios y se están generando.
 * - failed: una de las que van solas falló: «Generar los vacíos» vuelve a ser la acción principal.
 */
export function fixture(state: string) {
  const { product } = publishFixture("published");
  const shots = state !== "fresh";
  const galleryShots = GALLERY_NAMES.slice(0, GALLERY_SHOTS).map((name, i) => ({ id: `g${i + 1}`, name, type: "Galería", look: `${name}: el removedor rosado sobre fondo rosa pálido.`, auto: i < GALLERY_MIN }));
  const galleryOptions = galleryShots
    .filter((s) => s.auto && !(state === "failed" && s.id === "g3"))
    .map((s, i) => option(`o-${s.id}`, s.id, i + 1, { chosen: state !== "failed", order: state !== "failed" ? i + 1 : undefined }));
  if (state === "failed") galleryOptions.push(option("o-g3", "g3", 3, { render: "failed", src: undefined, qa: undefined, error: "Higgsfield no generó la imagen. Toca Generar otra." }));

  const slots: PageImageSlotView[] = [
    slot(COVER, "Portada", {
      shots: shots ? [{ id: "c1", name: "Portada limpia rosada", type: "Producto solo", look: "El removedor al centro sobre rosa pálido, sombra suave.", auto: true }] : [],
      options: shots ? [option("o-c1", "c1", 0, { chosen: true })] : [],
    }),
    slot(GALLERY, "Galería", { shots: shots ? galleryShots : [], options: shots ? galleryOptions : [] }),
    ...(shots
      ? BENEFITS.map((text, i) =>
          slot(benefitSlot(i + 1), `Beneficio ${i + 1}`, {
            pairs: text,
            shots: [{ id: `b${i + 1}`, name: text.split(",")[0], type: "Beneficio", look: "El rodillo en primer plano sobre la piel del talón.", auto: false }],
            options: state === "benefits" ? [option(`o-b${i + 1}`, `b${i + 1}`, i, { render: i ? "queued" : "running", src: undefined, qa: undefined })] : [],
          }),
        )
      : []),
    slot(GIFS, "GIFs", {}),
  ];

  const data: PageImagesState = {
    locked: null,
    connected: true,
    imageProvider: { value: "higgsfield", saved: "higgsfield", options: [{ id: "higgsfield", name: "Higgsfield", available: true }] },
    cannotGenerate: null,
    run: shots ? { id: "r1", status: "succeeded", createdAt: NOW } : undefined,
    slots,
    references: [1, 2].map((i) => ({ id: `ref-${i}`, src: productImage(i + 2, 0), alt: "" })),
    imageCostUsd: IMAGE_COST_BY_PROVIDER.higgsfield,
    stale: false,
  };
  return { product, data };
}
