import "server-only";
import { autoAllowed, evaluateUnit, evaluateWinners, type Decision, type DayMetrics, type EngineContext, type EngineUnit, type UnitLevel } from "@/lib/ads/engine";
import { setDailyBudget, setStatus } from "@/lib/ads/meta/adapter";
import { fail, getCampaignRow, type CampaignRow } from "@/lib/ads/store";
import { adminClient } from "@/lib/integrations/admin";
import { MetaAuthError } from "@/lib/integrations/meta/client";
import { markMetaError, metaToken } from "@/lib/integrations/meta/connection";
import { money } from "@/lib/format";
import { ProductApiError } from "@/lib/products/http";
import { metaReason } from "./ads-launch";

// El motor en el servidor (docs/spec-anuncios.md §5.2–§5.4): arma las unidades con el historial de la
// base, evalúa con lib/ads/engine.ts (puro) usando la configuración de ESA campaña, guarda cada
// decisión y aplica cambios en Meta: los que el comerciante toca («Pausar conjunto», «Subir a $X») y,
// en modo automático, los que caben en los topes. Todo cambio queda en ad_changes con Deshacer.

const now = () => new Date().toISOString();

export interface SetRow {
  id: string;
  campaign_id: string;
  meta_adset_id: string | null;
  name: string;
  position: number;
  daily_budget: number | null;
  status: string;
  last_changed_at: string | null;
  created_at: string;
}

export interface AdRow {
  id: string;
  campaign_id: string;
  adset_id: string;
  meta_ad_id: string | null;
  name: string;
  media_id: string | null;
  status: string;
  last_changed_at: string | null;
}

export interface DecisionRow {
  id: string;
  campaign_id: string;
  level: UnitLevel;
  unit_id: string;
  verdict: Decision["verdict"];
  rule_id: string | null;
  reason: string;
  metrics: Decision["metrics"] & { rule?: string | null; winners?: string[] };
  progress: number | null;
  suggested_budget: number | null;
  disposition: "pending" | "applied" | "auto_applied" | "ignored" | "expired" | "undone" | "info";
  first_seen_at: string;
  last_seen_at: string;
  decided_at: string | null;
  decided_by: "merchant" | "engine" | null;
}

export interface ChangeRow {
  id: string;
  campaign_id: string;
  level: UnitLevel;
  unit_id: string;
  action: "pause" | "resume" | "set_budget" | "publish" | "create" | "external";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  decision_id: string | null;
  rule_id: string | null;
  actor: "merchant" | "engine" | "meta";
  undone_at: string | null;
  created_at: string;
}

export const isActive = (status: string) => status === "ACTIVE";

export async function campaignUnits(campaignId: string): Promise<{ sets: SetRow[]; ads: AdRow[] }> {
  const db = adminClient();
  const [s, a] = await Promise.all([db.from("ad_sets").select("*").eq("campaign_id", campaignId).order("position"), db.from("ads").select("*").eq("campaign_id", campaignId).order("created_at")]);
  fail("Leer los conjuntos", s.error);
  fail("Leer los anuncios", a.error);
  return { sets: (s.data ?? []) as SetRow[], ads: (a.data ?? []) as AdRow[] };
}

/** Los días de cada unidad de la campaña (en la zona de la cuenta). */
async function dailyByUnit(campaignId: string): Promise<Map<string, DayMetrics[]>> {
  const { data, error } = await adminClient()
    .from("ad_insights_daily")
    .select("unit_id, date, spend, impressions, reach, clicks, purchases, purchase_value, initiated_checkouts")
    .eq("campaign_id", campaignId);
  fail("Leer las métricas", error);
  const map = new Map<string, DayMetrics[]>();
  for (const r of data ?? []) {
    const d: DayMetrics = {
      date: r.date as string,
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      reach: Number(r.reach),
      clicks: Number(r.clicks),
      purchases: Number(r.purchases),
      purchase_value: Number(r.purchase_value),
      initiated_checkouts: Number(r.initiated_checkouts),
    };
    map.set(r.unit_id as string, [...(map.get(r.unit_id as string) ?? []), d]);
  }
  return map;
}

