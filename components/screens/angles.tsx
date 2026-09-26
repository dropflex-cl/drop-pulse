"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AngleCard,
  AngleDevelopment,
  AngleDevelopmentActions,
  Button,
  Icon,
  IconButton,
  IcpSummary,
  Notice,
  RoleChip,
  SegmentedControl,
  TopBar,
  notify,
  notifyUndo,
  type AngleDevelopmentStatus,
  type AngleDevelopmentValue,
} from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton, useAiEstimate } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { ANGLES, MIN_TEST_ANGLES, SALES_ANGLES, TEST_ANGLES, type SalesAngle } from "@/lib/angles/catalog";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi, type TestAngleInput } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { AngleBriefView, AngleCandidateView, AngleRankingView, AnglesState, ProductAngles, RunStatus, TestAngleView } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Ángulos (docs/spec-angulos-testeo.md §4): el cliente ideal aprobado y el diferenciador
// confirmado → “Elegir ángulos con IA” → 5 ángulos candidatos (mensaje + forma) con la sugerencia de 3
// → el comerciante elige 2 o 3 (uno por conjunto de anuncios) y la forma de cada uno → un desarrollo
// por ángulo, en paralelo → aprobarlos habilita Imágenes y la página del producto.

const POLL_MS = 2500;

type Pick = TestAngleInput & { key: string };

const active = (s?: RunStatus) => s === "queued" || s === "running";
/** Lo que se manda al confirmar: sin la clave de la pantalla. */
const toInput = (p: Pick): TestAngleInput => ({
  title: p.title,
  frame: p.frame,
  pain_or_desire: p.pain_or_desire,
  segment: p.segment,
  promise: p.promise,
  trigger_moment: p.trigger_moment,
  competition: p.competition,
});
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

function devStatus(b: AngleBriefView): AngleDevelopmentStatus {
  if (active(b.generation)) return "generando";
  if (b.generation === "failed") return "error";
  return b.status === "aprobado" ? "aprobado" : b.status === "revision" ? "revision" : "generado";
}

function devValue(b: AngleBriefView): Partial<AngleDevelopmentValue> {
  const c = b.content;
  if (!c) return {};
  return {
    hooks: c.hooks,
    pickedHook: c.recommendedHook,
    aida: { atencion: c.aida.attention, interes: c.aida.interest, deseo: c.aida.desire, accion: c.aida.action },
    objections: c.objections.map((o) => ({ q: o.objection, a: o.answer })),
    offer: c.offer,
  };
}

const fromCandidate = (c: AngleCandidateView): Pick => ({
  key: `c${c.index}`,
  title: c.title,
  frame: c.frame,
  pain_or_desire: c.painOrDesire,
  segment: c.segment,
  promise: c.promise,
  trigger_moment: c.triggerMoment,
  competition: c.competition,
});

const fromChosen = (a: TestAngleView, candidates: AngleCandidateView[]): Pick => {
  const match = candidates.find((c) => c.title === a.title && c.painOrDesire === a.painOrDesire);
  return {
    key: match ? `c${match.index}` : `s${a.slot}`,
    title: a.title || a.name,
    frame: a.frame,
    pain_or_desire: a.painOrDesire,
    segment: a.segment,
    promise: a.promise,
    trigger_moment: a.triggerMoment,
    competition: a.competition,
  };
};

/** La elección de partida: lo confirmado o, si no hay, la sugerencia del código. */
function initialPicks(r: AngleRankingView | undefined): Pick[] {
  if (!r) return [];
  if (r.chosen?.length && r.candidates.length) return r.chosen.map((a) => fromChosen(a, r.candidates));
  return r.suggested.map((i) => r.candidates[i]).filter(Boolean).map(fromCandidate);
}

/** Riesgo que se resuelve con un dato real: las reseñas se importan en Reseñas; el experto se escribe en Información base. */
const FIX_LABEL = { reviews: "Importar reseñas", expert: "Agregar experto" } as const;

