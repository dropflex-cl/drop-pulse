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

export function productEntries(products: Product[]): AttentionEntry[] {
  return products.flatMap<AttentionEntry>(p => {
    if (p.contentState === "error") return [{ id: `publish-error-${p.id}`, group: "primero" as const, kind: "error" as const,
      title: "No se pudo publicar", product: p.name, detail: p.reason,
      actions: [{ label: "Ver publicación", href: productHref(p.id, "publicar"), variant: "primary" as const }] }];
    if (p.contentState === "updated" || p.contentState === "ready") return [{ id: `publish-${p.id}`, group: "revisar" as const, kind: "stuck" as const,
      title: p.contentState === "updated" ? "Hay cambios sin publicar" : "Listo para publicar", product: p.name,
      detail: p.contentState === "updated" ? p.publicationChanges?.join(" · ") : "La página guardada cumple los requisitos de publicación.",
      actions: [{ label: "Ver producto", href: productHref(p.id), iconEnd: "chevron-right" as const }] }];
    return [];
  });
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