/** La primera foto horaria con pagos iniciados de cada unidad (regla intent_expired). */
async function firstCheckouts(campaignId: string): Promise<Map<string, string>> {
  const { data } = await adminClient()
    .from("ad_insights_snapshots")
    .select("unit_id, captured_at, lifetime")
    .eq("campaign_id", campaignId)
    .order("captured_at", { ascending: true });
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    const n = Number((r.lifetime as { initiated_checkouts?: number })?.initiated_checkouts ?? 0);
    if (n > 0 && !map.has(r.unit_id as string)) map.set(r.unit_id as string, r.captured_at as string);
  }
  return map;
}

/** Lo que la campaña compromete por día hoy: ABO, los conjuntos activos; CBO, el de la campaña. */
export function committedDaily(c: CampaignRow, sets: SetRow[]): number {
  if (c.structure === "cbo") return Number(c.daily_budget ?? 0);
  return sets.filter((s) => isActive(s.status)).reduce((n, s) => n + Number(s.daily_budget ?? 0), 0);
}

/** Evalúa la campaña con SU configuración. Solo campañas publicadas: una en pausa no decide nada. */
export async function evaluateCampaign(c: CampaignRow): Promise<{ decisions: Decision[]; units: Map<string, EngineUnit> }> {
  const [{ sets, ads }, days, checkouts] = await Promise.all([campaignUnits(c.id), dailyByUnit(c.id), firstCheckouts(c.id)]);
  // Desde cuándo puede entregar: la publicación o el inicio programado, lo que sea más tarde.
  const startedAt = c.published_at && c.starts_at && c.starts_at > c.published_at ? c.starts_at : c.published_at;
  const ctx: EngineContext = { now: new Date(), timeZone: c.timezone, currency: c.currency, dailyTotal: committedDaily(c, sets) };
  const units = new Map<string, EngineUnit>();
  const unit = (id: string, level: UnitLevel, name: string, active: boolean, budget: number | null, lastChangedAt: string | null): EngineUnit => {
    const u = { id, level, name, active, budget, startedAt, lastChangedAt, days: days.get(id) ?? [], firstCheckoutAt: checkouts.get(id) ?? null };
    units.set(id, u);
    return u;
  };
  const campaignUnit = unit(c.id, "campaign", c.name, c.status === "active", c.structure === "cbo" ? Number(c.daily_budget ?? 0) : null, c.last_changed_at ?? null);
  const decisions: Decision[] = [];
  if (c.structure === "abo") {
    const setUnits = sets.map((s) => unit(s.id, "adset", s.name, isActive(s.status) && c.status === "active", s.daily_budget == null ? null : Number(s.daily_budget), s.last_changed_at));
    for (const u of setUnits) decisions.push(evaluateUnit(u, c.engine, ctx, { pause: true, scale: true }));
    const winners = evaluateWinners(campaignUnit, setUnits, c.engine, ctx);
    if (winners) decisions.push(winners);
  } else {
    for (const a of ads) decisions.push(evaluateUnit(unit(a.id, "ad", a.name, isActive(a.status) && c.status === "active", null, a.last_changed_at), c.engine, ctx, { pause: true, scale: false }));
    decisions.push(evaluateUnit(campaignUnit, c.engine, ctx, { pause: false, scale: true }));
  }
  return { decisions, units };
}


const actionable = (v: Decision["verdict"]) => v === "pause" || v === "scale" || v === "winners";

/**
 * Guarda las decisiones: solo se agregan filas. Una igual a la vigente de la misma unidad (mismo
 * veredicto, regla y presupuesto) solo actualiza last_seen_at; si cambió, la pendiente anterior expira.
 */
