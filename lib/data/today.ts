// Cola de decisiones de Hoy. Los productos salen de Supabase (lib/data/products.ts) y las campañas de
// lo que decidió el motor (lib/data/campaigns.ts › campaignAttention, docs/spec-anuncios.md §11).
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { campaignAttention } from "@/lib/data/campaigns";
import { getProducts, productsWithPositions } from "@/lib/data/products";
import { listProductRows } from "@/lib/products/store";
import { sessionUser } from "@/lib/integrations/session";
import { changeText } from "@/lib/pipeline/ads-engine";
import { money } from "@/lib/format";
import { productHref } from "@/lib/routes";
import type { AttentionEntry, Product, TodaySummary } from "@/lib/types";

/** Decisiones pendientes del motor, campañas que no se pudieron leer y cambios automáticos del día. */
const campaignEntries = cache(async (uid: string): Promise<AttentionEntry[]> => {
  const { pending, failing, autoToday } = await campaignAttention(uid);
  const out: AttentionEntry[] = [];
  for (const c of failing) {
    out.push({
      id: `campaign-error-${c.id}`,
      group: "primero",
      kind: "error",
      title: "No pudimos leer una campaña en Meta",
      product: c.name,
      detail: c.sync_error ?? undefined,
      actions: [{ label: "Ver campaña", href: `/campaigns/${c.id}`, variant: "primary" }],
    });
  }
  for (const d of pending) {
    const href = `/campaigns/${d.campaign_id}`;
    if (d.verdict === "pause") {
      out.push({ id: `decision-${d.id}`, group: "primero", kind: "ads", title: "Pausar lo que pierde dinero", product: d.campaign.name, detail: d.reason, actions: [{ label: "Revisar", href, variant: "primary", iconEnd: "chevron-right" }] });
    } else if (d.verdict === "scale") {
      out.push({
        id: `decision-${d.id}`,
        group: "primero",
        kind: "ads-up",
        title: `Subir a ${money(Number(d.suggested_budget), d.campaign.currency)}`,
        product: d.campaign.name,
        detail: d.reason,
        actions: [{ label: "Revisar", href, variant: "primary", iconEnd: "chevron-right" }],
      });
    } else if (d.verdict === "winners") {
      out.push({ id: `decision-${d.id}`, group: "revisar", kind: "ads-up", title: "Tienes ganadores para una CBO", product: d.campaign.name, detail: d.reason, actions: [{ label: "Ver campaña", href, iconEnd: "chevron-right" }] });
    }
  }
  for (const ch of autoToday) {
    out.push({
      id: `auto-${ch.id}`,
      group: "revisar",
      kind: ch.action === "pause" ? "ads" : "ads-up",
      title: `El motor hizo un cambio: ${changeText(ch, ch.campaign.currency).toLowerCase()}`,
      product: ch.campaign.name,
      actions: [{ label: "Ver y deshacer", href: `/campaigns/${ch.campaign_id}`, iconEnd: "chevron-right" }],
    });
  }
  return out;
});

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
  const user = await sessionUser();
  const [products, campaigns] = await Promise.all([getProducts(), user ? campaignEntries(user.id) : []]);
  const rank = (e: AttentionEntry) => (e.kind === "error" ? 0 : e.kind === "ads" || e.kind === "ads-up" ? 1 : e.kind === "review" ? 2 : 3);
  return [...productEntries(products), ...campaigns].sort((a, b) => rank(a) - rank(b));
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

/**
 * Cuántas decisiones tiene Hoy, en caché por comerciante: la navegación lo muestra en todas las
 * pantallas y no vale recalcular el catálogo entero en cada una. Puede ir hasta 30 s atrasado
 * (Hoy mismo siempre lee la cola al día). Sin cookies: recibe el usuario.
 */
async function todayCount(uid: string): Promise<number> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  cacheTag(`today:${uid}`);
  const [products, campaigns] = await Promise.all([listProductRows(uid).then((rows) => productsWithPositions(uid, rows.filter((r) => !r.is_upsell), { images: false })), campaignEntries(uid)]);
  return productEntries(products).length + campaigns.length;
}

/** Número de la pestaña Hoy. */
export async function getNavBadges(): Promise<{ hoy: number }> {
  const user = await sessionUser();
  return { hoy: user ? await todayCount(user.id) : 0 };
}
