"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AngleCard,
  AngleDevelopment,
  AngleDevelopmentActions,
  AngleSuggestion,
  Button,
  Icon,
  IcpSummary,
  OptionList,
  SegmentedControl,
  TopBar,
  notify,
  notifyUndo,
  type AngleDevelopmentStatus,
  type AngleDevelopmentValue,
  type AngleRoleUi,
} from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton, useAiEstimate } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { ANGLES, type AngleRole, type SalesAngle } from "@/lib/angles/catalog";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { money } from "@/lib/format";
import { COPY_STAGE_TITLE } from "@/lib/products/stages";
import { productHref } from "@/lib/routes";
import type { AngleBriefView, AngleOption, AnglesState, ProductAngles, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Ángulos (PantallasAngulos1/2 y PantallasAngulosEscritorio1/2): el cliente ideal aprobado →
// “Elegir ángulos con IA” → ranking de los 6 con la sugerencia → el comerciante confirma principal y
// secundario → 2 desarrollos en paralelo → aprobar los 2 habilita la página del producto (Textos).

const POLL_MS = 2500;
const UI_ROLE: Record<AngleRole, AngleRoleUi> = { primary: "principal", secondary: "secundario" };
const DATA_ROLE: Record<AngleRoleUi, AngleRole> = { principal: "primary", secundario: "secondary" };
const ROLES: AngleRole[] = ["primary", "secondary"];

type Pick = Partial<Record<AngleRole, SalesAngle>>;
type Sheet = { kind: "role"; role: AngleRole } | { kind: "use"; angle: SalesAngle } | null;

const active = (s?: RunStatus) => s === "queued" || s === "running";
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
  const generating = ROLES.some((r) => active(briefs[r]?.generation));
  const locked = !state.avatar?.approved;

  // Elección en curso: parte de lo confirmado o de la sugerencia; una evaluación nueva la reinicia.
  const [pick, setPick] = useState<Pick>(() => ranking?.chosen ?? ranking?.suggested ?? {});
  const rankingKey = `${ranking?.id}:${ranking?.status}:${ranking?.confirmedAt}`;
  const [pickFor, setPickFor] = useState(rankingKey);
  if (rankingKey !== pickFor) {
    setPickFor(rankingKey);
    setPick(ranking?.chosen ?? ranking?.suggested ?? {});
  }
  const [choosing, setChoosing] = useState(false);
  // En escritorio, el principal abre con su cálculo a la vista (como el diseño); tocar lo cambia.
  const [expandedState, setExpanded] = useState<SalesAngle | null | undefined>(undefined);
  const expanded = expandedState === undefined ? (desktop ? (pick.primary ?? null) : null) : expandedState;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetValue, setSheetValue] = useState<string>("");
  const [tab, setTab] = useState<AngleRole>("primary");
  const [editing, setEditing] = useState<AngleRole | null>(null);
  const [busy, setBusy] = useState<{ what: string; role?: AngleRole } | null>(null);
  const [error, setError] = useState<string>();

  // ---------------------------------------------------------------- Sondeo
  const wasWorking = useRef(evaluating || generating);
  useEffect(() => {
    const working = evaluating || generating;
    if (wasWorking.current && !working) {
      // La ruta, el encabezado y Hoy se leen en el servidor.
      router.refresh();
      if (ranking?.status === "succeeded" && !ranking.chosen) notify("Los 6 ángulos están evaluados: elige principal y secundario");
      else if (ranking?.status === "failed") notify(ranking.error ?? "No pudimos evaluar los ángulos. Toca Reintentar.");
      else if (ROLES.every((r) => briefs[r]?.generation === "succeeded")) notify("Los 2 desarrollos están listos para revisar");
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
  const run = async (what: string, fn: () => Promise<AnglesState>, fallback: string, role?: AngleRole) => {
    setBusy({ what, role });
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
  const hasBriefs = ROLES.some((r) => briefs[r]);
  const [askReeval, setAskReeval] = useState(false);
  const rankingCost = useAiEstimate("angle_ranking");
  const briefCost = useAiEstimate("angle_brief");
  const evaluate = () => (hasBriefs ? setAskReeval(true) : runEvaluate());

  const confirm = async () => {
    if (!pick.primary || !pick.secondary) return;
    const next = await run("confirm", () => productsApi.confirmAngles(product.id, pick.primary!, pick.secondary!), "No pudimos guardar tu elección. Intenta de nuevo.");
    if (next) {
      setChoosing(false);
      setTab("primary");
    }
  };

  const decide = (role: AngleRole, action: "approve" | "reopen") => {
    const b = briefs[role];
    if (!b) return;
    run(action, () => productsApi.decideAngleBrief(product.id, b.id, action), "No pudimos guardar tu decisión. Intenta de nuevo.", role).then((next) => {
      if (!next || action !== "approve") return;
      notifyUndo(`${UI_ROLE[role] === "principal" ? "Principal" : "Secundario"} aprobado`, () => decide(role, "reopen"));
      // Como la revisión de textos: pasa sola al siguiente pendiente.
      const other = role === "primary" ? "secondary" : "primary";
      if (next.briefs[other] && next.briefs[other]!.status !== "aprobado") setTab(other);
    });
  };

  const regenerate = (role: AngleRole) => {
    const b = briefs[role];
    if (!b) return;
    setEditing(null);
    run("regenerate", () => productsApi.regenerateAngleBrief(product.id, b.id), "No pudimos regenerar este desarrollo. Intenta de nuevo.", role);
  };

  const save = (role: AngleRole, v: AngleDevelopmentValue) => {
    const b = briefs[role];
    if (!b) return;
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
      role,
    ).then((next) => {
      if (!next) return;
      setEditing(null);
      notifyUndo("Cambios guardados y desarrollo aprobado", () => decide(role, "reopen"));
    });
  };

  const continueToCopy = async () => {
    setBusy({ what: "copy" });
    try {
      await productsApi.writeCopy(product.id);
    } catch {
      // Si no se pudo empezar (tope diario, conexión), la página lo dice y ofrece empezar desde ahí.
    }
    router.push(productHref(product.id, "textos"));
  };

  /** Pone un ángulo en un papel; si ya estaba en el otro, se intercambian. */
  const assign = (role: AngleRole, angle: SalesAngle) => {
    setPick((p) => {
      const other = role === "primary" ? "secondary" : "primary";
      return { ...p, [role]: angle, [other]: p[other] === angle ? p[role] : p[other] };
    });
  };
  const remove = (angle: SalesAngle) => setPick((p) => ({ primary: p.primary === angle ? undefined : p.primary, secondary: p.secondary === angle ? undefined : p.secondary }));

  // ---------------------------------------------------------------- Piezas
  const byAngle = useMemo(() => new Map((ranking?.angles ?? []).map((a) => [a.angle, a])), [ranking]);
  const roleOf = (a: SalesAngle): AngleRoleUi | undefined => (pick.primary === a ? "principal" : pick.secondary === a ? "secundario" : undefined);
  const suggestedRoleOf = (a: SalesAngle): AngleRoleUi | undefined =>
    ranking?.suggested?.primary === a ? "principal" : ranking?.suggested?.secondary === a ? "secundario" : undefined;
  const changed = Boolean(ranking?.suggested && (pick.primary !== ranking.suggested.primary || pick.secondary !== ranking.suggested.secondary));
  const combo = ranking?.combos.find((c) => c.primary === pick.primary && c.secondary === pick.secondary)?.text;

  const card = (a: AngleOption) => (
    <AngleCard
      key={a.angle}
      rank={a.rank}
      name={a.name}
      score={a.score}
      role={roleOf(a.angle)}
      suggestedRole={suggestedRoleOf(a.angle)}
      fit={a.why}
      risks={a.risks.map((r) => ({ text: r.text, penalty: r.penalty, fix: r.fix ? FIX_LABEL[r.fix] : undefined }))}
      breakdown={a.breakdown}
      expanded={expanded === a.angle}
      onToggle={() => setExpanded(expanded === a.angle ? null : a.angle)}
      onUse={() => {
        setSheet({ kind: "use", angle: a.angle });
        setSheetValue(!pick.primary ? "primary" : "secondary");
      }}
      onRemove={() => remove(a.angle)}
      onFix={(r) => router.push(fixHref(a.risks.find((k) => k.text === r.text)?.fix))}
    />
  );

  const suggestion = ranking?.status === "succeeded" && (
    <AngleSuggestion
      principal={pick.primary && ANGLES[pick.primary].name}
      principalScore={pick.primary && byAngle.get(pick.primary)?.score}
      secundario={pick.secondary && ANGLES[pick.secondary].name}
      secundarioScore={pick.secondary && byAngle.get(pick.secondary)?.score}
      combo={combo}
      changed={changed}
      missing={ranking.missing.map((m) => ({ text: m.text, action: m.fix === "reviews" ? "Importar" : m.fix ? "Agregar" : undefined, onAction: () => router.push(fixHref(m.fix)) }))}
      onPick={(r) => {
        const role = DATA_ROLE[r];
        setSheet({ kind: "role", role });
        setSheetValue(pick[role] ?? "");
      }}
    />
  );

  const avatarChanged = ranking?.avatarChanged ? (
    <div role="status" className="flex gap-3 rounded-lg border border-warning bg-warning-soft p-4 text-warning">
      <Icon name="alert" />
      <p className="min-w-0 flex-1 text-label font-normal">Tu cliente ideal cambió después de esta evaluación. Vuelve a evaluar para que los ángulos partan del nuevo.</p>
    </div>
  ) : null;

  const icp = state.avatar ? <IcpSummary text={state.avatar.summary} tags={state.avatar.tags} approved={state.avatar.approved} action="Ver o cambiar" href={baseHref} /> : null;

  // ---------------------------------------------------------------- Vistas
  let view: "locked" | "start" | "evaluating" | "failed" | "ranking" | "developments";
  if (locked) view = "locked";
  else if (!ranking) view = "start";
  else if (evaluating) view = "evaluating";
  else if (ranking.status === "failed") view = "failed";
  else if (!ranking.chosen || choosing) view = "ranking";
  else view = "developments";

  const approvedCount = ROLES.filter((r) => briefs[r]?.status === "aprobado" && briefs[r]?.generation === "succeeded").length;
  const subtitle =
    view === "ranking"
      ? `6 evaluados · ${changed ? "tu elección" : "sugerencia lista"}`
      : view === "developments"
        ? `${approvedCount} de 2 desarrollos aprobados`
        : view === "evaluating"
          ? "Evaluando 6 ángulos"
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
        {icp}
        <section aria-labelledby="que-hara" className="rounded-lg border bg-card p-4">
          <h2 id="que-hara" className="text-heading">
            Qué hará la IA
          </h2>
          <ol className="mt-2 mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-small">
            <li>
              Evalúa <b>6 ángulos</b> de venta con tu cliente ideal, tu información y tu precio.
            </li>
            <li>Te los muestra todos con su puntaje, sus motivos y sus riesgos.</li>
            <li>
              Sugiere un <b>principal</b> (el gancho) y un <b>secundario</b> (el refuerzo). Tú decides.
            </li>
          </ol>
          <p className="text-label font-normal text-muted-foreground">No inventa pruebas: si falta un experto o reseñas reales, baja el puntaje del ángulo que las necesita.</p>
        </section>
      </div>
    );
    footer = (
      <StickyActions variant="bar" stack summary="Toma alrededor de un minuto. Nada se publica sin tu OK." mobileNote="Toma alrededor de un minuto." className="lg:px-8">
        <Button variant="primary" size="lg" icon="sparkle" loading={busy?.what === "evaluate"} onClick={evaluate} className="max-lg:w-full lg:h-control lg:text-row">
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
            <p className="text-row">La IA está evaluando 6 ángulos</p>
            <p className="text-label font-normal text-muted-foreground">Con tu cliente ideal, tu información y tu precio. Puedes salir de esta pantalla: te avisamos en Hoy.</p>
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
    const confirmButton = (
      <Button
        variant="primary"
        size="lg"
        iconEnd="chevron-right"
        block
        loading={busy?.what === "confirm"}
        disabled={!pick.primary || !pick.secondary}
        onClick={confirm}
        className="lg:h-control lg:text-row"
      >
        Confirmar y desarrollar
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
          Si nada cambió y eliges los mismos ángulos, conservas tus desarrollos. Si cambió algo (reseñas, cliente ideal o precio), se escriben de nuevo
          {briefCost ? ` por cerca de ${money(briefCost.amount * 2, briefCost.currency)}` : ""}.
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
    const confirmNote = !pick.primary || !pick.secondary ? "Elige un principal y un secundario." : "Se generan los 2 desarrollos en paralelo.";
    body = (
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_--spacing(90)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          {avatarChanged}
          <div className="lg:hidden">{suggestion}</div>
          <h2 className="flex items-baseline justify-between pt-1 text-label font-semibold text-muted-foreground lg:hidden">
            Ranking completo <span className="font-normal">de mayor a menor</span>
          </h2>
          {/* 2 columnas solo si cada tarjeta tiene al menos 300px (escritorio angosto: 1). */}
          <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(--spacing(75),1fr))] lg:items-start">{ranking.angles.map(card)}</div>
          <div className="flex flex-wrap gap-2 lg:hidden">
            {askReeval ? (
              reevalConfirm("m")
            ) : (
              <Button variant="ghost" icon="sparkle" loading={busy?.what === "evaluate"} onClick={evaluate}>
                Volver a evaluar
              </Button>
            )}
            {choosing && !askReeval ? (
              <Button variant="ghost" onClick={() => setChoosing(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
        {/* Escritorio: la elección fija a la derecha, junto a “Confirmar y desarrollar”. */}
        <aside aria-label="Tu elección" className="sticky top-6 hidden flex-col gap-3 lg:flex">
          {suggestion}
          {confirmButton}
          <p className="text-center text-label font-normal text-muted-foreground">{confirmNote}</p>
          <div className="flex justify-center gap-2">
            {askReeval ? (
              reevalConfirm("d")
            ) : (
              <Button variant="ghost" icon="sparkle" loading={busy?.what === "evaluate"} onClick={evaluate}>
                Volver a evaluar
              </Button>
            )}
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
    const dev = (role: AngleRole, hideActions: boolean) => {
      const b = briefs[role];
      if (!b) return null;
      return (
        <AngleDevelopment
          key={b.id}
          role={UI_ROLE[role]}
          angle={b.name}
          status={devStatus(b)}
          error={b.error}
          {...devValue(b)}
          hideActions={hideActions}
          editing={editing === role}
          busy={busy?.role === role ? (busy.what as "approve" | "regenerate" | "save" | "reopen") : null}
          onApprove={() => decide(role, "approve")}
          onReopen={() => decide(role, "reopen")}
          onRegenerate={() => regenerate(role)}
          onEdit={() => setEditing(role)}
          onCancelEdit={() => setEditing(null)}
          onSave={(v) => save(role, v)}
        />
      );
    };
    const done = approvedCount === 2;
    const nextClass = "max-lg:w-full lg:h-control lg:text-row";
    // «Continuar» ya dispara la escritura de la página (design-system/textos.md › start); si ya
    // estaba escrita, solo lleva a ella.
    const next = (
      <Button variant="primary" size="lg" iconEnd="chevron-right" disabled={!done} loading={busy?.what === "copy"} onClick={continueToCopy} className={nextClass}>
        Continuar: {COPY_STAGE_TITLE}
      </Button>
    );
    const current = briefs[tab];
    body = (
      <div className="flex flex-col gap-3">
        {avatarChanged}
        {/* Móvil: se navega entre los dos con SegmentedControl. */}
        <div className="flex flex-col gap-3 lg:hidden">
          <SegmentedControl
            block
            label="Desarrollo"
            value={tab}
            onChange={(v) => {
              setTab(v as AngleRole);
              setEditing(null);
            }}
            options={ROLES.map((r, i) => ({ value: r, label: `${i + 1} · ${briefs[r]?.name ?? ""}` }))}
          />
          {dev(tab, true)}
          <Button variant="ghost" className="self-start" onClick={() => setChoosing(true)}>
            Cambiar ángulos
          </Button>
        </div>
        {/* Escritorio: lado a lado. */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(--spacing(85),1fr))] lg:items-start">
          {dev("primary", false)}
          {dev("secondary", false)}
        </div>
      </div>
    );
    footer = desktop ? (
      <StickyActions variant="bar" summary={done ? "Los 2 desarrollos están aprobados. La página del producto se escribe con ellos." : "Aprueba los 2 desarrollos para escribir la página del producto."} className="lg:px-8">
        <Button variant="ghost" onClick={() => setChoosing(true)}>
          Cambiar ángulos
        </Button>
        {next}
      </StickyActions>
    ) : editing || (current && !done && devStatus(current) === "generando") ? null : (
      <StickyActions className="block">
        {done || !current ? (
          next
        ) : (
          <AngleDevelopmentActions
            status={devStatus(current)}
            busy={busy?.role === tab ? (busy.what as "approve" | "regenerate" | "save" | "reopen") : null}
            onApprove={() => decide(tab, "approve")}
            onReopen={() => decide(tab, "reopen")}
            onRegenerate={() => regenerate(tab)}
            onEdit={() => setEditing(tab)}
          />
        )}
      </StickyActions>
    );
  }

  // ---------------------------------------------------------------- Hojas (móvil abajo, escritorio a la derecha)
  const sheetAngle = sheet?.kind === "use" ? byAngle.get(sheet.angle) : undefined;
  const sheetTitle = sheet?.kind === "role" ? (sheet.role === "primary" ? "Ángulo principal" : "Ángulo secundario") : sheetAngle ? `Usar ${sheetAngle.name}` : "";
  let sheetBody: React.ReactNode = null;
  let sheetAction: React.ReactNode = null;
  if (sheet?.kind === "role" && ranking) {
    const other = sheet.role === "primary" ? "secondary" : "primary";
    // Como en el diseño: el que ya ocupa el otro papel va al final, deshabilitado.
    const ordered = [...ranking.angles.filter((a) => pick[other] !== a.angle), ...ranking.angles.filter((a) => pick[other] === a.angle)];
    const options = ordered.map((a) => {
      const penalty = a.risks.find((r) => r.penalty);
      const risk = a.risks[0];
      const suggested = ranking.suggested?.[sheet.role] === a.angle;
      if (pick[other] === a.angle) return { value: a.angle, title: a.name, meta: `Ya es el ${UI_ROLE[other]}`, disabled: true };
      return {
        value: a.angle,
        title: a.name,
        meta: `${a.score}/100${suggested ? " · sugerido por la IA" : risk ? ` · riesgo: ${risk.text.toLowerCase()}` : ""}`,
        tag: suggested ? "Sugerido" : undefined,
        tone: suggested ? undefined : penalty && penalty.penalty! >= 40 ? ("danger" as const) : risk ? ("warning" as const) : undefined,
      };
    });
    sheetBody = (
      <OptionList
        label={sheet.role === "primary" ? "Define el gancho que abre el anuncio" : "Refuerza el argumento del principal"}
        name={`angulo-${sheet.role}`}
        value={sheetValue}
        onChange={setSheetValue}
        options={options}
      />
    );
    const chosen = sheetValue as SalesAngle;
    sheetAction = (
      <Button
        variant="primary"
        size="lg"
        block
        icon="check"
        disabled={!chosen}
        onClick={() => {
          assign(sheet.role, chosen);
          setSheet(null);
        }}
      >
        {chosen ? `Usar ${ANGLES[chosen].name}` : "Elige un ángulo"}
      </Button>
    );
  } else if (sheet?.kind === "use" && sheetAngle) {
    const occupant = (r: AngleRole) => (pick[r] && pick[r] !== sheetAngle.angle ? `Reemplaza a ${ANGLES[pick[r]!].name}` : pick[r] === sheetAngle.angle ? "Ya está en este papel" : "Libre");
    sheetBody = (
      <OptionList
        label="Úsalo como"
        name="papel"
        value={sheetValue}
        onChange={setSheetValue}
        options={ROLES.map((r) => ({ value: r, title: r === "primary" ? "Principal · el gancho" : "Secundario · el refuerzo", meta: occupant(r) }))}
      />
    );
    const role = sheetValue as AngleRole;
    sheetAction = (
      <Button
        variant="primary"
        size="lg"
        block
        icon="check"
        disabled={!role}
        onClick={() => {
          assign(role, sheetAngle.angle);
          setSheet(null);
        }}
      >
        {role === "primary" ? "Usar como principal" : "Usar como secundario"}
      </Button>
    );
  }

  return (
    // Escritorio: el pie con la acción queda abajo aunque el contenido sea corto (como Información base).
    <div className="flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Ángulos" stageKey="angulos" image={product.image} />
      <TopBar back={product.name} backHref={`/products/${product.id}`} title="Ángulos" subtitle={subtitle} actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        } className="sticky top-0 z-sticky lg:hidden" />

      <div className={cn("flex flex-col gap-4 px-4 pt-2 pb-4 lg:flex-1 lg:px-8 lg:pt-6")}>
        <p className="hidden text-body text-muted-foreground lg:block">{desktopLead(view, approvedCount)}</p>
        {body}
        {error && view !== "failed" ? (
          <p role="alert" className="text-label font-normal text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {footer}

      <Drawer open={!!sheet} onOpenChange={(o) => !o && setSheet(null)} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
        <DrawerContent className="max-h-[85svh] lg:max-h-none">
          <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3 lg:pt-4">
            <DrawerTitle className="text-heading">{sheetTitle}</DrawerTitle>
            <DrawerDescription className="sr-only">Elige qué ángulo cumple cada papel.</DrawerDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{sheetBody}</div>
          <div className="border-t px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]">{sheetAction}</div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** La línea bajo el encabezado del producto en escritorio (el encabezado lo pone el layout). */
function desktopLead(view: string, approved: number): string {
  switch (view) {
    case "locked":
      return "Ángulos · se habilita al aprobar tu cliente ideal";
    case "evaluating":
      return "Ángulos · la IA está evaluando 6 ángulos";
    case "ranking":
      return "Ángulos · 6 evaluados. Elige un principal (el gancho) y un secundario (el refuerzo).";
    case "developments":
      return `Ángulos · ${approved} de 2 desarrollos aprobados`;
    default:
      return "Ángulos · cómo vas a vender este producto";
  }
}
