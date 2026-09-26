"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, DecisionRow, Field, MetricGrid, Notice, SegmentedControl, notify, notifyUndo, type DecisionKind, type MetricProps } from "@/components/df";
import { SectionTitle } from "@/components/shell/page-header";
import { StickyActions } from "@/components/shell/sticky-actions";
import { engineProblems, type EngineConfig } from "@/lib/ads/schemas";
import { startLabel } from "@/lib/ads/schedule";
import { amount, currencySymbol, money, multiplier, parseMoney } from "@/lib/format";
import type { AdDecisionView, AdUnitView, CampaignDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EngineRules } from "./ads-engine";
import { DailyChart, HourlyChart } from "./campaign-charts";

// Detalle de una campaña (PantallasAnuncios2 L4 y PantallasAnunciosEscritorio2, docs/spec-anuncios.md
// §11): lo que decidió el motor por conjunto (ABO) o anuncio (CBO), con la cifra y la regla; «Solo
// recomendar» pide el toque del comerciante y «Automático» aplica dentro de los topes con Deshacer. Las
// reglas y el CPA límite son de ESTA campaña.

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No pudimos hacer el cambio. Intenta de nuevo.");
  return data as T;
}

const timeOf = (iso: string, tz: string) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const dayTime = (iso: string, tz: string) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function unitMetrics(u: AdUnitView, currency: string) {
  return [`Gasto ${money(u.spend, currency)}`, u.purchases === 1 ? "1 venta" : `${u.purchases} ventas`, ...(u.cpa != null ? [`CPA ${money(u.cpa, currency)}`] : [])].join(" · ");
}

