import "server-only";
import { buildPreset } from "@/lib/ads/presets";
import { adsContext, fail, getCampaignRow, getDraft, saveDraft } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";
import { ProductApiError } from "@/lib/products/http";
import { getProductRow } from "@/lib/products/store";
import type { DecisionRow } from "./ads-engine";

// CBO desde ganadores (docs/spec-anuncios.md §5.2 › Ganadores, R31): con N conjuntos ganadores en una
// ABO, se arma un BORRADOR de CBO con sus creativos y la plantilla «Escalado CBO · ganadores». Nunca se
// crea solo en Meta: el comerciante lo revisa en el configurador y lo lanza (en pausa) como cualquier otro.

export async function createWinnersDraft(userId: string, campaignId: string, decisionId: string): Promise<{ productId: string }> {
  const src = await getCampaignRow(userId, campaignId);
  if (!src || src.structure !== "abo") throw new ProductApiError("La CBO de ganadores sale de una campaña ABO.", 409);
  const db = adminClient();
  const { data } = await db.from("ad_decisions").select("*").eq("campaign_id", campaignId).eq("id", decisionId).maybeSingle();
  const d = data as DecisionRow | null;
  if (!d || d.verdict !== "winners") throw new ProductApiError("No encontramos esa sugerencia.", 404);
  const winners = d.metrics?.winners ?? [];
  if (!winners.length) throw new ProductApiError("La sugerencia no tiene conjuntos ganadores.", 409);

  // Si ya hay un borrador de ganadores de esta campaña, se retoma.
  if (await getDraft(userId, src.product_id, src.id)) return { productId: src.product_id };

  const { data: ads, error } = await db.from("ads").select("adset_id, media_id").eq("campaign_id", campaignId).in("adset_id", winners);
  fail("Leer los anuncios ganadores", error);
  const creatives = [...new Set((ads ?? []).map((a) => a.media_id as string | null).filter((m): m is string => !!m))];
  if (!creatives.length) throw new ProductApiError("Los conjuntos ganadores no tienen creativos para reusar.", 409);

  const product = await getProductRow(userId, src.product_id);
  if (!product) throw new ProductApiError("El producto ya no existe.", 404);
  const ctx = await adsContext(userId, product);
  const preset = buildPreset("cbo-winners", {
    country: src.launch.countries[0] ?? ctx.country,
    currency: src.currency,
    cpaLimit: src.engine.cpa_limit,
    creatives,
    texts: { primary_texts: src.launch.primary_texts, headlines: src.launch.headlines, description: src.launch.description },
  });
  const launch = {
    ...preset.launch,
    countries: src.launch.countries,
    excluded_regions: src.launch.excluded_regions,
    location: src.launch.location,
    min_age: src.launch.min_age,
    budget: d.suggested_budget ? Number(d.suggested_budget) : preset.launch.budget,
    cta: src.launch.cta,
  };
  await saveDraft(userId, product, { name: `${product.title.slice(0, 60)} · Ganadores`, structure: "cbo", template_key: "cbo-winners", template_id: null, launch, engine: preset.engine }, ctx, src.id);
  fail("Guardar la sugerencia", (await db.from("ad_decisions").update({ disposition: "applied", decided_at: new Date().toISOString(), decided_by: "merchant" }).eq("id", d.id)).error);
  return { productId: src.product_id };
}
