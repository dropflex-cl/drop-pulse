"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  ClipRow,
  EmptyState,
  Field,
  KeyframeTile,
  MontagePackage,
  Notice,
  ScriptGuard,
  SegmentedControl,
  ScriptShot,
  UgcStepper,
  VideoUpload,
  notify,
  notifyUndo,
  type ClipState,
  type KeyframeState,
} from "@/components/df";
import { useLocalCost, useStepCost } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { mediaFacts } from "@/lib/ads/client";
import { durationLabel } from "@/lib/ads/media";
import { ProductApiClientError, productsApi, uploadFinalVideo } from "@/lib/products/client";
import type { VideoCardView, VideoShotView, VideoStep, VideosState } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { VideoFormat } from "@/lib/video/catalog";
import { shotCost } from "@/lib/video/cost";
import type { UgcScript } from "@/lib/video/schemas";
import { scriptTimeline, type TimelineShot } from "@/lib/video/timeline";

// Pestaña Videos de Creativos (design-system/creativos.md › 3, docs/spec-video-ugc.md §2): un video UGC
// de ~30 s por ángulo en 5 pasos. Guion (centavos) → imágenes clave (se aprueban una a una) → clips (lo
// caro) → montaje en el equipo del comerciante con el script → video final, que al aprobarlo pasa a
// Anuncios. Arriba, el ángulo y los pasos; abajo, el paso que toca. En escritorio: los pasos a la
// izquierda, el trabajo al centro y el paso siguiente a la derecha.

const POLL_MS = 4000;
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
const busyShot = (s: VideoShotView) => s.render === "queued" || s.render === "running";
const STEP_N: Record<VideoStep, number> = { script: 1, keyframes: 2, clips: 3, montage: 4, final: 5 };
/** Lo que cambia en la pantalla según el formato del video (docs/spec-video-ugc.md §11). */
const FORMAT: Record<VideoFormat, { option: string; title: string; body: string; guard: string; character: string }> = {
  ugc: {
    option: "Persona",
    title: "Un UGC de ~30 s para este ángulo",
    body: "Una persona de IA habla a cámara. Claude escribe las tomas habladas, las de apoyo, los textos en pantalla y el cierre, desde el desarrollo del ángulo, tu cliente ideal y tu diferenciador.",
    guard: "La persona muestra el producto. No dice ser clienta ni cuenta resultados propios.",
    character: "la persona sola y define su cara",
  },
  mascot: {
    option: "Mascota animada",
    title: "Una mascota animada de ~25 s para este ángulo",
    body: "Lo que tiene el problema, en 3D, cuenta su historia: cómo está, lo que no funcionó, cómo actúa tu producto y el final feliz. Sirve cuando el problema se ve y se puede personificar.",
    guard: "Es una animación: el personaje habla de sí mismo, sin cuerpos reales ni plazos de resultado.",
    character: "el personaje solo y define su cara",
  },
};
const FORMAT_OPTIONS = (["ugc", "mascot"] as const).map((value) => ({ value, label: FORMAT[value].option }));

type Run = (key: string, fn: () => Promise<VideosState>, fallback: string, done?: string) => Promise<VideosState | null>;

/** El paso en que va la tarjeta: sin guion aprobado, siempre el 1. */
function currentStep(card: VideoCardView): number {
  if (!card.script?.payload || !card.script.approved) return 1;
  return STEP_N[card.step];
}

