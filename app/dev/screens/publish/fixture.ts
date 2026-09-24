// Datos de ejemplo de la etapa Publicar (/dev/screens/publish).
import { ACCENT_PALETTE } from "@/lib/copy/accent";
import { productImage } from "@/lib/mock/images";
import { productPosition, type PublishFacts } from "@/lib/products/stages";
import type { Product, PublishState } from "@/lib/types";

const NOW = "2026-09-24T10:00:00Z";

const PLAN: PublishState["plan"] = {
  title: "Corrector de postura ajustable para trabajar sentado",
  components: ["Estrellas", "Beneficios", "Disponibilidad", "Entrega", "Foto y razones", "Preguntas"],
  images: 7,
  packs: [
    { units: 1, price: 24990, label: "1 unidad" },
    { units: 2, price: 37990, label: "2 unidades" },
    { units: 3, price: 49990, label: "3 unidades" },
  ],
  reviews: 12,
  accent: ACCENT_PALETTE[0].hex,
  policies: ["Pago al recibir", "Envío gratis", "Entrega en 3 a 5 días", "Cambios por 30 días"],
};

export function fixture(state: string): { product: Product; data: PublishState } {
  const theme: PublishState["theme"] =
    state === "installing"
      ? { status: "installing", outdated: false }
      : ["preview", "publishing"].includes(state)
        ? { status: "preview", name: "DropFlex 3f9a1c2b7d", previewUrl: "https://tutienda.myshopify.com/?preview_theme_id=1", outdated: state === "preview" }
        : ["published", "stale", "error"].includes(state)
          ? { status: "published", name: "DropFlex 3f9a1c2b7d", previewUrl: "https://tutienda.myshopify.com/?preview_theme_id=1", outdated: false }
          : { status: "none", outdated: false };
  const publication: PublishState["publication"] =
    state === "publishing"
      ? { status: "publishing", stale: false }
      : state === "published" || state === "stale"
        ? { status: "published", publishedAt: NOW, productUrl: "https://tutienda.myshopify.com/products/corrector", stale: state === "stale" }
        : state === "error"
          ? { status: "error", error: "Shopify rechazó una imagen: el archivo pesa más de 20 MB.", stale: false }
          : null;
  const data: PublishState = {
    shop: "tutienda.myshopify.com",
    connection: state === "permissions" ? "Dale permiso a DropFlex para instalar el tema, subir imágenes y dejar tus productos a la venta." : null,
    needsPermissions: state === "permissions",
    theme,
    missing: state === "locked" ? ["Elige la portada en Imágenes.", "Guarda el precio y los packs en Información base."] : [],
    plan: PLAN,
    currency: "CLP",
    publication,
  };
  const publish: PublishFacts | null = publication ? { status: publication.status, error: publication.error } : null;
  const brief = (role: "primary" | "secondary") => ({ role, name: role === "primary" ? "Mecanismo único" : "Edad e identidad", status: "aprobado" as const, generation: "succeeded" as const });
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado", createdAt: NOW },
    reviews: { pending: 0, approved: 12, total: 12 },
    angles: { ranking: { status: "succeeded", confirmed: true }, briefs: [brief("primary"), brief("secondary")] },
    copy: { run: { status: "succeeded" }, progress: { total: 13, enabled: 6, listing: "approved", complete: true } },
    images: state === "locked" ? { running: false, rendering: 0, options: 6, cover: false, gallery: 2 } : { running: false, rendering: 0, options: 8, cover: true, gallery: 5 },
    publish,
  });
  const product: Product = {
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
    anglesPhase: pos.anglesPhase,
    copyPhase: pos.copyPhase,
    supplierCost: 6900,
    price: 24990,
    currency: "CLP",
  };
  return { product, data };
}
