import "server-only";
import { differentiatorSchema, type Differentiator, type ProductBrief } from "@/lib/ai/schemas";
import { ANGLES } from "@/lib/angles/catalog";
import { adminClient } from "@/lib/integrations/admin";
import { latestBrief } from "@/lib/products/store";
import type { CompetitorView, DifferentiatorView } from "@/lib/types";
import { competitorAnalysisSchema, competitorErrorMessage, MAX_COMPETITORS, type CompetitorAnalysis, type CompetitorStatus } from "./schemas";

// El diferenciador confirmado (products.differentiator) y las tiendas de la competencia
// (product_competitors). Siempre con service_role filtrando por el dueño (como lib/angles/store.ts).

/** Un análisis que no avanza en este tiempo se da por interrumpido. */
const RUNNING_STALE_MS = 10 * 60 * 1000;
const QUEUED_STALE_MS = 3 * 60 * 1000;

export interface CompetitorRow {
  id: string;
  product_id: string;
  user_id: string;
  url: string;
  source: string;
  analysis: CompetitorAnalysis | null;
  status: CompetitorStatus;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------- Diferenciador

const parseDifferentiator = (raw: unknown): Differentiator | null => {
  if (!raw) return null;
  const parsed = differentiatorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/** El diferenciador que confirmó el comerciante, o null. */
export async function confirmedDifferentiator(userId: string, productId: string): Promise<Differentiator | null> {
  const { data, error } = await adminClient().from("products").select("differentiator").eq("user_id", userId).eq("id", productId).maybeSingle();
  fail("Leer el diferenciador", error);
  return parseDifferentiator(data?.differentiator);
}

/** Lo confirmado manda; si no hay, vale la propuesta de la ficha. */
export function differentiatorState(confirmed: Differentiator | null, brief: Pick<ProductBrief, "differentiator"> | null): DifferentiatorView {
  const proposed = parseDifferentiator(brief?.differentiator);
  return { value: confirmed ?? proposed, confirmed: confirmed !== null, proposed };
}

export async function getDifferentiator(userId: string, productId: string): Promise<{ value: Differentiator | null; confirmed: boolean; proposed: Differentiator | null }> {
  const [confirmed, brief] = await Promise.all([confirmedDifferentiator(userId, productId), latestBrief(userId, productId)]);
  return differentiatorState(confirmed, brief);
}

export async function saveDifferentiator(userId: string, productId: string, d: Differentiator): Promise<void> {
  const value = differentiatorSchema.parse(d);
  const { error } = await adminClient()
    .from("products")
    .update({ differentiator: value, differentiator_confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", productId);
  fail("Guardar el diferenciador", error);
}

// ---------------------------------------------------------------- Competencia

/** Cierra los análisis colgados (el proceso murió). `updated_at` marca el último cambio de estado. */
export async function expireStaleCompetitors(userId: string): Promise<void> {
  const db = adminClient();
  const now = Date.now();
  const stamp = new Date().toISOString();
  const patch = { status: "failed", error_code: "stale", updated_at: stamp };
  const results = await Promise.all([
    db.from("product_competitors").update(patch).eq("user_id", userId).eq("status", "running").lt("updated_at", new Date(now - RUNNING_STALE_MS).toISOString()),
    db.from("product_competitors").update(patch).eq("user_id", userId).eq("status", "queued").lt("updated_at", new Date(now - QUEUED_STALE_MS).toISOString()),
  ]);
  for (const r of results) fail("Cerrar análisis colgados", r.error);
}

/** Las tiendas de la competencia del producto, en el orden en que se agregaron. */
export async function listCompetitors(userId: string, productId: string): Promise<CompetitorRow[]> {
  const { data, error } = await adminClient()
    .from("product_competitors")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  fail("Leer la competencia", error);
  return (data ?? []) as CompetitorRow[];
}

export async function getCompetitor(userId: string, productId: string, id: string): Promise<CompetitorRow | null> {
  const { data, error } = await adminClient().from("product_competitors").select("*").eq("user_id", userId).eq("product_id", productId).eq("id", id).maybeSingle();
  fail("Leer la tienda", error);
  return (data as CompetitorRow | null) ?? null;
}

/** Agrega el link en cola. `duplicate` si ya estaba (unique (product_id, url)). */
export async function insertCompetitor(userId: string, productId: string, url: string): Promise<{ row: CompetitorRow | null; duplicate: boolean }> {
  const { data, error } = await adminClient()
    .from("product_competitors")
    .insert({ product_id: productId, user_id: userId, url, source: "manual" })
    .select("*")
    .single();
  if (error?.code === "23505") return { row: null, duplicate: true };
  fail("Agregar la tienda", error);
  return { row: data as CompetitorRow, duplicate: false };
}

export async function deleteCompetitor(userId: string, productId: string, id: string): Promise<boolean> {
  const { data, error } = await adminClient().from("product_competitors").delete().eq("user_id", userId).eq("product_id", productId).eq("id", id).select("id");
  fail("Quitar la tienda", error);
  return Boolean(data?.length);
}

/** Vuelve a poner en cola un análisis que terminó (Reintentar). Null si no existe o sigue en curso. */
export async function requeueCompetitor(userId: string, productId: string, id: string): Promise<CompetitorRow | null> {
  const { data, error } = await adminClient()
    .from("product_competitors")
    .update({ status: "queued", error_code: null, analysis: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("id", id)
    .in("status", ["failed", "succeeded"])
    .select("*")
    .maybeSingle();
  fail("Reintentar la tienda", error);
  return (data as CompetitorRow | null) ?? null;
}

/** Toma el análisis en cola (queued → running). Null si otro ya lo tomó o no existe. */
export async function claimCompetitor(id: string): Promise<CompetitorRow | null> {
  const { data, error } = await adminClient()
    .from("product_competitors")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  fail("Tomar el análisis", error);
  return (data as CompetitorRow | null) ?? null;
}

/** Cierra el análisis: con resultado o con el código de la falla. Solo si sigue en curso. */
export async function finishCompetitor(id: string, result: { analysis: CompetitorAnalysis } | { errorCode: string }): Promise<void> {
  const patch =
    "analysis" in result
      ? { status: "succeeded", analysis: result.analysis, error_code: null }
      : { status: "failed", error_code: result.errorCode };
  const { error } = await adminClient()
    .from("product_competitors")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "running");
  fail("Guardar el análisis", error);
}

/** Los análisis listos (para el orquestador de ángulos). */
export async function analyzedCompetitors(userId: string, productId: string): Promise<(CompetitorAnalysis & { url: string })[]> {
  const { data, error } = await adminClient()
    .from("product_competitors")
    .select("url, analysis")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: true });
  fail("Leer la competencia", error);
  const out: (CompetitorAnalysis & { url: string })[] = [];
  for (const r of (data ?? []) as { url: string; analysis: unknown }[]) {
    const parsed = competitorAnalysisSchema.safeParse(r.analysis);
    if (parsed.success) out.push({ ...parsed.data, url: r.url });
  }
  return out;
}

// ---------------------------------------------------------------- A la pantalla

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function toCompetitorView(r: CompetitorRow): CompetitorView {
  const parsed = r.status === "succeeded" ? competitorAnalysisSchema.safeParse(r.analysis) : null;
  const a = parsed?.success ? parsed.data : null;
  return {
    id: r.id,
    url: r.url,
    host: hostOf(r.url),
    status: r.status,
    error: r.status === "failed" ? competitorErrorMessage(r.error_code) : undefined,
    createdAt: r.created_at,
    analysis: a
      ? {
          storeName: a.store_name ?? undefined,
          price: a.price ?? undefined,
          compareAt: a.compare_at ?? undefined,
          offer: a.offer ?? undefined,
          painOrDesire: a.main_angle.pain_or_desire,
          promise: a.main_angle.promise,
          frame: a.frame,
          frameName: ANGLES[a.frame].name,
        }
      : undefined,
  };
}

/** Lo que devuelven las rutas de la competencia y lo que lee Información base. */
export async function competitorViews(userId: string, productId: string): Promise<CompetitorView[]> {
  await expireStaleCompetitors(userId);
  return (await listCompetitors(userId, productId)).map(toCompetitorView);
}

export { MAX_COMPETITORS };
