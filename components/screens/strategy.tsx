"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Icon, RoleChip, TopBar, notify } from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton, useAiEstimate } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { STRATEGY_STAGE_TITLE } from "@/lib/products/stages";
import { productHref } from "@/lib/routes";
import { MAX_CHOSEN, MIN_CHOSEN } from "@/lib/strategy/catalog";
import type { ProductStrategy, RunStatus, StrategyState, StrategyView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConnectAnthropic } from "./connect-anthropic";
import { StrategyReport } from "./strategy-report";

// Etapa Estrategia (docs/spec-estrategia.md): «Generar estrategia» corre el mega prompt guardado en la
// base con los datos del producto → el informe se va mostrando mientras se escribe → la IA lo pasa a
// datos y muestra los TOP 5 ángulos → el comerciante elige 2 o 3 (uno por conjunto de anuncios) →
// «Usar estos ángulos» habilita Imágenes, la página del producto y Creativos.

const POLL_MS = 3000;
const active = (s?: RunStatus) => s === "queued" || s === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
/** Sin elección guardada, parte de los 3 primeros del TOP 5 (los que el informe probaría primero). */
const initialPicks = (s?: StrategyView) => s?.chosen ?? (s?.angles ?? []).slice(0, MAX_CHOSEN).map((a) => a.index);

