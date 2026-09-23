// Cola de decisiones de Hoy. Los productos salen de Supabase (lib/data/products.ts); las campañas
// siguen siendo de ejemplo (lib/mock/today.ts) hasta conectar Meta Ads.
import "server-only";
import { getProducts } from "@/lib/data/products";
import { TODAY } from "@/lib/mock/today";
import { productHref } from "@/lib/routes";
import type { AttentionEntry, Product, TodaySummary } from "@/lib/types";

/** Ítems de campaña de ejemplo (los de producto ya no aplican: sus productos no existen). */
const CAMPAIGN_ITEMS = TODAY.filter((e) => e.kind === "ads" || e.kind === "ads-up");

function productEntries(products: Product[]): AttentionEntry[] {
  const out: AttentionEntry[] = [];
  for (const p of products) {
    const base = p.stages.find((s) => s.key === "importado");
    const href = productHref(p.id, "importado");
    if (base?.state === "error") {
      out.push({
        id: `optimize-error-${p.id}`,
        group: "primero",
        kind: "error",
        title: "No se pudo optimizar",
        product: p.name,
        detail: base.desc,
        actions: [{ label: "Reintentar", href, variant: "primary" }],
      });
    } else if (base?.state === "review") {
      out.push({
        id: `avatar-review-${p.id}`,
        group: "revisar",
        kind: "review",
        title: "Tu cliente ideal está listo",
        product: p.name,
        actions: [{ label: "Revisar ahora", href, iconEnd: "chevron-right" }],
      });
    } else if (base?.state === "current" && p.reason.startsWith("Sin optimizar")) {
      out.push({
        id: `optimize-${p.id}`,
        group: "revisar",
        kind: "stuck",
        title: "Falta optimizar con IA",
        product: `${p.name} · agrega lo que sabes y sus imágenes`,
        actions: [{ label: "Empezar", href, iconEnd: "chevron-right" }],
      });
    }

    // Etapa Ángulos: se habilita al aprobar el cliente ideal.
    const angles = p.stages.find((s) => s.key === "angulos");
    const anglesHref = productHref(p.id, "angulos");
    if (angles?.state === "error") {
      out.push({
        id: `angles-error-${p.id}`,
        group: "primero",
        kind: "error",
        title: "No se pudieron preparar los ángulos",
        product: p.name,
        detail: angles.desc,
        actions: [{ label: "Reintentar", href: anglesHref, variant: "primary" }],
      });
    } else if (p.anglesPhase === "choose" || p.anglesPhase === "review") {
      const choosing = p.anglesPhase === "choose";
      out.push({
        id: `angles-review-${p.id}`,
        group: "revisar",
        kind: "review",
        title: choosing ? "Elige cómo vender este producto" : "Tus ángulos están listos para revisar",
        product: p.name,
        detail: angles?.desc,
        actions: [{ label: choosing ? "Elegir ángulos" : "Revisar ahora", href: anglesHref, iconEnd: "chevron-right" }],
      });
    } else if (p.anglesPhase === "new") {
      out.push({
        id: `angles-${p.id}`,
        group: "revisar",
        kind: "stuck",
        title: "Falta elegir los ángulos de venta",
        product: `${p.name} · cliente ideal aprobado`,
        actions: [{ label: "Empezar", href: anglesHref, iconEnd: "chevron-right" }],
      });
    }

    // Página del producto (etapa Textos): se habilita con los 2 desarrollos aprobados.
    const copy = p.stages.find((s) => s.key === "textos");
    const copyHref = productHref(p.id, "textos");
    if (p.copyPhase === "failed") {
      out.push({
        id: `copy-error-${p.id}`,
        group: "primero",
        kind: "error",
        title: "No se pudieron escribir los textos",
        product: p.name,
        detail: copy?.desc,
        actions: [{ label: "Reintentar", href: copyHref, variant: "primary" }],
      });
    } else if (p.copyPhase === "review") {
      out.push({
        id: `copy-review-${p.id}`,
        group: "revisar",
        kind: "review",
        title: "La página del producto está lista para revisar",
        product: p.name,
        detail: copy?.desc,
        actions: [{ label: "Revisar ahora", href: copyHref, iconEnd: "chevron-right" }],
      });
    } else if (p.copyPhase === "new") {
      out.push({
        id: `copy-${p.id}`,
        group: "revisar",
        kind: "stuck",
        title: "Falta escribir la página del producto",
        product: `${p.name} · ángulos aprobados`,
        actions: [{ label: "Empezar", href: copyHref, iconEnd: "chevron-right" }],
      });
    }
  }
  return out;
}

/** Decisiones pendientes, ya ordenadas por impacto: errores y dinero primero, revisión, lo detenido. */
export async function getTodayQueue(): Promise<AttentionEntry[]> {
  const entries = productEntries(await getProducts());
  const rank = (e: AttentionEntry) => (e.kind === "error" ? 0 : e.kind === "ads" || e.kind === "ads-up" ? 1 : e.kind === "review" ? 2 : 3);
  return [...entries, ...CAMPAIGN_ITEMS].sort((a, b) => rank(a) - rank(b));
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const [queue, products] = await Promise.all([getTodayQueue(), getProducts()]);
  return {
    date: new Date().toISOString().slice(0, 10),
    pending: queue.length,
    errors: queue.filter((e) => e.kind === "error").length,
    published: products.filter((p) => p.filter === "publicados").length,
  };
}

/** Número de la pestaña Hoy. */
export async function getNavBadges(): Promise<{ hoy: number }> {
  return { hoy: (await getTodayQueue()).length };
}