export function CampaignScreen({ data }: { data: CampaignDetail }) {
  const router = useRouter();
  const [engine, setEngine] = useState<EngineConfig>(data.engine);
  const [savedEngine, setSavedEngine] = useState(JSON.stringify(data.engine));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [armed, setArmed] = useState<string | null>(null);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const { currency, timezone: tz } = data;
  const cbo = data.structure === "cbo";
  const dirty = JSON.stringify(engine) !== savedEngine;

  // Lo que gasta dinero pide un segundo toque (4 s para confirmar).
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  async function run(key: string, fn: () => Promise<unknown>, done?: string, undo?: () => void) {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      if (done && undo) notifyUndo(done, undo);
      else if (done) notify(done);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos hacer el cambio.");
    } finally {
      setBusy(null);
      setArmed(null);
    }
  }

  const base = `/api/campaigns/${data.id}`;
  const undoChange = (changeId: string) => run(`undo-${changeId}`, () => call(`${base}/changes/${changeId}/undo`, "POST"), "Cambio deshecho");
  const decide = (d: AdDecisionView, action: "apply" | "ignore", label: string) =>
    run(`${d.id}-${action}`, async () => {
      const r = await call<{ changeId: string | null }>(`${base}/decisions/${d.id}`, "POST", { action });
      if (r.changeId) notifyUndo(label, () => undoChange(r.changeId!));
    }, action === "ignore" ? label : undefined);
  const unitAction = (u: { id: string; level: string }, action: "pause" | "resume", label: string) =>
    run(`${u.id}-${action}`, async () => {
      const r = await call<{ changeId: string }>(`${base}/units/${u.id}`, "POST", { level: u.level, action });
      notifyUndo(label, () => undoChange(r.changeId));
    });
  const saveEngine = (next: EngineConfig, done = "Reglas guardadas") =>
    run("engine", async () => {
      await call(`${base}/engine`, "PUT", { engine: next });
      setSavedEngine(JSON.stringify(next));
    }, done);

  const publish = (now: boolean) =>
    run(now ? "publish-now" : "publish", () => call(`${base}/publish`, "POST", now ? { start: "now" } : {}), now ? "Campaña publicada: empieza a entregar ahora" : "Campaña publicada: empieza a entregar según su horario");
  const redo = () =>
    run("redo", async () => {
      const r = await call<{ productId: string; sourceCampaignId: string | null }>(`${base}/redo`, "POST");
      router.push(`/products/${r.productId}/ads${r.sourceCampaignId ? `?from=${r.sourceCampaignId}` : ""}`);
    }, "Campaña borrada en Meta: ajusta lo que quieras y lánzala de nuevo");
  const recreate = () =>
    run("recreate", async () => {
      const r = await call<{ productId: string; sourceCampaignId: string | null }>(`${base}/recreate`, "POST");
      router.push(`/products/${r.productId}/ads${r.sourceCampaignId ? `?from=${r.sourceCampaignId}` : ""}`);
    }, "Campaña recreada: cambia lo que quieras y lánzala");
  // Sin router.refresh(): esta página deja de existir. Queda ocupado hasta que llega a Campañas.
  const remove = async () => {
    setBusy("delete");
    setError(undefined);
    try {
      await call(base, "DELETE");
      notify("Campaña eliminada. En Meta quedó en pausa.");
      router.replace("/campaigns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminar la campaña.");
      setBusy(null);
      setArmed(null);
    }
  };
  // Lo que gasta o borra pide un segundo toque.
  const confirmed = (key: string, fn: () => void) => () => (armed === key ? fn() : setArmed(key));
  const syncNow = () => run("sync", () => call(`${base}/sync`, "POST"), "Cifras actualizadas");

  // ---------------------------------------------------------------- Decisiones por unidad
  const unitWord = cbo ? "anuncio" : "conjunto";
  function decisionRow(u: AdUnitView) {
    const d = u.decision;
    let kind: DecisionKind = "esperar";
    let label: string | undefined;
    let reason = d?.reason ?? (data.publishedAt ? "Sin lecturas todavía: la primera llega en menos de una hora." : "En pausa hasta que publiques la campaña.");
    let actions: React.ReactNode = null;
    const applied = d && (d.disposition === "applied" || d.disposition === "auto_applied");
    const by = d?.disposition === "auto_applied" ? "por el motor" : "por ti";
    if (!u.active) {
      kind = "pausado";
      label = applied && d?.verdict === "pause" ? `Pausado ${by}${d.decidedAt ? ` · ${timeOf(d.decidedAt, tz)}` : ""}` : "Pausado";
      if (data.publishedAt)
        actions = (
          <>
            <span />
            <Button size="sm" variant="secondary" icon="power" loading={busy === `${u.id}-resume`} onClick={() => unitAction(u, "resume", `${u.name} reactivado`)}>
              Reactivar
            </Button>
          </>
        );
    } else if (d?.verdict === "pause" && d.disposition === "pending") {
      kind = "pausar";
      actions = (
        <>
          <Button size="sm" variant="secondary" loading={busy === `${d.id}-ignore`} onClick={() => decide(d, "ignore", `${u.name} sigue activo`)}>
            Mantener
          </Button>
          <Button size="sm" variant="destructive" icon="pause" loading={busy === `${d.id}-apply`} onClick={() => decide(d, "apply", `${u.name} pausado`)}>
            Pausar {unitWord}
          </Button>
        </>
      );
    } else if (d?.verdict === "scale" && d.disposition === "pending" && d.suggestedBudget != null) {
      kind = "escalar";
      const key = `${d.id}-apply`;
      actions = (
        <>
          <Button size="sm" variant="secondary" loading={busy === `${d.id}-ignore`} onClick={() => decide(d, "ignore", "Presupuesto sin cambios")}>
            Ignorar
          </Button>
          <Button size="sm" variant="primary" icon="arrow-up" aria-live="polite" loading={busy === key} onClick={() => (armed === key ? decide(d, "apply", `Presupuesto subido a ${money(d.suggestedBudget!, currency)}`) : setArmed(key))}>
            {armed === key ? `Confirmar: ${money(d.suggestedBudget, currency)}` : `Subir a ${money(d.suggestedBudget, currency)}`}
          </Button>
        </>
      );
    } else if (applied && d?.verdict === "scale") {
      kind = "escalado";
      label = `Escalado ${by}${d.decidedAt ? ` · ${timeOf(d.decidedAt, tz)}` : ""}`;
      reason = d.reason;
    } else if (d?.verdict === "wait") {
      kind = "esperar";
    } else if (d) {
      kind = "mantener";
    }
    return (
      <DecisionRow
        key={u.id}
        decision={kind}
        label={label}
        name={u.name}
        image={u.image ?? undefined}
        metrics={`${unitMetrics(u, currency)}${u.budget != null ? ` · ${money(u.budget, currency)}/día` : ""}`}
        reason={reason}
        rule={d?.verdict !== "keep" ? (d?.rule ?? undefined) : undefined}
        progress={d?.verdict === "wait" && u.active ? (d.progress ?? 0) : null}
        actions={actions}
      />
    );
  }

  const cd = data.campaignDecision;
  const campaignDecision =
    cd?.verdict === "winners" && cd.disposition === "pending" ? (
      <Notice
        tone="info"
        icon="trend"
        title={`${cd.winners?.length ?? 0} conjuntos ganan: crea una CBO con ellos.`}
        body={`${cd.reason} Se crea como borrador, con ${money(cd.suggestedBudget ?? 0, currency)}/día, y la revisas antes de lanzar.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" loading={busy === `${cd.id}-ignore`} onClick={() => decide(cd, "ignore", "Sugerencia descartada")}>
              Ahora no
            </Button>
            <Button
              size="sm"
              variant="primary"
              iconEnd="chevron-right"
              loading={busy === "winners"}
              onClick={() =>
                run("winners", async () => {
                  const r = await call<{ productId: string }>(`${base}/winners`, "POST", { decisionId: cd.id });
                  router.push(`/products/${r.productId}/ads?from=${data.id}`);
                })
              }
            >
              Crear CBO con {cd.winners?.length ?? 0} ganadores
            </Button>
          </div>
        }
      />
    ) : cbo && cd ? (
      <DecisionRow
        decision={cd.verdict === "scale" && cd.disposition === "pending" ? "escalar" : cd.verdict === "wait" ? "esperar" : cd.disposition === "applied" || cd.disposition === "auto_applied" ? "escalado" : "mantener"}
        name={`Campaña · ${money(data.dailyBudget ?? 0, currency)}/día`}
        reason={cd.reason}
        rule={cd.rule ?? undefined}
        progress={cd.verdict === "wait" ? (cd.progress ?? 0) : null}
        actions={
          cd.verdict === "scale" && cd.disposition === "pending" && cd.suggestedBudget != null ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => decide(cd, "ignore", "Presupuesto sin cambios")}>
                Ignorar
              </Button>
              <Button size="sm" variant="primary" icon="arrow-up" onClick={() => (armed === cd.id ? decide(cd, "apply", `Presupuesto subido a ${money(cd.suggestedBudget!, currency)}`) : setArmed(cd.id))}>
                {armed === cd.id ? `Confirmar: ${money(cd.suggestedBudget, currency)}` : `Subir a ${money(cd.suggestedBudget, currency)}`}
              </Button>
            </>
          ) : null
        }
      />
    ) : null;

  // ---------------------------------------------------------------- Cifras
  const limit = engine.cpa_limit;
  const metrics: MetricProps[] = [
    { label: "Costo por venta", value: data.totals.cpa == null ? "—" : money(data.totals.cpa, currency), target: `Límite ${money(limit, currency)}`, trend: data.totals.cpa == null ? undefined : data.totals.cpa <= limit ? "good" : "bad" },
    { label: "Ventas", value: data.totals.purchases.toLocaleString("es-CL") },
    { label: "Gasto", value: money(data.totals.spend, currency), target: `${money(data.dailyTotal, currency)}/día` },
    { label: "Retorno", value: data.totals.roas == null ? "—" : multiplier(data.totals.roas) },
  ];

  const cap = engine.rules.find((r) => r.type === "daily_cap" && r.enabled);
  const modeControl = (
    <SegmentedControl
      label="Cómo actúa"
      value={engine.mode}
      onChange={(v) => (v === "auto" ? setAutoConfirm(true) : saveEngine({ ...engine, mode: "suggest" }, "El motor solo recomienda"))}
      options={[
        { value: "suggest", label: "Solo recomendar" },
        { value: "auto", label: "Automático" },
      ]}
    />
  );

  const rules = (
    <section aria-labelledby="reglas" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="reglas" className="text-heading">
          Reglas de esta campaña
        </h2>
        {dirty ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEngine(JSON.parse(savedEngine))}>
              Descartar
            </Button>
            <Button size="sm" variant="primary" icon="check" loading={busy === "engine"} disabled={engineProblems(engine, data.dailyTotal).length > 0} onClick={() => saveEngine(engine)}>
              Guardar reglas
            </Button>
          </div>
        ) : null}
      </div>
      <Field
        label="CPA límite"
        prefix={currencySymbol(currency)}
        inputMode="numeric"
        value={amount(engine.cpa_limit, currency)}
        onValueChange={(v) => {
          const n = parseMoney(v);
          if (Number.isFinite(n) && n > 0) setEngine({ ...engine, cpa_limit: n });
        }}
        hint="Las reglas en × se ajustan solas. Solo cambia esta campaña."
      />
      {engineProblems(engine, data.dailyTotal).map((p) => (
        <p key={p} role="alert" className="m-0 text-label font-normal text-destructive">
          {p}
        </p>
      ))}
      <EngineRules engine={engine} structure={data.structure} currency={currency} dailyTotal={data.dailyTotal} onChange={setEngine} />
    </section>
  );

  const history = (
    <section aria-labelledby="cambios">
      <SectionTitle className="px-0">
        <span id="cambios">Cambios</span>
      </SectionTitle>
      {data.changes.length ? (
        <ol className="m-0 flex list-none flex-col divide-y overflow-hidden rounded-lg border bg-card p-0">
          {data.changes.map((ch) => (
            <li key={ch.id} className="flex min-h-touch items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className={cn("text-small", ch.undone && "text-muted-foreground line-through")}>
                  {ch.unitName} · {ch.text}
                </div>
                <div className="text-caption text-muted-foreground">
                  {dayTime(ch.at, tz)} · {ch.actor === "engine" ? "el motor" : ch.actor === "meta" ? "en Ads Manager" : "tú"}
                  {ch.rule ? ` · ${ch.rule}` : ""}
                </div>
              </div>
              {ch.undoable ? (
                <Button size="sm" variant="ghost" icon="undo" loading={busy === `undo-${ch.id}`} onClick={() => undoChange(ch.id)}>
                  Deshacer
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-label font-normal text-muted-foreground">Todavía no hay cambios.</p>
      )}
    </section>
  );

  const notPublished = data.status === "paused" && !data.publishedAt;
  // Meta retiene la entrega hasta el inicio programado, aunque todo esté activo.
  const waiting = Boolean(data.startsAt && Date.parse(data.startsAt) > Date.now());
  const startText = data.startsAt ? startLabel(data.startsAt, new Date(), tz) : "";
  // El presupuesto diario se reinicia a medianoche: empezar tarde lo gasta en las horas que quedan.
  const hoursLeft = 24 - Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const lateWarning = hoursLeft <= 12 ? ` Si empieza ahora, Meta intentará gastar el presupuesto de hoy en las ${hoursLeft} horas que quedan.` : "";
  const redoButton = data.canRedo ? (
    <Button size="sm" variant="ghost" icon="edit" loading={busy === "redo"} onClick={confirmed("redo", redo)}>
      {armed === "redo" ? "Confirmar: borrar y rehacer" : "Rehacer"}
    </Button>
  ) : null;
  const startNowButton = (
    <Button size="sm" variant="secondary" icon="power" loading={busy === "publish-now"} onClick={confirmed("publish-now", () => publish(true))}>
      {armed === "publish-now" ? "Confirmar: empezar ahora" : notPublished ? "Publicar ahora" : "Empezar ahora"}
    </Button>
  );
  const redoHint = data.canRedo ? " ¿Algo quedó mal? «Rehacer» la borra en Meta y vuelve al configurador." : "";

  const manage = (
    <section aria-labelledby="esta-campana" className="flex flex-col gap-2">
      <SectionTitle className="px-0">
        <span id="esta-campana">Esta campaña</span>
      </SectionTitle>
      <p className="m-0 text-label font-normal text-muted-foreground">
        «Recrear» abre un borrador con la misma configuración (creativos, público, presupuesto, textos y reglas) para cambiar lo que quieras y lanzarla otra vez; esta campaña sigue igual.
        {data.openDraft ? " Reemplaza el borrador que tienes abierto." : ""} «Eliminar» la pausa en Meta y la saca de DropFlex; en Ads Manager queda con su historial.
      </p>
      <span className="flex flex-wrap gap-2" aria-live="polite">
        <Button size="sm" variant="secondary" icon="copy" loading={busy === "recreate"} disabled={busy === "delete"} onClick={data.openDraft ? confirmed("recreate", recreate) : recreate}>
          {armed === "recreate" ? "Confirmar: reemplazar mi borrador" : "Recrear"}
        </Button>
        <Button size="sm" variant={armed === "delete" ? "destructive" : "ghost"} loading={busy === "delete"} disabled={busy === "recreate"} onClick={confirmed("delete", remove)}>
          {armed === "delete" ? "Confirmar: pausar y eliminar" : "Eliminar"}
        </Button>
      </span>
    </section>
  );

  return (
    <div className="@container flex flex-col">
      <div className="flex flex-col @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_--spacing(105)]">
        <div className="flex min-w-0 flex-col gap-4 px-4 py-2 lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-caption text-muted-foreground">
              {data.lastSyncedAt ? `Actualizado ${dayTime(data.lastSyncedAt, tz)} · cada hora` : "Todavía sin lecturas de Meta"}
            </p>
            {modeControl}
          </div>
          {autoConfirm ? (
            <Notice
              tone="info"
              icon="alert"
              title="El motor pausará y subirá presupuestos solo."
              body={`Hasta +30 % por paso, un cambio por ${unitWord} cada espera y nunca sobre ${money(cap && "amount" in cap ? cap.amount : data.dailyTotal, currency)} diarios. Cada cambio queda con Deshacer.`}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAutoConfirm(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === "engine"}
                    onClick={() => {
                      setAutoConfirm(false);
                      const next = { ...engine, mode: "auto" as const };
                      setEngine(next);
                      saveEngine(next, "Modo automático activado");
                    }}
                  >
                    Activar automático
                  </Button>
                </div>
              }
            />
          ) : null}
          {data.syncError ? <Notice title="No pudimos leer la campaña en Meta." body={`${data.syncError} Si la borraste en Ads Manager, elimínala en «Esta campaña», al final.`} /> : null}
          {notPublished ? (
            <Notice
              tone="info"
              icon="megaphone"
              title="Creada en pausa en Meta."
              body={
                <>
                  Nada gasta hasta que la publiques. {waiting ? `Al publicar, empieza ${startText}; con «Publicar ahora», de inmediato.${lateWarning}` : "Al publicar, empieza a entregar de inmediato."}
                  {redoHint}
                  <span className="mt-2 flex flex-wrap gap-2" aria-live="polite">
                    <Button size="sm" variant="primary" icon="send" loading={busy === "publish"} onClick={confirmed("publish", () => publish(false))}>
                      {armed === "publish" ? "Confirmar: publicar" : waiting ? `Publicar · ${startText}` : "Publicar"}
                    </Button>
                    {waiting ? startNowButton : null}
                    {redoButton}
                  </span>
                </>
              }
            />
          ) : data.status === "active" && waiting ? (
            <Notice
              tone="info"
              icon="clock"
              title={`Publicada: empieza ${startText}.`}
              body={
                <>
                  Meta retiene la entrega hasta esa hora.{lateWarning}
                  {redoHint}
                  <span className="mt-2 flex flex-wrap gap-2" aria-live="polite">
                    {startNowButton}
                    {redoButton}
                  </span>
                </>
              }
            />
          ) : null}
          <MetricGrid metrics={metrics} wide />
          {campaignDecision}
          <section aria-labelledby="decisiones" className="flex flex-col gap-3">
            <h2 id="decisiones" className="text-heading">
              {cbo ? "Anuncios" : "Conjuntos"}
            </h2>
            {data.units.map(decisionRow)}
          </section>
          <DailyChart series={data.daily} units={data.units.map((u) => ({ id: u.id, name: u.name }))} cpaLimit={limit} currency={currency} />
          <HourlyChart today={data.hourly.today} yesterday={data.hourly.yesterday} currency={currency} />
          <div className="@4xl:hidden">{rules}</div>
          {history}
          {manage}
          {error ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <aside aria-label="Reglas activas" className="hidden border-l px-6 pt-6 pb-4 @4xl:block">
          <div className="sticky top-6">{rules}</div>
        </aside>
      </div>
      <StickyActions className="max-lg:[&>*]:flex-1">
        <Button variant="secondary" href={`/products/${data.productId}/ads`} iconEnd="chevron-right">
          Ver producto
        </Button>
        <Button variant="secondary" icon="refresh" loading={busy === "sync"} onClick={syncNow}>
          Actualizar ahora
        </Button>
      </StickyActions>
    </div>
  );
}
