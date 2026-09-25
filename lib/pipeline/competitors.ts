import "server-only";
import { AiStepError, generateStructured } from "@/lib/ai/claude";
import { recordAiGeneration } from "@/lib/ai/track";
import { FetchPageError, fetchPageText } from "@/lib/competitors/fetch";
import { competitorSystem, competitorUser } from "@/lib/competitors/prompts";
import { competitorAnalysisSchema, MAX_COMPETITORS } from "@/lib/competitors/schemas";
import {
  claimCompetitor,
  expireStaleCompetitors,
  finishCompetitor,
  getDifferentiator,
  insertCompetitor,
  listCompetitors,
  type CompetitorRow,
} from "@/lib/competitors/store";
import { normalizeCompetitorUrl } from "@/lib/competitors/text";
import { adminClient } from "@/lib/integrations/admin";
import { getShopifyConnection } from "@/lib/integrations/shopify/connection";
import { ProductApiError } from "@/lib/products/http";
import { getProductRow } from "@/lib/products/store";
import { getMarket } from "@/lib/settings/market";

// Tiendas de la competencia (Información base, docs/spec-angulos-testeo.md › §3.2): el comerciante
// pega un link, el servidor lee la página (sin JS, con tope de tamaño y tiempo) y una llamada chica
// (`effort: "low"`) resume cómo vende: precio, oferta, ángulo principal, forma, pruebas y tono.
// Corre en segundo plano con after(); la pantalla sondea.

/** Tope de análisis por comerciante en 24 h. */
const DAILY_LIMIT = 60;

/** Valida, deduplica y pone en cola un link. Devuelve la fila creada. */
export async function startCompetitor(userId: string, productId: string, rawUrl: string): Promise<CompetitorRow> {
  const url = normalizeCompetitorUrl(typeof rawUrl === "string" ? rawUrl : "");
  if (!url) throw new ProductApiError("Pega el link de la página de la tienda, por ejemplo https://tienda.com/products/…", 400, "url");

  await expireStaleCompetitors(userId);
  const current = await listCompetitors(userId, productId);
  if (current.some((c) => c.url === url)) throw new ProductApiError("Esa tienda ya está en la lista.", 409, "url");
  if (current.length >= MAX_COMPETITORS) throw new ProductApiError(`Ya tienes ${MAX_COMPETITORS} tiendas. Quita una para agregar otra.`, 409, "url");

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await adminClient()
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("step", "competitor_analysis")
    .gte("created_at", since);
  if ((recent.count ?? 0) >= DAILY_LIMIT) throw new ProductApiError(`Llegaste al máximo de ${DAILY_LIMIT} tiendas analizadas en 24 horas. Vuelve mañana.`, 429, "url");

  const { row, duplicate } = await insertCompetitor(userId, productId, url);
  if (duplicate || !row) throw new ProductApiError("Esa tienda ya está en la lista.", 409, "url");
  return row;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Analiza una tienda en cola. Para after(): nunca lanza; toda falla queda en la fila. */
export async function runCompetitor(id: string): Promise<void> {
  let row: CompetitorRow | null;
  try {
    row = await claimCompetitor(id);
  } catch (e) {
    console.error("[competitors] tomar el análisis", e);
    return;
  }
  if (!row) return;
  const { user_id: userId, product_id: productId } = row;
  const finish = async (result: Parameters<typeof finishCompetitor>[1]) => {
    try {
      await finishCompetitor(id, result);
    } catch (e) {
      console.error("[competitors] cerrar el análisis", e);
    }
  };

  try {
    const product = await getProductRow(userId, productId);
    if (!product) return finish({ errorCode: "not_found" });

    let page: { text: string; title: string | null };
    try {
      page = await fetchPageText(row.url);
    } catch (e) {
      return finish({ errorCode: e instanceof FetchPageError ? e.code : "network" });
    }

    const [{ market }, differentiator] = await Promise.all([
      getShopifyConnection(userId).then((conn) => getMarket(userId, conn)),
      getDifferentiator(userId, productId),
    ]);
    const detail = hostOf(row.url);
    let result;
    try {
      result = await generateStructured({
        system: competitorSystem(market),
        content: [{ type: "text", text: competitorUser({ productName: product.title, differentiator: differentiator.value, url: row.url, title: page.title, text: page.text }) }],
        schema: competitorAnalysisSchema,
        effort: "low",
        maxTokens: 8000,
      });
    } catch (e) {
      if (e instanceof AiStepError) {
        if (!e.logged) await recordAiGeneration({ userId, productId, step: "competitor_analysis", detail, usage: e.usage, error: e.code });
        return finish({ errorCode: "ai_failed" });
      }
      throw e;
    }
    await recordAiGeneration({ userId, productId, step: "competitor_analysis", detail, usage: result.usage });
    await finish({ analysis: result.data });
  } catch (e) {
    console.error("[competitors] analizar la tienda", e);
    await finish({ errorCode: "ai_failed" });
  }
}