export function StrategyScreen({ data }: { data: ProductStrategy }) {
  const router = useRouter();
  const { product } = data;
  const [state, setState] = useState<StrategyState>(data);
  const s = state.strategy;
  const baseHref = productHref(product.id, "importado");
  const working = active(s?.status);

  const [picks, setPicks] = useState<number[]>(() => initialPicks(s));
  const pickKey = `${s?.id}:${s?.status}:${s?.confirmedAt}`;
  const [pickFor, setPickFor] = useState(pickKey);
  if (pickKey !== pickFor) {
    setPickFor(pickKey);
    setPicks(initialPicks(s));
  }
  const [choosing, setChoosing] = useState(false);
  const [askRegen, setAskRegen] = useState(false);
  const [busy, setBusy] = useState<"generate" | "confirm" | null>(null);
  const [error, setError] = useState<string>();
  const cost = useAiEstimate("strategy");
  const costText = cost ? money(cost.amount, cost.currency) : null;

  // ---------------------------------------------------------------- Sondeo
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) {
      router.refresh();
      if (s?.status === "succeeded") notify("La estrategia está lista: elige los ángulos que vas a testear");
      else if (s?.status === "failed") notify(s.error ?? "No pudimos terminar la estrategia. Toca Volver a generar.");
    }
    wasWorking.current = working;
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.strategy(product.id));
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [working, product.id, router, s?.status, s?.error]);

  // ---------------------------------------------------------------- Acciones
  const generate = async () => {
    setBusy("generate");
    setError(undefined);
    try {
      setState(await productsApi.generateStrategy(product.id));
      setAskRegen(false);
      setChoosing(false);
      router.refresh();
    } catch (e) {
      setError(errorText(e, "No pudimos empezar la estrategia. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (picks.length < MIN_CHOSEN) return;
    setBusy("confirm");
    setError(undefined);
    try {
      setState(await productsApi.confirmStrategy(product.id, picks));
      setChoosing(false);
      notify(picks.length === 2 ? "2 ángulos listos para testear" : `${picks.length} ángulos listos para testear`);
      router.refresh();
    } catch (e) {
      setError(errorText(e, "No pudimos guardar tu elección. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (i: number) => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length >= MAX_CHOSEN ? p : [...p, i]));

  // ---------------------------------------------------------------- Vistas
  let view: "locked" | "connect" | "start" | "working" | "failed" | "choose" | "done";
  if (state.blocker && !state.chosen.length) view = "locked";
  else if (working) view = "working";
  else if (!s) view = product.aiConnected === false ? "connect" : "start";
  else if (s.status === "failed") view = "failed";
  else if (s.status === "succeeded" && (!s.confirmedAt || choosing)) view = "choose";
  else view = state.chosen.length ? "done" : "choose";

  const reportDetails = (open = false) =>
    s?.report ? (
      <details open={open} className="group rounded-lg border bg-card">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-2 px-4 text-row font-semibold">
          Informe completo
          <Icon name="chevron-right" size="sm" className="transition-transform group-open:rotate-90" />
        </summary>
        <StrategyReport text={s.report} className="border-t px-4 pt-2 pb-4" />
      </details>
    ) : null;

  const regenConfirm = (
    <div role="group" aria-labelledby="regen" className="flex w-full flex-col gap-2.5 rounded-lg border bg-card p-4 text-left">
      <h3 id="regen" className="text-heading">
        ¿Volver a generar la estrategia?
      </h3>
      <p className="m-0 text-label font-normal text-muted-foreground">
        {costText ? (
          <>
            Cuesta cerca de <b className="font-medium text-foreground tabular-nums">{costText}</b>.{" "}
          </>
        ) : null}
        Tus ángulos actuales siguen funcionando hasta que elijas otros de la estrategia nueva.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => setAskRegen(false)}>
          Cancelar
        </Button>
        <Button size="sm" variant="primary" icon="sparkle" loading={busy === "generate"} onClick={generate}>
          Volver a generar
        </Button>
      </div>
    </div>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (view === "locked") {
    body = (
      <div className="flex gap-3 rounded-lg border bg-card p-4 lg:max-w-content">
        <Icon name="lock" className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-row">Se habilita con los datos del producto y el precio</p>
          <p className="text-label font-normal text-muted-foreground">{state.blocker}</p>
        </div>
      </div>
    );
    footer = (
      <StickyActions variant="bar" summary="La estrategia parte de los datos del producto y su precio." className="lg:px-8">
        <Button variant="primary" size="lg" iconEnd="chevron-right" href={baseHref} className="max-lg:w-full lg:h-control lg:text-row">
          Ir a Información base
        </Button>
      </StickyActions>
    );
  } else if (view === "connect") {
    body = <ConnectAnthropic what="escribe la estrategia de venta" className="lg:max-w-content" />;
  } else if (view === "start" || view === "failed") {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        {view === "failed" ? (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive bg-destructive-soft p-4 text-destructive">
            <Icon name="alert" />
            <div className="min-w-0 flex-1">
              <p className="text-row">No se pudo terminar la estrategia</p>
              <p className="text-label font-normal">{s?.error ?? "Toca Volver a generar."}</p>
            </div>
          </div>
        ) : null}
        <section aria-labelledby="que-hara" className="rounded-lg border bg-card p-4">
          <h2 id="que-hara" className="text-heading">
            Qué hará la IA
          </h2>
          <ol className="mt-2 mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-small">
            <li>Analiza tu producto con su imagen, su precio y tus packs.</li>
            <li>Define a tu cliente ideal, escribe 40 hooks y arma los ángulos de venta, los conceptos UGC, las objeciones y las ofertas.</li>
            <li>
              Prioriza como un media buyer: te propone el <b>TOP 5 de ángulos</b> y tú eliges 2 o 3 para testear.
            </li>
          </ol>
          <p className="text-label font-normal text-muted-foreground">Nada se publica sin tu OK.</p>
        </section>
        {reportDetails()}
      </div>
    );
    footer = (
      <StickyActions variant="bar" stack summary="Toma unos 4 minutos. Puedes salir de esta pantalla." mobileNote="Toma unos 4 minutos." className="lg:px-8">
        <Button variant="primary" size="lg" icon="sparkle" loading={busy === "generate"} onClick={generate} className="max-lg:w-full lg:h-control lg:text-row">
          {view === "failed" ? "Volver a generar" : costText ? `Generar estrategia por ~${costText}` : "Generar estrategia"}
        </Button>
      </StickyActions>
    );
  } else if (view === "working") {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        <section role="status" aria-label="Estrategia en curso" className="flex gap-3 rounded-lg border bg-card p-4">
          <Icon name="loader" className="motion-exempt animate-spin text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-row">{s?.step === "extract" ? "La IA está leyendo los ángulos del informe" : "La IA está escribiendo tu estrategia"}</p>
            <p className="text-label font-normal text-muted-foreground">Toma unos 4 minutos. Puedes salir de esta pantalla: te avisamos en Hoy.</p>
          </div>
        </section>
        {s?.report ? (
          <section aria-label="Informe en curso" className="rounded-lg border bg-card p-4">
            <StrategyReport text={s.report} />
          </section>
        ) : null}
      </div>
    );
    footer = (
      <StickyActions variant="bar" summary="Puedes salir de esta pantalla: te avisamos en Hoy cuando esté lista." className="lg:px-8">
        <Button variant="primary" size="lg" loading className="max-lg:w-full lg:h-control lg:text-row">
          Generando estrategia
        </Button>
      </StickyActions>
    );
  } else if (view === "choose" && s) {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        {s.firstDollar.length ? (
          <section aria-labelledby="primer-dolar" className="flex gap-2 rounded-md bg-muted p-3 text-label font-normal">
            <Icon name="sparkle" size="sm" className="mt-px" />
            <div className="min-w-0 flex-1">
              <h2 id="primer-dolar" className="font-semibold">
                Con tu primer dólar en publicidad, la IA probaría:
              </h2>
              <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4">
                {s.firstDollar.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}
        <section aria-labelledby="top5" className="flex flex-col gap-3">
          <h2 id="top5" className="flex items-baseline justify-between text-heading">
            TOP 5 ángulos <span className="text-label font-normal text-muted-foreground">{picks.length} elegidos</span>
          </h2>
          {s.angles.map((a) => {
            const pos = picks.indexOf(a.index);
            const picked = pos >= 0;
            const full = !picked && picks.length >= MAX_CHOSEN;
            return (
              <article key={a.index} aria-labelledby={`ang-${a.index}`} className={cn("flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-4", picked && "border-2 border-primary p-3.75")}>
                <div className="flex flex-wrap items-center gap-2">
                  {picked ? <RoleChip slot={pos + 1} short /> : null}
                  <span className="ml-auto text-label font-normal text-muted-foreground">
                    #{a.index + 1} · {a.frameName}
                  </span>
                </div>
                <h3 id={`ang-${a.index}`} className="text-heading">
                  {a.title}
                </h3>
                {a.hook ? <p className="border-l-2 border-muted-foreground pl-3 text-row">«{a.hook}»</p> : null}
                <dl className="flex flex-col gap-1.5 text-small">
                  <div>
                    <dt className="inline font-semibold">Promesa: </dt>
                    <dd className="inline">{a.promise}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Para quién: </dt>
                    <dd className="inline">{a.segment}</dd>
                  </div>
                </dl>
                {a.why ? <p className="text-label font-normal text-muted-foreground">{a.why}</p> : null}
                <Button size="sm" variant={picked ? "secondary" : "primary"} icon={picked ? "x" : "check"} disabled={full} onClick={() => toggle(a.index)} className="self-start">
                  {picked ? "Quitar" : full ? `Ya elegiste ${MAX_CHOSEN}` : "Testear este"}
                </Button>
              </article>
            );
          })}
        </section>
        {reportDetails()}
      </div>
    );
    footer = (
      <StickyActions variant="bar" stack summary={picks.length < MIN_CHOSEN ? `Elige entre ${MIN_CHOSEN} y ${MAX_CHOSEN} ángulos.` : "Cada ángulo va en su propio conjunto de anuncios."} className="lg:px-8">
        {s.confirmedAt ? (
          <Button variant="ghost" onClick={() => setChoosing(false)}>
            Cancelar
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          iconEnd="chevron-right"
          loading={busy === "confirm"}
          disabled={picks.length < MIN_CHOSEN}
          onClick={confirm}
          className="max-lg:w-full lg:h-control lg:text-row"
        >
          {picks.length >= MIN_CHOSEN ? `Usar estos ${picks.length} ángulos` : "Usar estos ángulos"}
        </Button>
      </StickyActions>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4 lg:max-w-content">
        <section aria-labelledby="tu-testeo" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <h2 id="tu-testeo" className="text-heading">
            Tus ángulos para testear
          </h2>
          <ol className="flex flex-col gap-2">
            {state.chosen.map((a) => (
              <li key={a.slot} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-row">
                  <RoleChip slot={a.slot} short />
                  <span className="min-w-0 flex-1">{a.title}</span>
                </span>
                {a.hook ? <span className="pl-1 text-small text-muted-foreground">«{a.hook}»</span> : null}
              </li>
            ))}
          </ol>
          <p className="text-label font-normal text-muted-foreground">Cada ángulo va en su propio conjunto de anuncios; la página del producto sirve a todos.</p>
        </section>
        {askRegen ? regenConfirm : null}
        {reportDetails()}
      </div>
    );
    footer = (
      <StickyActions variant="bar" stack className="lg:px-8">
        {s?.status === "succeeded" ? (
          <Button variant="ghost" onClick={() => setChoosing(true)}>
            Cambiar ángulos
          </Button>
        ) : null}
        {!askRegen && product.aiConnected !== false ? (
          <Button variant="ghost" icon="sparkle" onClick={() => setAskRegen(true)}>
            Volver a generar
          </Button>
        ) : null}
        <Button variant="primary" size="lg" iconEnd="chevron-right" href={productHref(product.id, "imagenes")} className="max-lg:w-full lg:h-control lg:text-row">
          Siguiente: imágenes
        </Button>
      </StickyActions>
    );
  }

  const subtitle =
    view === "choose" ? `TOP 5 · ${picks.length} elegidos` : view === "working" ? "Generando estrategia" : view === "done" ? `${state.chosen.length} ángulos para testear` : "Cómo vas a vender este producto";

  return (
    <div className="flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage={STRATEGY_STAGE_TITLE} stageKey="angulos" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title={STRATEGY_STAGE_TITLE}
        subtitle={subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-4 lg:flex-1 lg:px-8 lg:pt-6">
        <p className="hidden text-body text-muted-foreground lg:block">
          {STRATEGY_STAGE_TITLE} · {view === "choose" ? `elige entre ${MIN_CHOSEN} y ${MAX_CHOSEN} ángulos para testear, cada uno en su propio conjunto de anuncios.` : subtitle.toLowerCase()}
        </p>
        {body}
        {error ? (
          <p role="alert" className="text-label font-normal text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {footer}
    </div>
  );
}
