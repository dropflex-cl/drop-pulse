// La etapa Anuncios del producto (docs/spec-anuncios.md §7): el borrador del configurador, sus
// creativos, las plantillas propias y las campañas ya creadas.
import "server-only";
import { cache } from "react";
import { adsContext, getDraft, listCampaignRows, listMediaRows, listTemplates, presetFor, toAdMedia, type AdsContext, type CampaignRow } from "@/lib/ads/store";
import { DEFAULT_PRESET } from "@/lib/ads/presets";
import { draftAngles } from "@/lib/ads/angles";
import { sessionUser } from "@/lib/integrations/session";
import { type ProductRow } from "@/lib/products/store";
import type { AdCampaignSummary, AdDraft, ProductAds } from "@/lib/types";
import { getProduct, productRow } from "./products";

function lockReason(copyDone: boolean, ctx: AdsContext): string | null {
  if (!copyDone) return "Termina la página del producto para lanzar anuncios.";
  if (!ctx.metaReady) return "Conecta Meta Ads y elige cuenta, página y píxel en Ajustes.";
  return null;
}

function toDraft(row: CampaignRow | null, ctx: AdsContext, product: ProductRow): AdDraft {
  if (row) {
    return {
      id: row.id,
      name: row.name,
      structure: row.structure,
      templateKey: row.template_key,
      templateId: row.template_id,
      launch: row.launch,
      engine: row.engine,
      // Un lanzamiento que falla vuelve el borrador a `draft` con su error (y todo lo creado, revertido).
      status: row.status === "launching" ? "launching" : row.error ? "failed" : "draft",
      progress: row.progress,
      error: row.error,
    };
  }
  const preset = presetFor(DEFAULT_PRESET, ctx);
  return {
    id: null,
    name: `${product.title.slice(0, 60)} · Testeo`,
    structure: preset.structure,
    templateKey: DEFAULT_PRESET,
    templateId: null,
    launch: preset.launch,
    engine: preset.engine,
    status: "draft",
    progress: null,
    error: null,
  };
}

const toSummary = (r: CampaignRow): AdCampaignSummary => ({ id: r.id, name: r.name, structure: r.structure, status: r.status, launchedAt: r.launched_at, publishedAt: r.published_at });

/**
 * Todo lo de la etapa sin el producto: lo que devuelve GET /api/products/[id]/ads. Los lanzamientos
 * colgados los cierra el sondeo antes de llamar aquí (y el mantenimiento, lib/products/housekeeping.ts).
 */
export async function adsState(uid: string, row: ProductRow, copyDone: boolean | Promise<boolean>, sourceCampaignId: string | null = null): Promise<Omit<ProductAds, "product">> {
  const [ctx, draft, media, templates, campaigns] = await Promise.all([
    adsContext(uid, row),
    getDraft(uid, row.id, sourceCampaignId),
    listMediaRows(uid, row.id),
    listTemplates(uid),
    listCampaignRows(uid, row.id),
  ]);
  return {
    locked: lockReason(await copyDone, ctx),
    meta: { ready: ctx.metaReady, account: ctx.meta?.ad_account_name ?? null, page: ctx.meta?.page_name ?? null, pixel: ctx.meta?.pixel_name ?? null },
    currency: ctx.currency,
    timezone: ctx.timezone,
    country: ctx.country,
    cpaLimit: ctx.cpaLimit,
    spendCap: ctx.spendCap,
    productUrl: ctx.productUrl,
    draft: toDraft(draft, ctx, row),
    media: await toAdMedia(media),
    templates,
    campaigns: campaigns.filter((c) => c.status !== "draft" && c.status !== "failed").map(toSummary),
    defaultTexts: ctx.texts,
    // Solo la campaña de testeo sigue a los ángulos; la CBO de ganadores usa los creativos que ganaron.
    draftAngles: sourceCampaignId
      ? null
      : draftAngles(
          draft ? { stamp: draft.angles_stamp ?? null, primaryTexts: draft.launch.primary_texts ?? [], creatives: draft.launch.creatives ?? [] } : null,
          { stamp: ctx.anglesStamp, primaryTexts: ctx.texts.primary_texts, since: ctx.angleSince },
          media,
        ),
    source: sourceCampaignId ? (campaigns.find((c) => c.id === sourceCampaignId)?.name ?? null) : null,
    sourceId: draft?.source_campaign_id ?? null,
  };
}

export const getProductAds = cache(async (id: string, from: string | null = null): Promise<ProductAds | null> => {
  const user = await sessionUser();
  if (!user) return null;
  // La etapa no espera a la ruta del producto: solo el candado mira si la página está lista.
  const product$ = getProduct(id);
  const row = await productRow(user.id, id);
  if (!row) return null;
  const [product, state] = await Promise.all([product$, adsState(user.id, row, product$.then((p) => p?.copyPhase === "done"), from)]);
  if (!product) return null;
  return { product, ...state };
});