export function VideosPanel({ productId, initial, desktop }: { productId: string; initial: VideosState; desktop: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<VideosState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [slot, setSlot] = useState<number | undefined>(initial.cards[0]?.slot);
  // El paso que se mira en cada ángulo (uno ya hecho, para revisarlo); sin él, el actual.
  const [viewing, setViewing] = useState<Record<number, number | undefined>>({});

  const working = state.cards.some((c) => c.script?.status === "queued" || c.script?.status === "running" || [...c.keyframes, ...c.clips].some(busyShot));
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) {
      router.refresh();
      notify("Los videos terminaron de avanzar: revisa el paso que toca.");
    }
    wasWorking.current = working;
  }, [working, router]);

  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.videos(productId));
      } catch {
        // El sondeo sigue; un corte de red no es un error de la etapa.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [working, productId]);

  const run: Run = async (key, fn, fallback, done) => {
    setBusy(key);
    setError(undefined);
    try {
      const next = await fn();
      setState(next);
      if (done) notify(done);
      return next;
    } catch (e) {
      setError(errorText(e, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (state.locked) {
    const needsKey = !state.locked.startsWith("Aprueba");
    return (
      <div className="flex flex-1 flex-col justify-center px-4 py-4 lg:mx-auto lg:w-full lg:max-w-content lg:justify-start lg:px-7 lg:pt-8">
        <EmptyState
          icon={needsKey ? "video" : "lock"}
          title={needsKey ? "Conecta Higgsfield" : "Primero, los ángulos"}
          body={needsKey ? `${state.locked} Gemini no hace video.` : state.locked}
          action={
            needsKey ? (
              <Button variant="primary" icon="settings" href="/settings#creativos">
                Ir a Ajustes
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const card = state.cards.find((c) => c.slot === slot) ?? state.cards[0];
  if (!card) return null;
  const current = currentStep(card);
  const shown = Math.min(viewing[card.slot] ?? current, current);
  const view = (n: number) => setViewing((v) => ({ ...v, [card.slot]: n === current ? undefined : n }));

  const chips = (
    <div role="group" aria-label="Ángulo del video" className={cn("flex gap-1.5", desktop ? "flex-wrap" : "overflow-x-auto [scrollbar-width:none]")}>
      {state.cards.map((c) => (
        <button
          key={c.slot}
          type="button"
          aria-pressed={c.slot === card.slot}
          title={c.angleName}
          onClick={() => setSlot(c.slot)}
          className={cn(
            "relative h-8 shrink-0 cursor-pointer rounded-full border px-2.5 text-caption whitespace-nowrap before:absolute before:-inset-y-1.5 before:inset-x-0",
            c.slot === card.slot ? "border-primary bg-primary-soft font-medium text-primary" : "border-input bg-background text-foreground",
          )}
        >
          {`Ángulo ${c.slot}`}
        </button>
      ))}
    </div>
  );

  const step = (
    <CardStep
      key={`${card.slot}-${shown}`}
      productId={productId}
      card={card}
      shown={shown}
      current={current}
      desktop={desktop}
      busy={busy}
      run={run}
      onState={setState}
      onError={setError}
      onView={view}
    />
  );
  const errorLine = error ? (
    <p role="alert" className="text-label font-normal text-destructive">
      {error}
    </p>
  ) : null;

  if (desktop) {
    return (
      <div className="grid flex-1 grid-cols-[--spacing(70)_minmax(0,1fr)_--spacing(95)]">
        <div className="flex flex-col gap-4 border-r p-4">
          {chips}
          <p className="text-label font-normal text-muted-foreground">{card.angleName}</p>
          <UgcStepper current={current} viewing={shown} vertical notes={stepNotes(card)} onSelect={view} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 px-7 pt-5 pb-6">
          {step}
          {errorLine}
        </div>
        <aside aria-label="Paso siguiente" className="flex flex-col gap-3 border-l bg-sidebar px-6 pt-5 pb-6">
          <NextStep card={card} current={current} />
        </aside>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 px-4 pb-2">
        {chips}
        <UgcStepper current={current} viewing={shown} onSelect={view} />
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-4">
        {step}
        {errorLine}
      </div>
    </div>
  );
}

/** Lo que dice cada paso en el stepper vertical (escritorio). */
function stepNotes(card: VideoCardView): (string | undefined)[] {
  const s = card.script;
  const p = s?.payload;
  const kfOk = card.keyframes.filter((k) => k.status === "aprobado").length;
  const clipsDone = card.clips.filter((c) => c.render === "succeeded").length;
  const clipsTotal = p ? p.a_roll.length + p.b_roll.length : 0;
  return [
    !s ? "Por escribir" : s.status === "queued" || s.status === "running" ? "Escribiendo…" : !p ? "No se pudo escribir" : s.approved ? `Aprobado · ${p.a_roll.length + p.b_roll.length} tomas` : "Por aprobar",
    p && s?.approved ? `${kfOk} de ${p.keyframes.length} aprobadas` : undefined,
    card.clips.length ? `${clipsDone} de ${clipsTotal} listos${card.clips.some(busyShot) ? " · 3 a 6 min" : ""}` : undefined,
    "Paquete JSON + script local",
    card.final?.src ? (card.final.status === "aprobado" ? "En Anuncios" : "Por aprobar") : "Sube el MP4 montado",
  ];
}

/** Escritorio, a la derecha: el paso siguiente, deshabilitado, con el motivo. */
function NextStep({ card, current }: { card: VideoCardView; current: number }) {
  const localCost = useLocalCost();
  const p = card.script?.payload;
  const total = p ? p.a_roll.length + p.b_roll.length : 0;
  const head = (title: string, why: string) => (
    <>
      <h2 className="text-heading">{title}</h2>
      <p className="text-caption text-muted-foreground">{why}</p>
    </>
  );
  if (current === 1) return head("Siguiente: imágenes clave", "Se habilita al aprobar el guion. Revisas manos, cara y producto antes de pagar los clips.");
  if (current === 2) return head("Siguiente: clips", `Se habilita cuando apruebes todas las imágenes clave. Los ${total} clips cuestan ${localCost(card.cost.clips)} y tardan de 3 a 6 minutos.`);
  if (current === 3)
    return (
      <>
        {head("Siguiente: montaje", `Se habilita cuando los ${total} clips estén listos.`)}
        <MontagePackage clips={total} file={`video-angulo-${card.slot}.json`} disabled />
      </>
    );
  if (current === 4) return head("Siguiente: video final", "Sube el MP4 que deja el script. Al aprobarlo pasa a Anuncios, en el conjunto de este ángulo.");
  return card.final?.status === "aprobado"
    ? head("Listo", `El video está en Anuncios, en el conjunto del ángulo ${card.slot}.`)
    : head("Último paso", "Aprueba el video para mandarlo a Anuncios.");
}

// ---------------------------------------------------------------- El paso que se mira

function CardStep({
  productId,
  card,
  shown,
  current,
  desktop,
  busy,
  run,
  onState,
  onError,
  onView,
}: {
  productId: string;
  card: VideoCardView;
  shown: number;
  current: number;
  desktop: boolean;
  busy: string | null;
  run: Run;
  onState: (s: VideosState) => void;
  onError: (m: string) => void;
  onView: (n: number) => void;
}) {
  const scriptCost = useStepCost("ugc_script");
  const s = card.script;
  const [chosen, setChosen] = useState<VideoFormat>("ugc");
  // «Otro guion» y «Reintentar» siguen en el formato del guion; sin guion, el elegido.
  const format = s?.format ?? chosen;
  const writeAs = (f: VideoFormat) => run(`write-${card.slot}`, () => productsApi.writeScript(productId, card.slot, f), "No pudimos empezar a escribir el guion.");
  const write = () => writeAs(format);
  const writeLabel = (text: string) => (scriptCost ? `${text} · ${scriptCost}` : text);

  if (shown === 1) {
    if (!s) {
      return (
        <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-4">
          <SegmentedControl label="Formato del video" value={chosen} onChange={(v) => setChosen(v === "mascot" ? "mascot" : "ugc")} options={FORMAT_OPTIONS} block />
          <b className="text-body font-semibold">{FORMAT[chosen].title}</b>
          <span className="text-caption text-muted-foreground">{FORMAT[chosen].body}</span>
          <Button variant="primary" icon="sparkle" loading={busy === `write-${card.slot}`} disabled={Boolean(busy)} onClick={write} className="self-start">
            {writeLabel("Escribir el guion")}
          </Button>
        </div>
      );
    }
    if (s.status === "queued" || s.status === "running") return <EmptyState icon="text" busy title="Escribiendo el guion" body="~1 min. Puedes salir: te avisamos al terminar." />;
    if (s.status === "failed" || !s.payload) {
      return (
        <EmptyState
          icon="alert"
          tone="error"
          title="No se pudo escribir el guion"
          body={s.error}
          action={
            <Button icon="undo" loading={busy === `write-${card.slot}`} disabled={Boolean(busy)} onClick={write}>
              {writeLabel("Reintentar")}
            </Button>
          }
        />
      );
    }
    return (
      <ScriptStep
        key={s.id}
        productId={productId}
        card={card}
        script={s.payload}
        scriptId={s.id}
        approved={s.approved}
        current={current}
        desktop={desktop}
        busy={busy}
        format={format}
        withCost={writeLabel}
        onAnother={write}
        onWriteAs={writeAs}
        run={run}
        onState={onState}
        onError={onError}
        onView={onView}
      />
    );
  }
  if (shown === 2) return <KeyframesStep productId={productId} card={card} format={format} current={current} desktop={desktop} busy={busy} run={run} onView={onView} />;
  if (shown === 3) return <ClipsStep productId={productId} card={card} current={current} desktop={desktop} busy={busy} run={run} onView={onView} />;
  if (shown === 4) return <MontageStep productId={productId} card={card} desktop={desktop} onView={onView} />;
  return <FinalStep productId={productId} card={card} busy={busy} run={run} onState={onState} onError={onError} />;
}

/** Las acciones del paso: fijas abajo en móvil, al pie del paso en escritorio. */
function StepActions({ children, desktop }: { children: React.ReactNode; desktop: boolean }) {
  return desktop ? <div className="flex flex-wrap gap-2 pt-1">{children}</div> : <StickyActions stack="reverse">{children}</StickyActions>;
}

// ---------------------------------------------------------------- 1. Guion

function ScriptStep({
  productId,
  card,
  script: p,
  scriptId,
  approved,
  current,
  desktop,
  busy,
  format,
  withCost,
  onAnother,
  onWriteAs,
  run,
  onState,
  onError,
  onView,
}: {
  productId: string;
  card: VideoCardView;
  script: UgcScript;
  scriptId: string;
  approved: boolean;
  current: number;
  desktop: boolean;
  busy: string | null;
  format: VideoFormat;
  /** El texto de un botón que escribe un guion, con lo que cuesta. */
  withCost: (text: string) => string;
  onAnother: () => void;
  onWriteAs: (f: VideoFormat) => void;
  run: Run;
  onState: (s: VideosState) => void;
  onError: (m: string) => void;
  onView: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState(() => Object.fromEntries(p.a_roll.map((a) => [a.key, a.line])));
  const [beats, setBeats] = useState(() => p.text_beats.map((t) => t.text));
  const [endCard, setEndCard] = useState({ title: p.end_card.title, subtitle: p.end_card.subtitle, cta: p.end_card.cta });
  const [saving, setSaving] = useState(false);
  const timeline = scriptTimeline(p);
  const clipsStarted = card.clips.length > 0;
  const action = (a: "approve" | "unapprove", done?: string) => run(`${a}-${card.slot}`, () => productsApi.scriptAction(productId, scriptId, a), "No pudimos guardar el cambio.", done);

  function cancel() {
    setLines(Object.fromEntries(p.a_roll.map((a) => [a.key, a.line])));
    setBeats(p.text_beats.map((t) => t.text));
    setEndCard({ title: p.end_card.title, subtitle: p.end_card.subtitle, cta: p.end_card.cta });
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      onState(
        await productsApi.editScript(productId, scriptId, {
          a_roll: p.a_roll.map((a) => ({ key: a.key, line: lines[a.key], delivery: a.delivery })),
          text_beats: beats.map((text) => ({ text })),
          end_card: endCard,
        }),
      );
      setEditing(false);
      notify(clipsStarted ? "Guion guardado: las tomas que cambiaste se generan de nuevo" : "Guion guardado");
    } catch (e) {
      onError(errorText(e, "No pudimos guardar el guion."));
    } finally {
      setSaving(false);
    }
  }

  const fit = p.format_fit.recommended;
  // El otro formato de video que recomienda el guionista (se escribe con un toque, reemplaza este guion).
  const other: VideoFormat | null = fit === "mascot" && format === "ugc" ? "mascot" : fit === "ugc_ai" && format === "mascot" ? "ugc" : null;
  const fitTitle =
    fit === "static" ? "Este ángulo rinde más como imagen" : fit === "real_video" ? "Este ángulo pide una persona real" : other === "mascot" ? "Este ángulo rinde más con una mascota animada" : "Este ángulo rinde más con una persona";
  const showFit = fit === "static" || fit === "real_video" || other !== null;
  return (
    <div className="flex flex-col gap-2.5">
      {showFit ? <Notice tone="info" icon={fit === "static" ? "image" : "video"} title={fitTitle} body={`${p.format_fit.why} Informa, no bloquea: puedes seguir con el video.`} /> : null}
      {other ? (
        <Button size="sm" icon="sparkle" loading={busy === `write-${card.slot}`} disabled={Boolean(busy)} onClick={() => onWriteAs(other)} className="self-start">
          {withCost(other === "mascot" ? "Escribir como mascota" : "Escribir con persona")}
        </Button>
      ) : null}
      <p className="text-label font-normal text-muted-foreground">{p.hook_why}</p>
      {timeline.map((t) => (
        <ScriptShot
          key={t.key}
          label={`Toma ${t.n}`}
          kind={t.kind === "a_roll" ? "talk" : "broll"}
          time={t.kind === "a_roll" ? `${t.start}–${(t.start ?? 0) + (t.seconds ?? 0)} s` : `${t.cut} s`}
          line={t.kind === "a_roll" ? (lines[t.key] ?? t.line) : `Imagen de apoyo cuando dice «${t.anchor}»`}
          onscreen={t.beats.length ? t.beats.map((i) => beats[i]) : undefined}
          editing={editing}
          changed={editing && clipsStarted && t.kind === "a_roll" && lines[t.key] !== t.line}
          lineMax={220}
          onscreenMax={80}
          onLineChange={(v) => setLines((l) => ({ ...l, [t.key]: v }))}
          onOnscreenChange={(i, v) => setBeats((b) => b.map((x, j) => (j === t.beats[i] ? v : x)))}
        />
      ))}
      <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
        <b className="text-small font-semibold">Cierre</b>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Field label="Nombre" value={endCard.title} maxLength={40} onValueChange={(v) => setEndCard((c) => ({ ...c, title: v }))} />
            <Field label="Línea" value={endCard.subtitle} maxLength={60} onValueChange={(v) => setEndCard((c) => ({ ...c, subtitle: v }))} />
            <Field label="Botón" value={endCard.cta} maxLength={20} onValueChange={(v) => setEndCard((c) => ({ ...c, cta: v }))} />
          </div>
        ) : (
          <p className="text-small">{`${p.end_card.title} · ${p.end_card.subtitle} · ${p.end_card.cta}`}</p>
        )}
      </div>
      <ScriptGuard>{FORMAT[format].guard}</ScriptGuard>
      {p.compliance_notes.length && !editing ? (
        <details className="text-caption text-muted-foreground">
          <summary className="min-h-8 cursor-pointer content-center">Qué cuidar al publicar</summary>
          <ul className="m-0 mt-1 list-disc pl-4">
            {p.compliance_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <StepActions desktop={desktop}>
        {editing ? (
          <>
            <Button size="lg" disabled={saving} onClick={cancel}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" loading={saving} onClick={save}>
              Guardar
            </Button>
          </>
        ) : (
          <>
            <div className="flex gap-2 [&>*]:flex-1">
              <Button icon="edit" disabled={Boolean(busy)} onClick={() => setEditing(true)}>
                Editar
              </Button>
              <Button icon="undo" loading={busy === `write-${card.slot}`} disabled={Boolean(busy)} onClick={onAnother}>
                {withCost("Otro guion")}
              </Button>
            </div>
            {approved ? (
              current > 1 ? (
                <Button variant="primary" size="lg" iconEnd="chevron-right" onClick={() => onView(current)}>
                  Ir al paso que toca
                </Button>
              ) : null
            ) : (
              <Button variant="primary" size="lg" icon="check" loading={busy === `approve-${card.slot}`} disabled={Boolean(busy)} onClick={() => action("approve", "Guion aprobado")}>
                Aprobar guion
              </Button>
            )}
          </>
        )}
      </StepActions>
    </div>
  );
}

// ---------------------------------------------------------------- 2. Imágenes clave

function keyframeState(s: VideoShotView | undefined): KeyframeState {
  if (!s) return "missing";
  if (busyShot(s)) return "generating";
  if (s.render === "failed") return "failed";
  return s.status === "aprobado" ? "approved" : s.status === "rechazado" ? "discarded" : "review";
}

function KeyframesStep({
  productId,
  card,
  format,
  current,
  desktop,
  busy,
  run,
  onView,
}: {
  productId: string;
  card: VideoCardView;
  format: VideoFormat;
  current: number;
  desktop: boolean;
  busy: string | null;
  run: Run;
  onView: (n: number) => void;
}) {
  const localCost = useLocalCost();
  const expected = card.script?.payload?.keyframes ?? [];
  const byKey = new Map(card.keyframes.map((k) => [k.key, k]));
  const states = expected.map((k) => keyframeState(byKey.get(k.key)));
  const missing = states.filter((st) => st === "missing" || st === "failed" || st === "discarded").length;
  const approvedN = states.filter((st) => st === "approved").length;
  const pending = card.keyframes.filter((k) => keyframeState(k) === "review");
  const scriptId = card.script!.id;
  const generate = () => run(`keyframes-${card.slot}`, () => productsApi.scriptAction(productId, scriptId, "keyframes"), "No pudimos empezar a generar.", "Generando las imágenes clave");
  const shot = (s: VideoShotView, a: "approve" | "reject" | "reopen" | "regenerate" | "recover", done?: string) =>
    run(`shot-${s.id}`, () => productsApi.shotAction(productId, s.id, a), "No pudimos guardar el cambio.", done);
  const each = localCost(shotCost("keyframe"));
  const none = card.keyframes.length === 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-caption text-muted-foreground tabular-nums">{`${approvedN} ${approvedN === 1 ? "aprobada" : "aprobadas"}${missing ? ` · ${missing} ${missing === 1 ? "falta" : "faltan"}` : ""}`}</span>
        {missing && !none ? (
          <Button size="sm" icon="sparkle" loading={busy === `keyframes-${card.slot}`} disabled={Boolean(busy)} onClick={generate}>
            {`${missing === 1 ? "Generar la que falta" : `Generar las ${missing} que faltan`} · ${localCost(missing * shotCost("keyframe"))}`}
          </Button>
        ) : null}
      </div>
      {none ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <b className="text-body font-semibold">{`${expected.length} imágenes clave`}</b>
          <span className="text-caption text-muted-foreground">{`La primera es ${FORMAT[format].character}; las demás la usan de referencia, junto a tu foto base.`} Revisas manos, cara y producto antes de pagar los clips.</span>
          <Button variant="primary" icon="sparkle" loading={busy === `keyframes-${card.slot}`} disabled={Boolean(busy)} onClick={generate} className="self-start">
            {`Generar imágenes clave · ${localCost(expected.length * shotCost("keyframe"))}`}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 @2xl:grid-cols-5">
          {expected.map((k, i) => {
            const s = byKey.get(k.key);
            const st = states[i];
            const loading = Boolean(s && busy === `shot-${s.id}`);
            return (
              <KeyframeTile
                key={k.key}
                label={`Imagen ${i + 1}`}
                state={st}
                src={s?.src}
                qa={s?.qa?.issues}
                error={s?.error}
                busy={loading || Boolean(busy)}
                onApprove={() => s && shot(s, "approve")}
                onDiscard={() => s && shot(s, "reject")}
                footer={
                  s && (st === "approved" || st === "discarded" || st === "failed") ? (
                    <div className="flex flex-col items-start">
                      {st === "failed" && s.recoverable ? (
                        <TileLink disabled={Boolean(busy)} onClick={() => shot(s, "recover")}>
                          Recuperar
                        </TileLink>
                      ) : null}
                      {st !== "failed" ? (
                        <TileLink disabled={Boolean(busy)} onClick={() => shot(s, "reopen")}>
                          Volver a revisar
                        </TileLink>
                      ) : null}
                      {st !== "approved" ? (
                        <TileLink disabled={Boolean(busy)} onClick={() => shot(s, "regenerate")}>
                          {`Pedir otra · ${each}`}
                        </TileLink>
                      ) : null}
                    </div>
                  ) : null
                }
              />
            );
          })}
        </div>
      )}
      {pending.length > 1 || current > 2 ? (
        <StepActions desktop={desktop}>
          {current > 2 ? (
            <Button variant="primary" size="lg" iconEnd="chevron-right" onClick={() => onView(3)}>
              Ir a Clips
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              icon="check"
              loading={busy === `approve_keyframes-${card.slot}`}
              disabled={Boolean(busy)}
              onClick={() => run(`approve_keyframes-${card.slot}`, () => productsApi.scriptAction(productId, scriptId, "approve_keyframes"), "No pudimos aprobarlas.", "Imágenes clave aprobadas")}
            >
              {`Aprobar todas (${pending.length})`}
            </Button>
          )}
        </StepActions>
      ) : null}
    </div>
  );
}

function TileLink({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-8 cursor-pointer items-center text-caption font-medium text-primary underline underline-offset-3 disabled:cursor-not-allowed disabled:text-muted-foreground">
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- 3. Clips

function clipState(s: VideoShotView): ClipState {
  return s.render === "queued" ? "queued" : s.render === "running" ? "generating" : s.render === "succeeded" ? "done" : "failed";
}

function ClipsStep({ productId, card, current, desktop, busy, run, onView }: { productId: string; card: VideoCardView; current: number; desktop: boolean; busy: string | null; run: Run; onView: (n: number) => void }) {
  const localCost = useLocalCost();
  const p = card.script!.payload!;
  const timeline = scriptTimeline(p);
  const byKey = new Map(card.clips.map((c) => [c.key, c]));
  const kfSrc = new Map(card.keyframes.map((k) => [k.key, k.src]));
  const missing = timeline.filter((t) => !byKey.has(t.key) || byKey.get(t.key)!.render === "failed");
  const rendering = card.clips.some(busyShot);
  const cost = (t: TimelineShot) => shotCost(t.kind, t.seconds);
  const scriptId = card.script!.id;
  const generate = () => run(`clips-${card.slot}`, () => productsApi.scriptAction(productId, scriptId, "clips"), "No pudimos empezar a generar los clips.", "Generando los clips: tardan unos minutos");
  const done = timeline.every((t) => byKey.get(t.key)?.render === "succeeded");

  if (!card.clips.length) {
    return (
      <div className="flex flex-col gap-2.5">
        <Notice tone="info" icon="clock" title="Tardan de 3 a 6 minutos" body="Las tomas habladas salen con voz (Seedance) y las de apoyo sin audio (Kling). Puedes salir: te avisamos." />
        <StepActions desktop={desktop}>
          <Button variant="primary" size="lg" icon="sparkle" loading={busy === `clips-${card.slot}`} disabled={Boolean(busy)} onClick={generate}>
            {`Generar los ${timeline.length} clips · ${localCost(card.cost.clips)}`}
          </Button>
        </StepActions>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {desktop ? (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-heading">Clips</h2>
          <span className="text-caption text-muted-foreground">Habladas en Seedance con voz · apoyo en Kling</span>
        </div>
      ) : null}
      {rendering ? <Notice tone="info" icon="clock" title="Tardan de 3 a 6 minutos" body="Puedes salir. Te avisamos cuando estén todos." /> : null}
      {timeline.map((t) => {
        const s = byKey.get(t.key);
        const act = (a: "regenerate" | "recover") => s && run(`shot-${s.id}`, () => productsApi.shotAction(productId, s.id, a), "No pudimos guardar el cambio.");
        return (
          <ClipRow
            key={t.key}
            label={`Toma ${t.n}`}
            kind={t.kind === "a_roll" ? "talk" : "broll"}
            state={s ? clipState(s) : "queued"}
            src={s?.src}
            poster={kfSrc.get(t.keyframe)}
            duration={durationLabel(t.kind === "a_roll" ? t.seconds : 5) ?? undefined}
            cost={localCost(cost(t))}
            recoverable={s?.recoverable}
            error={s?.error}
            busy={Boolean(s && busy === `shot-${s.id}`) || Boolean(busy)}
            onRecover={() => act("recover")}
            onRedo={() => act("regenerate")}
          />
        );
      })}
      {missing.length && !rendering && card.clips.length ? (
        <Button icon="sparkle" loading={busy === `clips-${card.slot}`} disabled={Boolean(busy)} onClick={generate} className="self-start">
          {`Generar ${missing.length === 1 ? "el que falta" : `los ${missing.length} que faltan`} · ${localCost(missing.reduce((n, t) => n + cost(t), 0))}`}
        </Button>
      ) : null}
      <StepActions desktop={desktop}>
        <Button variant="primary" size="lg" iconEnd="chevron-right" disabled={!done || current < 4} onClick={() => onView(4)}>
          Continuar a Montaje
        </Button>
      </StepActions>
    </div>
  );
}

// ---------------------------------------------------------------- 4. Montaje

function MontageStep({ productId, card, desktop, onView }: { productId: string; card: VideoCardView; desktop: boolean; onView: (n: number) => void }) {
  const p = card.script!.payload!;
  return (
    <div className="flex flex-col gap-2.5">
      <MontagePackage clips={p.a_roll.length + p.b_roll.length} file={`video-angulo-${card.slot}.json`} href={`/api/products/${productId}/videos/${card.script!.id}/package`} />
      <StepActions desktop={desktop}>
        <Button size="lg" iconEnd="chevron-right" onClick={() => onView(5)}>
          Ya lo monté: subir el video
        </Button>
      </StepActions>
    </div>
  );
}

// ---------------------------------------------------------------- 5. Video final

function FinalStep({ productId, card, busy, run, onState, onError }: { productId: string; card: VideoCardView; busy: string | null; run: Run; onState: (s: VideosState) => void; onError: (m: string) => void }) {
  const [upload, setUpload] = useState<{ file: string; size: number; progress: number; cancel: () => void } | null>(null);
  const [uploadError, setUploadError] = useState<string>();
  const f = card.final;
  const scriptId = card.script!.id;
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

  async function pickFile(file: File) {
    setUploadError(undefined);
    if (file.type !== "video/mp4") return setUploadError("Ese archivo no es MP4");
    try {
      const facts = await mediaFacts(file);
      const job = uploadFinalVideo(productId, scriptId, file, facts, (progress) => setUpload((u) => (u ? { ...u, progress } : u)));
      setUpload({ file: file.name, size: file.size, progress: 0, cancel: job.cancel });
      onState(await job.done);
      notify("Video subido: revísalo y apruébalo");
    } catch (e) {
      if (!(e instanceof ProductApiClientError && e.field === "abort")) setUploadError(errorText(e, "No pudimos subir el video."));
    } finally {
      setUpload(null);
    }
  }

  const decide = async (action: "approve" | "reject" | "reopen") => {
    const next = await run(`final-${action}-${card.slot}`, () => productsApi.decideFinalVideo(productId, scriptId, action), action === "reopen" ? "No pudimos deshacer." : "No pudimos guardar tu decisión.");
    if (next && action !== "reopen") notifyUndo(action === "approve" ? "Video aprobado. Ya está en Anuncios." : "Video descartado.", () => void decide("reopen"));
  };
  const busyAction = busy === `final-approve-${card.slot}` ? "approve" : busy === `final-reject-${card.slot}` ? "discard" : busy === `final-reopen-${card.slot}` ? "undo" : null;

  if (upload) {
    return (
      <VideoUpload
        state="uploading"
        file={upload.file}
        progress={upload.progress}
        detail={`${mb(upload.size * upload.progress)} de ${mb(upload.size)}`}
        onCancel={() => {
          upload.cancel();
          onError("Subida cancelada.");
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {f?.src ? (
        <VideoUpload
          state={f.status === "aprobado" ? "approved" : f.status === "rechazado" ? "discarded" : "ready"}
          src={f.src}
          duration={durationLabel(f.durationS) ?? undefined}
          size={f.sizeBytes ? mb(f.sizeBytes) : undefined}
          adset={`Ángulo ${card.slot}`}
          busy={busyAction}
          onApprove={() => decide("approve")}
          onDiscard={() => decide("reject")}
          onUndo={() => decide("reopen")}
          onPick={pickFile}
        />
      ) : null}
      {!f?.src || uploadError ? <VideoUpload state={uploadError ? "error" : "idle"} error={uploadError} onPick={pickFile} /> : null}
    </div>
  );
}