export async function storeDecisions(c: CampaignRow, decisions: Decision[]): Promise<DecisionRow[]> {
  const db = adminClient();
  const { data, error } = await db.from("ad_decisions").select("*").eq("campaign_id", c.id).in("disposition", ["pending", "info"]).order("last_seen_at", { ascending: false });
  fail("Leer las decisiones", error);
  const current = new Map<string, DecisionRow>();
  for (const d of (data ?? []) as DecisionRow[]) if (!current.has(d.unit_id)) current.set(d.unit_id, d);
  const out: DecisionRow[] = [];
  const at = now();
  for (const d of decisions) {
    const prev = current.get(d.unitId);
    const metrics = { ...d.metrics, rule: d.rule, ...(d.winners ? { winners: d.winners } : {}) };
    const same = prev && prev.verdict === d.verdict && prev.rule_id === d.ruleId && Number(prev.suggested_budget ?? -1) === (d.suggestedBudget ?? -1);
    if (same) {
      const { data: upd, error: e } = await db.from("ad_decisions").update({ reason: d.reason, metrics, progress: d.progress, last_seen_at: at }).eq("id", prev.id).select("*").single();
      fail("Actualizar la decisión", e);
      out.push(upd as DecisionRow);
      continue;
    }
    // La vigente anterior (pendiente o informativa) deja de valer: la unidad cambió de situación.
    if (prev) fail("Vencer la decisión", (await db.from("ad_decisions").update({ disposition: "expired" }).eq("id", prev.id)).error);
    const { data: ins, error: e } = await db
      .from("ad_decisions")
      .insert({
        user_id: c.user_id,
        campaign_id: c.id,
        level: d.level,
        unit_id: d.unitId,
        verdict: d.verdict,
        rule_id: d.ruleId,
        reason: d.reason,
        metrics,
        progress: d.progress,
        suggested_budget: d.suggestedBudget,
        disposition: actionable(d.verdict) ? "pending" : "info",
        first_seen_at: at,
        last_seen_at: at,
      })
      .select("*")
      .single();
    fail("Guardar la decisión", e);
    out.push(ins as DecisionRow);
  }
  return out;
}

// ---------------------------------------------------------------- Cambios en Meta

type UnitRef = { level: UnitLevel; id: string; metaId: string; status: string; budget: number | null; name: string };

async function unitRef(c: CampaignRow, level: UnitLevel, unitId: string): Promise<UnitRef> {
  const db = adminClient();
  if (level === "campaign") {
    if (unitId !== c.id || !c.meta_campaign_id) throw new ProductApiError("No encontramos esa campaña en Meta.", 404);
    return { level, id: c.id, metaId: c.meta_campaign_id, status: c.status === "active" ? "ACTIVE" : "PAUSED", budget: c.daily_budget == null ? null : Number(c.daily_budget), name: c.name };
  }
  const table = level === "adset" ? "ad_sets" : "ads";
  const { data } = await db.from(table).select("*").eq("campaign_id", c.id).eq("id", unitId).maybeSingle();
  if (!data) throw new ProductApiError(level === "adset" ? "No encontramos ese conjunto." : "No encontramos ese anuncio.", 404);
  const metaId = (level === "adset" ? data.meta_adset_id : data.meta_ad_id) as string | null;
  if (!metaId) throw new ProductApiError("Esa unidad no está creada en Meta.", 409);
  return { level, id: unitId, metaId, status: data.status as string, budget: level === "adset" && data.daily_budget != null ? Number(data.daily_budget) : null, name: data.name as string };
}

async function writeLocal(c: CampaignRow, u: UnitRef, patch: { status?: string; budget?: number }) {
  const db = adminClient();
  const at = now();
  if (u.level === "campaign") {
    await db
      .from("ad_campaigns")
      .update({
        ...(patch.status ? { status: patch.status === "ACTIVE" ? "active" : "paused" } : {}),
        ...(patch.budget != null ? { daily_budget: patch.budget } : {}),
        last_changed_at: at,
        updated_at: at,
      })
      .eq("id", c.id);
    return;
  }
  const table = u.level === "adset" ? "ad_sets" : "ads";
  await db
    .from(table)
    .update({ ...(patch.status ? { status: patch.status } : {}), ...(patch.budget != null ? { daily_budget: patch.budget } : {}), last_changed_at: at, updated_at: at })
    .eq("id", u.id);
}

