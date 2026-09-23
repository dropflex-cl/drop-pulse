// Datos de ejemplo de la página del producto (etapa Textos), con los textos de
// design-system/reference/bundle.js (TX_OUTLINE, TX_FAQ, TxReview, TxEdit, TxDone).
import { ACCENT_PALETTE } from "@/lib/copy/accent";
import { BLOCKS } from "@/lib/copy/blocks";
import { copyProgress } from "@/lib/copy/progress";
import { productImage } from "@/lib/mock/images";
import { productPosition } from "@/lib/products/stages";
import type { ContentStatus, CopyItem, ProductCopy } from "@/lib/types";

const NOW = "2026-09-24T10:00:00Z";

type Row = [key: string, text: string, extra?: Partial<CopyItem>];

const ROWS: Row[] = [
  ["title", "Corrector de postura ajustable para trabajar sentado sin dolor", { original: "Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única", angle: "primary", note: "Nombra qué es y el dolor que resuelve, como en el ángulo principal." }],
  ["short_name", "Corrector de postura", { note: "Así se llama en el carrito y en los anuncios." }],
  ["short_description", "Alivia la tensión de espalda y hombros mientras trabajas. Ajuste con velcro, talla única.", { angle: "primary", note: "El resultado primero y el dato que lo sostiene." }],
  ["offer_line", "2 por $39.990 · Paga al recibir", { angle: "secondary", note: "La oferta principal con su número exacto y el cierre de confianza." }],
  ["benefit", "Tela transpirable que puedes usar bajo la ropa todo el día", { angle: "primary", note: "Resultado + material de la ficha." }],
  ["benefit", "Se ajusta en segundos con velcro: sirve para tallas S a XL", { angle: "secondary" }],
  ["benefit", "Delgado: no se nota bajo la camisa en la oficina", { angle: "secondary" }],
  [
    "how_it_works",
    "Cuando pasas horas sentado, los hombros se van hacia adelante y la espalda alta carga el peso. El corrector sujeta los hombros atrás con dos bandas elásticas que se cruzan en la espalda: te recuerda la postura sin forzarla. Úsalo 15 minutos al día y sube el tiempo de a poco. Está pensado para quienes trabajan frente al computador.",
    { angle: "primary", original: "Corrector de postura. Material: neopreno. Talla única ajustable." },
  ],
  ["faq", "¿Tengo que pagar antes de recibirlo?\nNo. Pagas en efectivo o con tarjeta cuando el repartidor te entrega el pedido. Si no te lo entregan, no pagas nada.", { angle: "secondary", note: "Responde la objeción más común del pago contra entrega." }],
  ["faq", "¿Se nota bajo la ropa?\nNo: es delgado y se ajusta al cuerpo.", { angle: "primary" }],
  ["faq", "¿Cuánto tiempo al día lo uso?\nEmpieza con 15 minutos y sube de a poco.", { angle: "primary" }],
  ["shipping_payment", "Paga al recibir: en efectivo o con tarjeta cuando te entregan el pedido. Envío gratis a todo Chile.", { missing: "el plazo de entrega y tu WhatsApp", note: "Pago contra entrega y envío gratis, como despacha tu tienda." }],
  ["seo_title", "Corrector de postura ajustable | Envío gratis", { note: "Lo que busca el comprador en Google." }],
  ["seo_description", "Corrector de postura con ajuste de velcro y tela transpirable. Paga al recibir y envío gratis a todo Chile." ],
];

/** Estados por fila según la pantalla de ejemplo (8 de 14 aceptados en la revisión). */
function statuses(state: string): ContentStatus[] {
  if (state === "review") return ["aprobado", "aprobado", "aprobado", "aprobado", "aprobado", "rechazado", "aprobado", "aprobado", "generado", "generado", "generado", "generado", "generado", "generado"];
  if (state === "done") return ROWS.map((_, i) => (i === 5 ? "rechazado" : i === 11 ? "rechazado" : "aprobado"));
  if (state === "complete") return ROWS.map((_, i) => (i === 5 ? "rechazado" : "aprobado"));
  return ROWS.map(() => "generado");
}

function items(state: string): CopyItem[] {
  const st = statuses(state);
  const seen = new Map<string, number>();
  return ROWS.map(([key, text, extra], i) => {
    const def = BLOCKS.find((b) => b.key === key)!;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return {
      id: `c${i + 1}`,
      key,
      label: def.max > 1 ? `${def.label} ${n}` : def.label,
      section: def.section,
      text: key === "short_name" && (state === "done" || state === "complete") ? "Corrector de postura" : text,
      edited: key === "short_name" && (state === "done" || state === "complete"),
      status: st[i],
      required: def.required,
      limit: def.limit,
      unit: def.unit,
      ...extra,
    };
  });
}

export function fixture(state: string): ProductCopy {
  const withItems = ["review", "done", "complete", "stale", "fresh"].includes(state);
  const list = withItems ? items(state === "stale" ? "review" : state) : [];
  const run: ProductCopy["run"] =
    state === "writing"
      ? { id: "r1", status: "running", createdAt: NOW }
      : state === "failed"
        ? { id: "r1", status: "failed", error: "La IA escribió textos que no cumplen las reglas. Toca Reintentar.", createdAt: NOW }
        : withItems
          ? { id: "r1", status: "succeeded", createdAt: NOW }
          : undefined;
  const brief = (role: "primary" | "secondary", status: ContentStatus) => ({ role, name: role === "primary" ? "Mecanismo único" : "Edad e identidad", status, generation: "succeeded" as const });
  const locked = state === "locked";
  const pos = productPosition({
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado", createdAt: NOW },
    reviews: { pending: 0, approved: 30, total: 30 },
    angles: { ranking: { status: "succeeded", confirmed: true }, briefs: [brief("primary", "aprobado"), brief("secondary", locked ? "revision" : "aprobado")] },
    copy: run ? { run: { status: run.status, error: run.error }, progress: copyProgress(list) } : null,
  });
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
      copyPhase: pos.copyPhase,
      supplierCost: 6900,
      price: 24990,
      currency: "CLP",
    },
    // Con la página lista, un color ya elegido (Esmeralda); en los demás, sin elegir.
    accent: state === "done" || state === "complete" ? ACCENT_PALETTE[4].hex : null,
    locked,
    run,
    items: list,
    stale: state === "stale",
    noGuarantee: true,
  };
}