export function AnglesScreen({ data }: { data: ProductAngles }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = data;
  const [state, setState] = useState<AnglesState>(data);
  const ranking = state.ranking;
  const briefs = state.briefs;
  const baseHref = productHref(product.id, "importado");
  const fixHref = (fix?: "reviews" | "expert") => (fix === "reviews" ? productHref(product.id, "resenas") : baseHref);

  const evaluating = active(ranking?.status);
  const generating = briefs.some((b) => active(b.generation));
  const locked = !state.avatar?.approved;
  const needsDifferentiator = !state.differentiator?.confirmed;

  // Elección en curso: parte de lo confirmado o de la sugerencia; una evaluación nueva la reinicia.
  const [picks, setPicks] = useState<Pick[]>(() => initialPicks(ranking));
  const rankingKey = `${ranking?.id}:${ranking?.status}:${ranking?.confirmedAt}`;
  const [pickFor, setPickFor] = useState(rankingKey);
  if (rankingKey !== pickFor) {
    setPickFor(rankingKey);
    setPicks(initialPicks(ranking));
  }
  const [choosing, setChoosing] = useState(false);
  const [editingPick, setEditingPick] = useState<string | null>(null);
  const [showForms, setShowForms] = useState(false);
  const [expandedForm, setExpandedForm] = useState<SalesAngle | null>(null);
  const [tab, setTab] = useState<number>(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<{ what: string; slot?: number } | null>(null);
  const [error, setError] = useState<string>();

  // ---------------------------------------------------------------- Sondeo
  const wasWorking = useRef(evaluating || generating);
  useEffect(() => {
    const working = evaluating || generating;
    if (wasWorking.current && !working) {
      // La ruta, el encabezado y Hoy se leen en el servidor.
      router.refresh();
      if (ranking?.status === "succeeded" && !ranking.chosen) notify("Los ángulos están listos: elige los que vas a testear");
      else if (ranking?.status === "failed") notify(ranking.error ?? "No pudimos evaluar los ángulos. Toca Reintentar.");
      else if (briefs.length && briefs.every((b) => b.generation === "succeeded")) notify("Los desarrollos están listos para revisar");
    }
    wasWorking.current = working;
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.angles(product.id));
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [evaluating, generating, product.id, router, ranking, briefs]);

  // ---------------------------------------------------------------- Acciones
  const run = async (what: string, fn: () => Promise<AnglesState>, fallback: string, slot?: number) => {
    setBusy({ what, slot });
    setError(undefined);
    try {
      const next = await fn();
      setState(next);
      router.refresh();
      return next;
    } catch (e) {
      setError(errorText(e, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runEvaluate = () =>
    run("evaluate", () => productsApi.evaluateAngles(product.id), "No pudimos empezar la evaluación. Intenta de nuevo.").then((s) => {
      setAskReeval(false);
      if (s) setChoosing(false);
    });
  // Con desarrollos hechos, volver a evaluar puede costar también los desarrollos: avisa antes de gastar
  // (design-system/arquitectura.md › 11, “Antes de gastar”).
  const hasBriefs = briefs.length > 0;
  const [askReeval, setAskReeval] = useState(false);
  const rankingCost = useAiEstimate("angle_ranking");
  const briefCost = useAiEstimate("angle_brief");
  const evaluate = () => (hasBriefs ? setAskReeval(true) : runEvaluate());

  const confirm = async () => {
    if (picks.length < MIN_TEST_ANGLES) return;
    const next = await run(
      "confirm",
      () => productsApi.confirmAngles(product.id, picks.map(toInput)),
      "No pudimos guardar tu elección. Intenta de nuevo.",
    );
    if (next) {
      setChoosing(false);
      setEditingPick(null);
      setTab(1);
    }
  };

  const decide = (b: AngleBriefView, action: "approve" | "reopen") => {
    run(action, () => productsApi.decideAngleBrief(product.id, b.id, action), "No pudimos guardar tu decisión. Intenta de nuevo.", b.slot).then((next) => {
      if (!next || action !== "approve") return;
      notifyUndo(`Ángulo ${b.slot} aprobado`, () => decide(b, "reopen"));
      // Como la revisión de textos: pasa sola al siguiente pendiente.
      const pending = next.briefs.find((x) => x.status !== "aprobado" && x.slot !== b.slot);
      if (pending) setTab(pending.slot);
    });
  };

  const regenerate = (slot: number) => {
    const b = briefs.find((x) => x.slot === slot);
    setEditing(null);
    if (b) run("regenerate", () => productsApi.regenerateAngleBrief(product.id, b.id), "No pudimos regenerar este desarrollo. Intenta de nuevo.", slot);
    // Sin desarrollo (una confirmación que falló a la mitad): confirmar otra vez la misma elección
    // crea el que falta.
    else if (ranking?.chosen?.length)
      run(
        "regenerate",
        () => productsApi.confirmAngles(product.id, ranking.chosen!.map((a) => toInput(fromChosen(a, ranking.candidates)))),
        "No pudimos crear este desarrollo. Intenta de nuevo.",
        slot,
      );
  };

  const save = (b: AngleBriefView, v: AngleDevelopmentValue) => {
    run(
      "save",
      () =>
        productsApi.editAngleBrief(
          product.id,
          b.id,
          {
            hooks: v.hooks,
            recommended_hook: v.pickedHook,
            aida_summary: { attention: v.aida.atencion, interest: v.aida.interes, desire: v.aida.deseo, action: v.aida.accion },
            objection_handling: v.objections.map((o) => ({ objection: o.q, answer: o.a })),
            offer_layer: v.offer,
          },
          true,
        ),
      "No pudimos guardar los cambios. Intenta de nuevo.",
      b.slot,
    ).then((next) => {
      if (!next) return;
      setEditing(null);
      notifyUndo("Cambios guardados y desarrollo aprobado", () => decide(b, "reopen"));
    });
  };

  const toggle = (c: AngleCandidateView) =>
    setPicks((p) => (p.some((x) => x.key === `c${c.index}`) ? p.filter((x) => x.key !== `c${c.index}`) : p.length >= TEST_ANGLES ? p : [...p, fromCandidate(c)]));
  // El número del ángulo es su lugar en la elección: subir o bajar lo reordena (Conjunto 1, 2, 3).
  const movePick = (from: number, to: number) =>
    setPicks((p) => {
      if (to < 0 || to >= p.length) return p;
      const next = [...p];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  const patchPick = (key: string, patch: Partial<Pick>) => setPicks((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // ---------------------------------------------------------------- Piezas
  const frameScore = new Map((ranking?.angles ?? []).map((a) => [a.angle, a.score]));
  const suggestedKeys = new Set((ranking?.suggested ?? []).map((i) => `c${i}`));
  const changed = Boolean(ranking && (picks.length !== ranking.suggested.length || picks.some((p, i) => p.key !== `c${ranking.suggested[i]}`)));

  const avatarChanged = ranking?.avatarChanged ? (
    <Notice title="Tu cliente ideal cambió después de esta evaluación." body="Vuelve a evaluar para que los ángulos partan del nuevo." />
  ) : null;

  const icp = state.avatar ? <IcpSummary text={state.avatar.summary} tags={state.avatar.tags} approved={state.avatar.approved} action="Ver o cambiar" href={baseHref} /> : null;

  const differentiator = state.differentiator ? (
    <section aria-labelledby="diferenciador" className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="diferenciador" className="text-label font-semibold text-muted-foreground">
          Tu diferenciador
        </h2>
        <Button size="sm" variant="ghost" href={baseHref}>
          {state.differentiator.confirmed ? "Cambiar" : "Confirmar"}
        </Button>
      </div>
      <p className="mt-1 text-body">
        Frente a {state.differentiator.versus}: {state.differentiator.claim}
      </p>
      <p className="mt-2 text-label font-normal text-muted-foreground">
        {state.competitors
          ? `${state.competitors === 1 ? "1 tienda de la competencia analizada" : `${state.competitors} tiendas de la competencia analizadas`}: los ángulos buscan lo que no están diciendo.`
          : "Sin tiendas de la competencia: agrégalas en Información base para que los ángulos eviten lo que ya se dice."}
      </p>
    </section>
  ) : null;

  const candidateCard = (c: AngleCandidateView) => {
    const key = `c${c.index}`;
    const pos = picks.findIndex((p) => p.key === key);
    const picked = pos >= 0;
    const pick = picks[pos];
    const full = !picked && picks.length >= TEST_ANGLES;
    const edit = editingPick === key && pick;
    return (
      <article key={key} aria-labelledby={`cand-${key}`} className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4", picked && "border-2 border-primary p-3.75")}>
        <div className="flex flex-wrap items-center gap-2">
          {picked ? <RoleChip slot={pos + 1} short /> : null}
          {suggestedKeys.has(key) ? <RoleChip role="sugerido" /> : null}
          <span className="ml-auto text-label font-semibold tabular-nums">{c.score}/100</span>
        </div>
        <h3 id={`cand-${key}`} className="text-heading">
          {pick?.title || c.title}
        </h3>
        {edit ? (
          <div className="flex flex-col gap-2.5">
            {(
              [
                ["title", "Nombre del ángulo", 60],
                ["pain_or_desire", "Dolor o deseo", 400],
                ["segment", "Para quién", 300],
                ["promise", "Promesa", 300],
              ] as const
            ).map(([field, label, max]) => (
              <label key={field} className="flex flex-col gap-1 text-label">
                {label}
                <textarea
                  rows={field === "title" ? 1 : 2}
                  maxLength={max}
                  value={pick[field]}
                  onChange={(e) => patchPick(key, { [field]: e.target.value })}
                  className="min-h-11 w-full resize-y rounded-md border border-input bg-background p-2.5 text-body font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft"
                />
              </label>
            ))}
            <Button size="sm" className="self-start" onClick={() => setEditingPick(null)}>
              Listo
            </Button>
          </div>
        ) : (
          <dl className="flex flex-col gap-1.5 text-small">
            <div>
              <dt className="inline font-semibold">Dolor o deseo: </dt>
              <dd className="inline">{pick?.pain_or_desire || c.painOrDesire}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Para quién: </dt>
              <dd className="inline">{pick?.segment || c.segment}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Promesa: </dt>
              <dd className="inline">{pick?.promise || c.promise}</dd>
            </div>
            {c.triggerMoment ? (
              <div>
                <dt className="inline font-semibold">Abre con: </dt>
                <dd className="inline">{c.triggerMoment}</dd>
              </div>
            ) : null}
          </dl>
        )}
        <p className={cn("flex gap-2 text-label font-normal", c.competitionDelta > 0 ? "text-success" : c.competitionDelta < 0 ? "text-warning" : "text-muted-foreground")}>
          <Icon name={c.competitionDelta < 0 ? "alert" : "sparkle"} size="sm" className="mt-0.5 shrink-0" />
          <span>
            {ranking?.competitors
              ? c.competitorsUsing === 0
                ? "Ninguna tienda de la competencia lo usa (+10)."
                : `${c.competitorsUsing === 1 ? "Lo usa 1 tienda" : `Lo usan ${c.competitorsUsing} tiendas`} de la competencia${c.competitionDelta < 0 ? " (−15)" : ""}.`
              : "Sin datos de competencia."}{" "}
            {c.competition && c.competition !== "Sin datos de competencia" ? c.competition : ""}
          </span>
        </p>
        <label className="flex flex-col gap-1 text-label">
          Forma de contarlo
          <select
            value={pick?.frame ?? c.frame}
            disabled={!picked}
            onChange={(e) => patchPick(key, { frame: e.target.value as SalesAngle })}
            className="h-control w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-body font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft disabled:opacity-70"
          >
            {SALES_ANGLES.map((f) => (
              <option key={f} value={f}>
                {ANGLES[f].name}
                {frameScore.has(f) ? ` · ${frameScore.get(f)}/100` : ""}
                {f === c.frame ? " · recomendada" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={picked ? "secondary" : "primary"} icon={picked ? "x" : "check"} disabled={full} onClick={() => toggle(c)}>
            {picked ? "Quitar" : full ? `Ya elegiste ${TEST_ANGLES}` : "Testear este"}
          </Button>
          {picked && !edit ? (
            <Button size="sm" variant="ghost" onClick={() => setEditingPick(key)}>
              Editar
            </Button>
          ) : null}
        </div>
      </article>
    );
  };

  // ---------------------------------------------------------------- Vistas
  let view: "locked" | "start" | "evaluating" | "failed" | "ranking" | "developments";
  if (locked) view = "locked";
  else if (!ranking) view = "start";
  else if (evaluating) view = "evaluating";
  else if (ranking.status === "failed") view = "failed";
  else if (!ranking.chosen || choosing) view = "ranking";
  else view = "developments";

  const chosen = ranking?.chosen ?? [];
  const expected = chosen.length || TEST_ANGLES;
  const approvedCount = briefs.filter((b) => b.status === "aprobado" && b.generation === "succeeded").length;
  const subtitle =
    view === "ranking"
      ? `${ranking?.candidates.length ?? 0} ángulos · ${picks.length} elegidos`
      : view === "developments"
        ? `${approvedCount} de ${expected} desarrollos aprobados`
        : view === "evaluating"
          ? "Evaluando ángulos"
          : "Cómo vas a vender este producto";

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (view === "locked") {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        {icp}
        <div className="flex gap-3 rounded-lg border bg-card p-4">
          <Icon name="lock" className="text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-row">Se habilita al aprobar tu cliente ideal</p>
            <p className="text-label font-normal text-muted-foreground">Los ángulos se eligen para esa persona. Revísalo en Información base.</p>
          </div>
        </div>
      </div>
    );
    footer = (
      <StickyActions variant="bar" summary="Aprueba tu cliente ideal para elegir ángulos." className="lg:px-8">
        <Button variant="primary" size="lg" iconEnd="chevron-right" href={baseHref} className="max-lg:w-full lg:h-control lg:text-row">
          Ir a Información base
        </Button>
      </StickyActions>
    );
  } else if (view === "start" || view === "failed") {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        {view === "failed" ? (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive bg-destructive-soft p-4 text-destructive">
            <Icon name="alert" />
            <div className="min-w-0 flex-1">
              <p className="text-row">No se pudo evaluar</p>
              <p className="text-label font-normal">{ranking?.error ?? "Toca Reintentar."}</p>
            </div>
          </div>
        ) : null}
        {needsDifferentiator ? (
          <Notice
            title="Primero confirma tu diferenciador."
            body="¿En qué se diferencia tu producto de lo que tu cliente ya usa? Los ángulos parten de ahí. Confírmalo en Información base."
            action={
              <Button size="sm" href={baseHref}>
                Ir a Información base
              </Button>
            }
          />
        ) : null}
        {icp}
        {differentiator}
        <section aria-labelledby="que-hara" className="rounded-lg border bg-card p-4">
          <h2 id="que-hara" className="text-heading">
            Qué hará la IA
          </h2>
          <ol className="mt-2 mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-small">
            <li>
              Propone <b>5 ángulos</b> de venta distintos: qué dolor o deseo destacar, para quién y con qué promesa.
            </li>
            <li>Mira lo que dice tu competencia y prefiere lo que nadie está usando.</li>
            <li>
              Sugiere <b>3 para testear</b>, cada uno en su propio conjunto de anuncios. Tú decides; el mercado dice cuál vende.
            </li>
          </ol>
          <p className="text-label font-normal text-muted-foreground">No inventa pruebas: si falta un experto o reseñas reales, baja el puntaje de la forma que las necesita.</p>
        </section>
      </div>
    );
    footer = (
      <StickyActions variant="bar" stack summary="Toma alrededor de un minuto. Nada se publica sin tu OK." mobileNote="Toma alrededor de un minuto." className="lg:px-8">
        <Button
          variant="primary"
          size="lg"
          icon="sparkle"
          disabled={needsDifferentiator}
          loading={busy?.what === "evaluate"}
          onClick={evaluate}
          className="max-lg:w-full lg:h-control lg:text-row"
        >
          {view === "failed" ? "Reintentar" : "Elegir ángulos con IA"}
        </Button>
      </StickyActions>
    );
  } else if (view === "evaluating") {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        <section role="status" aria-label="Evaluación en curso" className="flex gap-3 rounded-lg border bg-card p-4">
          <Icon name="loader" className="motion-exempt animate-spin text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-row">La IA está proponiendo ángulos para testear</p>
            <p className="text-label font-normal text-muted-foreground">Con tu cliente ideal, tu diferenciador, la competencia y tu precio. Puedes salir de esta pantalla: te avisamos en Hoy.</p>
          </div>
        </section>
        {icp}
        <div aria-hidden className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <span className="block h-5 w-1/2 animate-pulse rounded-sm bg-muted" />
              <span className="block h-2 w-full animate-pulse rounded-full bg-muted" />
              <span className="block h-3.5 w-4/5 animate-pulse rounded-sm bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
    footer = (
      <StickyActions variant="bar" summary="Puedes salir de esta pantalla: te avisamos en Hoy cuando esté lista." className="lg:px-8">
        <Button variant="primary" size="lg" loading className="max-lg:w-full lg:h-control lg:text-row">
          Evaluando
        </Button>
      </StickyActions>
    );
  } else if (view === "ranking" && ranking) {
    const legacy = !ranking.candidates.length;
    const confirmButton = (
      <Button
        variant="primary"
        size="lg"
        iconEnd="chevron-right"
        block
        loading={busy?.what === "confirm"}
        disabled={legacy || picks.length < MIN_TEST_ANGLES}
        onClick={confirm}
        className="lg:h-control lg:text-row"
      >
        {picks.length >= MIN_TEST_ANGLES ? `Confirmar y desarrollar ${picks.length}` : "Confirmar y desarrollar"}
      </Button>
    );
    const reevalConfirm = (where: "m" | "d") => (
      <div role="group" aria-labelledby={`reeval-${where}`} className="flex w-full flex-col gap-2.5 rounded-lg border bg-card p-4 text-left">
        <h3 id={`reeval-${where}`} className="text-heading">
          ¿Volver a evaluar los ángulos?
        </h3>
        <p className="m-0 text-label font-normal text-muted-foreground">
          {rankingCost ? (
            <>
              Cuesta cerca de <b className="font-medium text-foreground tabular-nums">{money(rankingCost.amount, rankingCost.currency)}</b>.{" "}
            </>
          ) : null}
          Si nada cambió y eliges los mismos ángulos, conservas tus desarrollos. Si cambió algo (reseñas, cliente ideal, competencia o precio), se escriben de nuevo
          {briefCost ? ` por cerca de ${money(briefCost.amount * TEST_ANGLES, briefCost.currency)}` : ""}.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={() => setAskReeval(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" icon="sparkle" loading={busy?.what === "evaluate"} onClick={runEvaluate}>
            {rankingCost ? `Volver a evaluar por ~${money(rankingCost.amount, rankingCost.currency)}` : "Volver a evaluar"}
          </Button>
        </div>
      </div>
    );
    const reevalButton = (where: "m" | "d") =>
      askReeval ? (
        reevalConfirm(where)
      ) : (
        <Button variant="ghost" icon="sparkle" loading={busy?.what === "evaluate"} disabled={needsDifferentiator} onClick={evaluate}>
          Volver a evaluar
        </Button>
      );
    const confirmNote = legacy
      ? "Vuelve a evaluar para proponer ángulos de testeo."
      : picks.length < MIN_TEST_ANGLES
        ? `Elige entre ${MIN_TEST_ANGLES} y ${TEST_ANGLES} ángulos.`
        : `Se desarrollan ${picks.length} ángulos en paralelo, uno por conjunto de anuncios.`;
    const summary = (
      <section aria-labelledby="tu-testeo" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h2 id="tu-testeo" className="flex items-baseline justify-between text-heading">
          Tu testeo <span className="text-label font-normal text-muted-foreground">{changed ? "tu elección" : "sugerencia de la IA"}</span>
        </h2>
        {picks.length ? (
          <ol className="flex flex-col gap-1.5">
            {picks.map((p, i) => (
              <li key={p.key} className="flex items-center gap-2 text-small">
                <RoleChip slot={i + 1} short />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-label font-normal text-muted-foreground">{ANGLES[p.frame].name}</span>
                {picks.length > 1 ? (
                  <span className="-my-2 flex flex-none">
                    <IconButton icon="arrow-up" label={`Subir «${p.title}»`} disabled={i === 0} onClick={() => movePick(i, i - 1)} />
                    <IconButton icon="arrow-down" label={`Bajar «${p.title}»`} disabled={i === picks.length - 1} onClick={() => movePick(i, i + 1)} />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-label font-normal text-muted-foreground">Elige los ángulos que vas a testear.</p>
        )}
        <p className="text-label font-normal text-muted-foreground">Cada ángulo va en su propio conjunto de anuncios; la página del producto sirve a todos.</p>
        {ranking.missing.length ? (
          <ul className="mt-1 flex flex-col gap-1 border-t pt-2 text-label font-normal text-muted-foreground">
            {ranking.missing.map((m) => (
              <li key={m.text} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">{m.text}</span>
                {m.fix ? (
                  <Button size="sm" variant="ghost" onClick={() => router.push(fixHref(m.fix))}>
                    {m.fix === "reviews" ? "Importar" : "Agregar"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
    body = (
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_--spacing(90)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          {avatarChanged}
          {legacy ? (
            <Notice
              title="Esta evaluación es de antes de los ángulos de testeo."
              body={
                needsDifferentiator
                  ? "Para volver a evaluar, primero confirma tu diferenciador en Información base."
                  : "Vuelve a evaluar para que la IA proponga ángulos distintos para testear, uno por conjunto de anuncios."
              }
              action={
                needsDifferentiator ? (
                  <Button size="sm" href={baseHref}>
                    Ir a Información base
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          <div className="lg:hidden">{summary}</div>
          {differentiator}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[repeat(auto-fill,minmax(--spacing(75),1fr))] lg:items-start">{ranking.candidates.map(candidateCard)}</div>
          <Button variant="ghost" className="self-start" onClick={() => setShowForms((v) => !v)}>
            {showForms ? "Ocultar las 6 formas de contarlo" : "Ver las 6 formas de contarlo"}
          </Button>
          {showForms ? (
            <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(--spacing(75),1fr))] lg:items-start">
              {ranking.angles.map((a) => (
                <AngleCard
                  key={a.angle}
                  rank={a.rank}
                  name={a.name}
                  score={a.score}
                  fit={a.why}
                  risks={a.risks.map((r) => ({ text: r.text, penalty: r.penalty, fix: r.fix ? FIX_LABEL[r.fix] : undefined }))}
                  breakdown={a.breakdown}
                  hideActions
                  expanded={expandedForm === a.angle}
                  onToggle={() => setExpandedForm(expandedForm === a.angle ? null : a.angle)}
                  onFix={(r) => router.push(fixHref(a.risks.find((k) => k.text === r.text)?.fix))}
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 lg:hidden">
            {reevalButton("m")}
            {choosing && !askReeval ? (
              <Button variant="ghost" onClick={() => setChoosing(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
        {/* Escritorio: la elección fija a la derecha, junto a “Confirmar y desarrollar”. */}
        <aside aria-label="Tu testeo" className="sticky top-6 hidden flex-col gap-3 lg:flex">
          {summary}
          {confirmButton}
          <p className="text-center text-label font-normal text-muted-foreground">{confirmNote}</p>
          <div className="flex justify-center gap-2">
            {reevalButton("d")}
            {choosing && !askReeval ? (
              <Button variant="ghost" onClick={() => setChoosing(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    );
    footer = desktop ? null : (
      <StickyActions stack mobileNote={confirmNote}>
        {confirmButton}
      </StickyActions>
    );
  } else {
    const missingFor = (a: TestAngleView) => (!briefs.some((b) => b.slot === a.slot) ? a.name : undefined);
    const dev = (a: TestAngleView, hideActions: boolean) => {
      const b = briefs.find((x) => x.slot === a.slot);
      const missing = missingFor(a);
      if (!b && missing)
        return (
          <AngleDevelopment
            key={`missing-${a.slot}`}
            slot={a.slot}
            angle={missing}
            status="error"
            error="Este desarrollo no se alcanzó a crear. Toca Regenerar."
            hideActions={hideActions}
            busy={busy?.slot === a.slot && busy.what === "regenerate" ? "regenerate" : null}
            onRegenerate={() => regenerate(a.slot)}
          />
        );
      if (!b) return null;
      return (
        <AngleDevelopment
          key={b.id}
          slot={b.slot}
          angle={b.name}
          frame={b.frameName}
          status={devStatus(b)}
          error={b.error}
          {...devValue(b)}
          hideActions={hideActions}
          editing={editing === b.slot}
          busy={busy?.slot === b.slot ? (busy.what as "approve" | "regenerate" | "save" | "reopen") : null}
          onApprove={() => decide(b, "approve")}
          onReopen={() => decide(b, "reopen")}
          onRegenerate={() => regenerate(b.slot)}
          onEdit={() => setEditing(b.slot)}
          onCancelEdit={() => setEditing(null)}
          onSave={(v) => save(b, v)}
        />
      );
    };
    const done = approvedCount === chosen.length && chosen.length >= MIN_TEST_ANGLES;
    const nextClass = "max-lg:w-full lg:h-control lg:text-row";
    // Imágenes va antes de la Página del producto (la página usa las imágenes elegidas). Generar
    // cuesta créditos de Higgsfield: «Continuar» solo lleva, no genera.
    const next = done ? (
      <Button variant="primary" size="lg" iconEnd="chevron-right" href={productHref(product.id, "imagenes")} className={nextClass}>
        Continuar: Imágenes
      </Button>
    ) : (
      <Button variant="primary" size="lg" iconEnd="chevron-right" disabled className={nextClass}>
        Continuar: Imágenes
      </Button>
    );
    const tabAngle = chosen.find((a) => a.slot === tab) ?? chosen[0];
    const current = tabAngle ? briefs.find((b) => b.slot === tabAngle.slot) : undefined;
    const currentStatus: AngleDevelopmentStatus | undefined = current ? devStatus(current) : tabAngle && missingFor(tabAngle) ? "error" : undefined;
    // Elegidos antes de los ángulos de testeo (sin candidatos): se invita a volver a evaluar con el
    // diferenciador y la competencia. Volver a evaluar pasa a la elección con la confirmación abierta
    // (el aviso de costo vive ahí). Sin diferenciador confirmado, primero Información base.
    const legacyChoice = !ranking?.candidates.length;
    const reevalFromDevs = () => {
      setChoosing(true);
      if (hasBriefs) setAskReeval(true);
      else void runEvaluate();
    };
    const third = legacyChoice ? (
      <Notice
        tone="info"
        title="Estos ángulos son de antes de los ángulos de testeo."
        body={
          needsDifferentiator
            ? "Para rehacerlos con el método nuevo, primero confirma tu diferenciador (y, si quieres, agrega tu competencia) en Información base. Después vuelve a evaluar."
            : "Vuelve a evaluar: la IA propone ángulos distintos a partir de tu diferenciador y tu competencia, y eliges 2 o 3 para testear."
        }
        action={
          needsDifferentiator ? (
            <Button size="sm" href={baseHref}>
              Ir a Información base
            </Button>
          ) : (
            <Button size="sm" icon="sparkle" loading={busy?.what === "evaluate"} onClick={reevalFromDevs}>
              Volver a evaluar
            </Button>
          )
        }
      />
    ) : chosen.length < TEST_ANGLES ? (
      <Notice
        tone="info"
        title="Puedes testear un tercer ángulo."
        body="En temporada conviene probar 3 ángulos a la vez, cada uno en su conjunto: así ves más rápido cuál vende. No es obligatorio."
        action={
          <Button size="sm" onClick={() => setChoosing(true)}>
            Agregar un ángulo
          </Button>
        }
      />
    ) : null;
    body = (
      <div className="flex flex-col gap-3">
        {avatarChanged}
        {third}
        {/* Móvil: se navega entre los desarrollos con SegmentedControl. */}
        <div className="flex flex-col gap-3 lg:hidden">
          <SegmentedControl
            block
            label="Desarrollo"
            value={String(tabAngle?.slot ?? 1)}
            onChange={(v) => {
              setTab(Number(v));
              setEditing(null);
            }}
            // Con 3 ángulos los nombres no caben: la pestaña dice el número y la tarjeta, el nombre.
            options={chosen.map((a) => ({ value: String(a.slot), label: chosen.length > 2 ? `Ángulo ${a.slot}` : `${a.slot} · ${a.name}` }))}
          />
          {tabAngle ? dev(tabAngle, true) : null}
          <Button variant="ghost" className="self-start" onClick={() => setChoosing(true)}>
            Cambiar ángulos
          </Button>
        </div>
        {/* Escritorio: lado a lado. */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(--spacing(85),1fr))] lg:items-start">{chosen.map((a) => dev(a, false))}</div>
      </div>
    );
    footer = desktop ? (
      <StickyActions
        variant="bar"
        summary={done ? "Los desarrollos están aprobados. La página del producto sirve a todos tus ángulos." : `Aprueba los ${chosen.length} desarrollos para seguir con Imágenes.`}
        className="lg:px-8"
      >
        <Button variant="ghost" onClick={() => setChoosing(true)}>
          Cambiar ángulos
        </Button>
        {next}
      </StickyActions>
    ) : editing || (!done && currentStatus === "generando") ? null : (
      <StickyActions className="block">
        {done || !currentStatus || !current ? (
          done || !currentStatus ? (
            next
          ) : (
            <AngleDevelopmentActions status={currentStatus} busy={busy?.slot === tabAngle?.slot ? "regenerate" : null} onRegenerate={() => tabAngle && regenerate(tabAngle.slot)} />
          )
        ) : (
          <AngleDevelopmentActions
            status={currentStatus}
            busy={busy?.slot === current.slot ? (busy.what as "approve" | "regenerate" | "save" | "reopen") : null}
            onApprove={() => decide(current, "approve")}
            onReopen={() => decide(current, "reopen")}
            onRegenerate={() => regenerate(current.slot)}
            onEdit={() => setEditing(current.slot)}
          />
        )}
      </StickyActions>
    );
  }

  return (
    // Escritorio: el pie con la acción queda abajo aunque el contenido sea corto (como Información base).
    <div className="flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Ángulos" stageKey="angulos" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title="Ángulos"
        subtitle={subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />

      <div className={cn("flex flex-col gap-4 px-4 pt-2 pb-4 lg:flex-1 lg:px-8 lg:pt-6")}>
        <p className="hidden text-body text-muted-foreground lg:block">{desktopLead(view, approvedCount, expected)}</p>
        {body}
        {error && view !== "failed" ? (
          <p role="alert" className="text-label font-normal text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {footer}
    </div>
  );
}

/** La línea bajo el encabezado del producto en escritorio (el encabezado lo pone el layout). */
function desktopLead(view: string, approved: number, expected: number): string {
  switch (view) {
    case "locked":
      return "Ángulos · se habilita al aprobar tu cliente ideal";
    case "evaluating":
      return "Ángulos · la IA está proponiendo ángulos para testear";
    case "ranking":
      return `Ángulos · elige entre ${MIN_TEST_ANGLES} y ${TEST_ANGLES} para testear, cada uno en su propio conjunto de anuncios.`;
    case "developments":
      return `Ángulos · ${approved} de ${expected} desarrollos aprobados`;
    default:
      return "Ángulos · cómo vas a vender este producto";
  }
}