export type UnitAction = { action: "pause" } | { action: "resume" } | { action: "set_budget"; budget: number };

/** Aplica un cambio en Meta y lo anota. `actor`: el comerciante o el motor. */
export async function applyUnitAction(c: CampaignRow, level: UnitLevel, unitId: string, a: UnitAction, meta: { actor: "merchant" | "engine"; decisionId?: string; ruleId?: string | null }): Promise<ChangeRow> {
  const token = await metaToken(c.user_id);
  if (!token) throw new ProductApiError("Tu conexión con Meta venció. Vuelve a conectarla en Ajustes.", 409);
  const u = await unitRef(c, level, unitId);
  if (a.action === "set_budget") {
    if (u.budget == null) throw new ProductApiError(level === "adset" ? "Este conjunto no tiene presupuesto propio: la campaña es CBO." : "Esta unidad no tiene presupuesto propio.", 409);
    if (!(a.budget > 0)) throw new ProductApiError("Escribe un presupuesto mayor que cero.", 400);
  }
  try {
    if (a.action === "set_budget") await setDailyBudget(token, u.metaId, a.budget, c.currency);
    else await setStatus(token, u.metaId, a.action === "pause" ? "PAUSED" : "ACTIVE");
  } catch (e) {
    if (e instanceof MetaAuthError) await markMetaError(c.user_id, "expired").catch(() => {});
    throw new ProductApiError(metaReason(e), 502);
  }
  const before = a.action === "set_budget" ? { budget: u.budget } : { status: u.status };
  const after = a.action === "set_budget" ? { budget: a.budget } : { status: a.action === "pause" ? "PAUSED" : "ACTIVE" };
  await writeLocal(c, u, a.action === "set_budget" ? { budget: a.budget } : { status: after.status as string });
  const { data, error } = await adminClient()
    .from("ad_changes")
    .insert({ user_id: c.user_id, campaign_id: c.id, level, unit_id: unitId, action: a.action, before, after, decision_id: meta.decisionId ?? null, rule_id: meta.ruleId ?? null, actor: meta.actor })
    .select("*")
    .single();
  fail("Anotar el cambio", error);
  return data as ChangeRow;
}

/** «Pausar conjunto», «Subir a $X» (apply) o «Mantener»/«Ignorar» (ignore) sobre una decisión pendiente. */
export async function decide(userId: string, campaignId: string, decisionId: string, action: "apply" | "ignore"): Promise<{ decision: DecisionRow; change: ChangeRow | null }> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c) throw new ProductApiError("No encontramos esa campaña.", 404);
  const db = adminClient();
  const { data } = await db.from("ad_decisions").select("*").eq("campaign_id", campaignId).eq("id", decisionId).maybeSingle();
  const d = data as DecisionRow | null;
  if (!d) throw new ProductApiError("No encontramos esa decisión.", 404);
  if (d.disposition !== "pending") throw new ProductApiError("Esa decisión ya no está pendiente. Recarga la página.", 409);
  if (d.verdict === "winners" && action === "apply") throw new ProductApiError("Crea la CBO de ganadores desde su botón.", 409);
  let change: ChangeRow | null = null;
  if (action === "apply") {
    const a: UnitAction = d.verdict === "pause" ? { action: "pause" } : { action: "set_budget", budget: Number(d.suggested_budget) };
    change = await applyUnitAction(c, d.level, d.unit_id, a, { actor: "merchant", decisionId: d.id, ruleId: d.rule_id });
  }
  const { data: upd, error } = await db
    .from("ad_decisions")
    .update({ disposition: action === "apply" ? "applied" : "ignored", decided_at: now(), decided_by: "merchant" })
    .eq("id", d.id)
    .select("*")
    .single();
  fail("Guardar la decisión", error);
  return { decision: upd as DecisionRow, change };
}

/** Deshacer: vuelve al presupuesto o al estado anterior (y lo anota como un cambio más). */
export async function undoChange(userId: string, campaignId: string, changeId: string): Promise<ChangeRow> {
  const c = await getCampaignRow(userId, campaignId);
  if (!c) throw new ProductApiError("No encontramos esa campaña.", 404);
  const db = adminClient();
  const { data } = await db.from("ad_changes").select("*").eq("campaign_id", campaignId).eq("id", changeId).maybeSingle();
  const ch = data as ChangeRow | null;
  if (!ch) throw new ProductApiError("No encontramos ese cambio.", 404);
  if (ch.undone_at) throw new ProductApiError("Ese cambio ya se deshizo.", 409);
  if (!["pause", "resume", "set_budget"].includes(ch.action)) throw new ProductApiError("Ese cambio no se puede deshacer desde aquí.", 409);
  const a: UnitAction = ch.action === "set_budget" ? { action: "set_budget", budget: Number(ch.before?.budget) } : ch.action === "pause" ? { action: "resume" } : { action: "pause" };
  const back = await applyUnitAction(c, ch.level, ch.unit_id, a, { actor: "merchant" });
  fail("Marcar como deshecho", (await db.from("ad_changes").update({ undone_at: now() }).eq("id", ch.id)).error);
  if (ch.decision_id) await db.from("ad_decisions").update({ disposition: "undone" }).eq("id", ch.decision_id);
  return back;
}

/**
 * Modo automático (§5.4): aplica lo pendiente que cabe en los topes. Si Meta rechaza un cambio, la
 * campaña vuelve a «Solo recomendar» y el error queda para Hoy. Nunca crea campañas (ganadores).
 */
export async function autoApply(c: CampaignRow, decisions: DecisionRow[], units: Map<string, EngineUnit>): Promise<number> {
  if (c.engine.mode !== "auto" || c.status !== "active") return 0;
  const { sets } = await campaignUnits(c.id);
  let daily = committedDaily(c, sets);
  let applied = 0;
  for (const d of decisions) {
    if (d.disposition !== "pending" || (d.verdict !== "pause" && d.verdict !== "scale")) continue;
    const unit = units.get(d.unit_id);
    if (!unit) continue;
    const decision: Decision = { unitId: d.unit_id, level: d.level, verdict: d.verdict, ruleId: d.rule_id, rule: null, reason: d.reason, progress: null, suggestedBudget: d.suggested_budget == null ? null : Number(d.suggested_budget), metrics: d.metrics };
    if (!autoAllowed(decision, unit, c.engine, { now: new Date(), timeZone: c.timezone, currency: c.currency, dailyTotal: daily })) continue;
    try {
      const a: UnitAction = d.verdict === "pause" ? { action: "pause" } : { action: "set_budget", budget: Number(d.suggested_budget) };
      await applyUnitAction(c, d.level, d.unit_id, a, { actor: "engine", decisionId: d.id, ruleId: d.rule_id });
      await adminClient().from("ad_decisions").update({ disposition: "auto_applied", decided_at: now(), decided_by: "engine" }).eq("id", d.id);
      if (d.verdict === "scale" && unit.budget != null) daily += Number(d.suggested_budget) - unit.budget;
      if (d.verdict === "pause" && unit.budget != null) daily -= unit.budget;
      applied++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Meta rechazó un cambio.";
      await adminClient()
        .from("ad_campaigns")
        .update({ engine: { ...c.engine, mode: "suggest" }, sync_error: `El modo automático se apagó: ${reason}`, updated_at: now() })
        .eq("id", c.id);
      break;
    }
  }
  return applied;
}

/** La razón de un cambio, para el historial («Subió de $5.000 a $6.000»). */
export function changeText(ch: ChangeRow, currency: string): string {
  switch (ch.action) {
    case "set_budget":
      return `Presupuesto de ${money(Number(ch.before?.budget ?? 0), currency)} a ${money(Number(ch.after?.budget ?? 0), currency)}`;
    case "pause":
      return "Pausado";
    case "resume":
      return "Reactivado";
    case "publish":
      return "Publicada";
    case "create":
      return "Creada en pausa";
    case "external":
      return "Cambiado en Ads Manager";
  }
}
