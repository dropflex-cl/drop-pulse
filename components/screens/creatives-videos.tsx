"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiChip, Button, Field, Icon, Notice, RoleChip, StateChip, StatusBadge, notify, notifyUndo } from "@/components/df";
import { mediaFacts } from "@/lib/ads/client";
import { durationLabel } from "@/lib/ads/media";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi, uploadFinalVideo } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { VideoCardView, VideoShotView, VideoStep, VideosState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shotCost } from "@/lib/video/cost";
import type { UgcScript } from "@/lib/video/schemas";

// Pestaña Videos de Creativos (docs/spec-video-ugc.md §2): un video UGC por ángulo en 5 pasos.
// Guion (gratis) → imágenes clave (centavos, se aprueban una a una) → clips (lo caro) → montaje en el
// equipo del comerciante con el script → video final, que al aprobarlo pasa a Anuncios.

const POLL_MS = 4000;
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
const busyShot = (s: VideoShotView) => s.render === "queued" || s.render === "running";
const usd = (n: number) => money(n, "USD");

const STEPS: { key: VideoStep; label: string }[] = [
  { key: "script", label: "Guion" },
  { key: "keyframes", label: "Imágenes clave" },
  { key: "clips", label: "Clips" },
  { key: "montage", label: "Montaje" },
  { key: "final", label: "Video final" },
];

const area =
  "min-h-11 w-full resize-y rounded-md border border-input bg-background p-3 text-row font-normal text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";

export function VideosPanel({ productId, initial }: { productId: string; initial: VideosState }) {
  const router = useRouter();
  const [state, setState] = useState<VideosState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const working = state.cards.some((c) => c.script?.status === "queued" || c.script?.status === "running" || [...c.keyframes, ...c.clips].some(busyShot));
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) router.refresh();
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

  async function run(key: string, fn: () => Promise<VideosState>, fallback: string, done?: string) {
    setBusy(key);
    setError(undefined);
    try {
      setState(await fn());
      if (done) notify(done);
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  if (state.locked) {
    const needsKey = !state.locked.startsWith("Aprueba");
    return (
      <Notice
        tone="info"
        icon="lock"
        title={needsKey ? "Conecta Higgsfield" : "Primero, los ángulos"}
        body={state.locked}
        action={
          needsKey ? (
            <Button size="sm" icon="settings" href="/settings#creativos">
              Ir a Ajustes
            </Button>
          ) : (
            <Button size="sm" iconEnd="chevron-right" href={productHref(productId, "angulos")}>
              Ir a Ángulos
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-label font-normal text-muted-foreground">
        Un video vertical de unos 30 segundos por ángulo, con una persona hecha con IA que habla a cámara. Revisas el guion y las imágenes antes de pagar los clips; el montaje final lo haces en tu equipo con el script de DropFlex.
      </p>
      {state.cards.map((card) => (
        <VideoCard key={card.slot} productId={productId} card={card} busy={busy} run={run} onState={setState} onError={setError} />
      ))}
      {error ? (
        <p role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Run = (key: string, fn: () => Promise<VideosState>, fallback: string, done?: string) => Promise<void>;

function StepList({ step }: { step: VideoStep }) {
  const at = STEPS.findIndex((s) => s.key === step);
  return (
    <ol aria-label="Pasos del video" className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
      {STEPS.map((s, i) => (
        <li key={s.key} aria-current={i === at ? "step" : undefined} className={cn("flex items-center gap-1 text-caption", i < at ? "text-success" : i === at ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {i < at ? <Icon name="check" size="sm" aria-hidden /> : <span className="tabular-nums">{i + 1}.</span>}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function VideoCard({ productId, card, busy, run, onState, onError }: { productId: string; card: VideoCardView; busy: string | null; run: Run; onState: (s: VideosState) => void; onError: (m: string) => void }) {
  const s = card.script;
  const writing = s?.status === "queued" || s?.status === "running";
  const write = () => run(`write-${card.slot}`, () => productsApi.writeScript(productId, card.slot), "No pudimos empezar a escribir el guion.");
  const action = (a: "approve" | "unapprove" | "keyframes" | "approve_keyframes" | "clips", done?: string) =>
    s && run(`${a}-${card.slot}`, () => productsApi.scriptAction(productId, s.id, a), "No pudimos guardar el cambio.", done);

  let body: React.ReactNode;
  if (!s) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
        <p className="min-w-0 flex-1 text-label font-normal text-muted-foreground">La IA escribe el guion desde el desarrollo de este ángulo, tu cliente ideal y tu diferenciador.</p>
        <Button size="sm" variant="secondary" icon="sparkle" loading={busy === `write-${card.slot}`} disabled={!!busy} onClick={write}>
          Escribir guion
        </Button>
      </div>
    );
  } else if (writing) {
    body = (
      <div role="status" className="flex items-center gap-2 rounded-lg bg-muted p-4">
        <StateChip label="Escribiendo el guion" icon="loader" tone="progress" spin />
        <span className="text-caption text-muted-foreground">Suele tardar un minuto. Puedes salir: te avisamos.</span>
      </div>
    );
  } else if (s.status === "failed" || !s.payload) {
    body = (
      <Notice
        tone="warning"
        icon="alert"
        title="No pudimos escribir el guion"
        body={s.error ?? "Toca Reintentar."}
        action={
          <Button size="sm" icon="refresh" loading={busy === `write-${card.slot}`} disabled={!!busy} onClick={write}>
            Reintentar
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <ScriptSection productId={productId} card={card} script={s.payload} approved={s.approved} edited={s.edited} scriptId={s.id} busy={busy} onApprove={(v) => action(v ? "approve" : "unapprove", v ? "Guion aprobado" : undefined)} onAnother={write} onState={onState} onError={onError} />
        {s.approved ? (
          <KeyframesSection productId={productId} card={card} busy={busy} run={run} onGenerate={() => action("keyframes", "Generando las imágenes clave")} onApproveAll={() => action("approve_keyframes", "Imágenes clave aprobadas")} />
        ) : null}
        {card.step === "clips" || card.step === "montage" || card.step === "final" ? (
          <ClipsSection productId={productId} card={card} busy={busy} run={run} onGenerate={() => action("clips", "Generando los clips: tardan unos minutos")} />
        ) : null}
        {card.step === "montage" || card.step === "final" ? <MontageSection productId={productId} card={card} /> : null}
        {card.step === "montage" || card.step === "final" ? <FinalSection productId={productId} card={card} busy={busy} run={run} onState={onState} onError={onError} /> : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={`video-${card.slot}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <RoleChip slot={card.slot} short />
        <h2 id={`video-${card.slot}`} className="text-heading">
          {card.angleName}
        </h2>
      </div>
      {s?.payload ? <StepList step={card.step} /> : null}
      {body}
    </section>
  );
}

// ---------------------------------------------------------------- 1. Guion

function ScriptSection({
  productId,
  card,
  script: p,
  scriptId,
  approved,
  edited,
  busy,
  onApprove,
  onAnother,
  onState,
  onError,
}: {
  productId: string;
  card: VideoCardView;
  script: UgcScript;
  scriptId: string;
  approved: boolean;
  edited: boolean;
  busy: string | null;
  onApprove: (approve: boolean) => void;
  onAnother: () => void;
  onState: (s: VideosState) => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState(p.a_roll.map((a) => ({ key: a.key, line: a.line, delivery: a.delivery })));
  const [beats, setBeats] = useState(p.text_beats.map((t) => ({ text: t.text })));
  const [endCard, setEndCard] = useState({ title: p.end_card.title, subtitle: p.end_card.subtitle, cta: p.end_card.cta });
  const [saving, setSaving] = useState(false);
  const total = p.a_roll.reduce((n, a) => n + a.seconds, 0);
  const clipsStarted = card.clips.length > 0;

  async function save() {
    setSaving(true);
    try {
      onState(await productsApi.editScript(productId, scriptId, { a_roll: lines, text_beats: beats, end_card: endCard }));
      setEditing(false);
      notify(clipsStarted ? "Guion guardado: las tomas que cambiaste se generan de nuevo" : "Guion guardado");
    } catch (e) {
      onError(errorText(e, "No pudimos guardar el guion."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {p.format_fit.recommended !== "ugc_ai" ? (
        <Notice
          tone="warning"
          icon="alert"
          title={p.format_fit.recommended === "static" ? "Este ángulo puede rendir más como imagen" : "Este ángulo pide una persona real"}
          body={`${p.format_fit.why} Puedes seguir con el video de IA o probar otro formato para variar el testeo.`}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <AiChip>Guion</AiChip>
        <span className="text-caption text-muted-foreground tabular-nums">{`${p.a_roll.length} tomas habladas · ${p.b_roll.length} de apoyo · ${total} s${edited ? " · editado" : ""}`}</span>
      </div>
      <p className="text-label font-normal text-muted-foreground">{p.hook_why}</p>

      {editing ? (
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <fieldset key={l.key} className="flex flex-col gap-1.5 border-t pt-3">
              <legend className="text-label font-semibold">{`Toma ${l.key} · ${p.a_roll[i].seconds} s`}</legend>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">Lo que dice</span>
                <textarea value={l.line} rows={2} maxLength={220} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, line: e.target.value } : y)))} className={area} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">Cómo lo dice (para el modelo, en inglés)</span>
                <textarea value={l.delivery} rows={2} maxLength={300} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, delivery: e.target.value } : y)))} className={area} />
              </label>
            </fieldset>
          ))}
          <fieldset className="flex flex-col gap-2 border-t pt-3">
            <legend className="text-label font-semibold">Textos en pantalla</legend>
            {beats.map((b, i) => (
              <Field key={i} label={`Texto ${i + 1}`} value={b.text} maxLength={80} onValueChange={(v) => setBeats((x) => x.map((y, j) => (j === i ? { text: v } : y)))} />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2 border-t pt-3">
            <legend className="text-label font-semibold">Cierre</legend>
            <Field label="Nombre" value={endCard.title} maxLength={40} onValueChange={(v) => setEndCard((c) => ({ ...c, title: v }))} />
            <Field label="Línea" value={endCard.subtitle} maxLength={60} onValueChange={(v) => setEndCard((c) => ({ ...c, subtitle: v }))} />
            <Field label="Botón" value={endCard.cta} maxLength={20} onValueChange={(v) => setEndCard((c) => ({ ...c, cta: v }))} />
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon="check" loading={saving} onClick={save}>
              Guardar guion
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {p.a_roll.map((a) => {
            const inserts = p.b_roll.filter((b) => a.line.toLowerCase().includes(b.anchor.toLowerCase()));
            return (
              <li key={a.key} className="flex flex-col gap-1 rounded-md bg-muted p-3">
                <span className="text-micro text-muted-foreground tabular-nums">{`${a.key} · ${a.seconds} s`}</span>
                <span className="text-row">{a.line}</span>
                <span className="text-caption text-muted-foreground">{a.delivery}</span>
                {inserts.length ? (
                  <span className="text-caption text-muted-foreground">{`Apoyo: ${inserts.map((b) => `«${b.anchor}» → ${b.key}`).join(" · ")}`}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {!editing ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-micro text-muted-foreground">Textos en pantalla</span>
            <p className="text-small">{p.text_beats.map((t) => t.text).join(" · ")}</p>
            <span className="text-micro text-muted-foreground">Cierre</span>
            <p className="text-small">{`${p.end_card.title} · ${p.end_card.subtitle} · ${p.end_card.cta}`}</p>
          </div>
          {p.compliance_notes.length ? (
            <details className="text-caption text-muted-foreground">
              <summary className="cursor-pointer">Qué cuidar al publicar</summary>
              <ul className="m-0 mt-1 list-disc pl-4">
                {p.compliance_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!approved ? (
              <Button size="sm" variant="secondary" icon="check" loading={busy === `approve-${card.slot}`} disabled={!!busy} onClick={() => onApprove(true)}>
                Aprobar guion
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-caption text-success">
                <Icon name="check" size="sm" aria-hidden />
                Guion aprobado
              </span>
            )}
            <Button size="sm" variant="ghost" icon="edit" disabled={!!busy} onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" icon="refresh" loading={busy === `write-${card.slot}`} disabled={!!busy} onClick={onAnother}>
              Otro guion
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- 2. Imágenes clave

function KeyframesSection({ productId, card, busy, run, onGenerate, onApproveAll }: { productId: string; card: VideoCardView; busy: string | null; run: Run; onGenerate: () => void; onApproveAll: () => void }) {
  const expected = card.script?.payload?.keyframes ?? [];
  const missing = expected.filter((k) => !card.keyframes.some((s) => s.key === k.key && s.render !== "failed" && s.status !== "rechazado"));
  const pending = card.keyframes.filter((s) => s.render === "succeeded" && s.status !== "aprobado" && s.status !== "rechazado");
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-row font-semibold">Imágenes clave</h3>
        <span className="text-caption text-muted-foreground">Revisa manos, cara y producto antes de pagar los clips.</span>
      </div>
      {card.keyframes.length ? (
        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-5">
          {card.keyframes.map((s) => (
            <ShotTile key={s.id} shot={s} productId={productId} busy={busy} run={run} decidable />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {missing.length ? (
          <Button size="sm" variant="secondary" icon="image" loading={busy === `keyframes-${card.slot}`} disabled={!!busy} onClick={onGenerate}>
            {`Generar ${missing.length === expected.length ? "imágenes clave" : `las ${missing.length} que faltan`} · ≈ ${usd(missing.length * shotCost("keyframe"))}`}
          </Button>
        ) : null}
        {pending.length > 1 ? (
          <Button size="sm" variant="ghost" icon="check" loading={busy === `approve_keyframes-${card.slot}`} disabled={!!busy} onClick={onApproveAll}>
            Aprobar todas
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3. Clips

function ClipsSection({ productId, card, busy, run, onGenerate }: { productId: string; card: VideoCardView; busy: string | null; run: Run; onGenerate: () => void }) {
  const p = card.script?.payload;
  const keys = p ? [...p.a_roll.map((a) => a.key), ...p.b_roll.map((b) => b.key)] : [];
  const missing = keys.filter((k) => !card.clips.some((s) => s.key === k && s.render !== "failed"));
  const rendering = card.clips.filter(busyShot).length;
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-row font-semibold">Clips</h3>
        <span className="text-caption text-muted-foreground">Tomas habladas con voz y tomas de apoyo sin audio.</span>
      </div>
      {rendering ? <Notice tone="info" icon="sparkle" title={`Generando ${rendering} ${rendering === 1 ? "clip" : "clips"}`} body="Las tomas habladas tardan de 3 a 6 minutos. Puedes salir: siguen en Higgsfield." /> : null}
      {card.clips.length ? (
        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-5">
          {card.clips.map((s) => (
            <ShotTile key={s.id} shot={s} productId={productId} busy={busy} run={run} seconds={p?.a_roll.find((a) => a.key === s.key)?.seconds} />
          ))}
        </div>
      ) : null}
      {missing.length ? (
        <Button size="sm" variant="secondary" icon="sparkle" loading={busy === `clips-${card.slot}`} disabled={!!busy} onClick={onGenerate} className="self-start">
          {`Generar ${missing.length === keys.length ? "clips" : `los ${missing.length} que faltan`} · ≈ ${usd(missing.length === keys.length ? card.cost.clips : missing.reduce((n, k) => n + shotCost(k.startsWith("A") ? "a_roll" : "b_roll", p?.a_roll.find((a) => a.key === k)?.seconds), 0))}`}
        </Button>
      ) : null}
    </div>
  );
}

function ShotTile({ shot: s, productId, busy, run, decidable, seconds }: { shot: VideoShotView; productId: string; busy: string | null; run: Run; decidable?: boolean; seconds?: number }) {
  const video = s.kind !== "keyframe";
  const act = (a: "approve" | "reject" | "reopen" | "regenerate" | "recover", done?: string) => run(`shot-${s.id}`, () => productsApi.shotAction(productId, s.id, a), "No pudimos guardar el cambio.", done);
  const again = `${s.kind === "keyframe" ? "Otra" : "Rehacer"} · ${usd(shotCost(s.kind, seconds))}`;
  const label = `${s.key}${s.attempt > 1 ? ` · intento ${s.attempt}` : ""}`;
  const loading = busy === `shot-${s.id}`;

  if (busyShot(s)) {
    return (
      <div className="flex flex-col gap-1.5">
        <div role="status" className="grid aspect-[9/16] place-items-center rounded-md bg-muted p-2 text-center">
          <div className="flex flex-col items-center gap-2">
            <StateChip label={s.render === "queued" ? "En cola" : "Generando"} icon="loader" tone="progress" spin />
            {s.error ? <span className="text-caption text-muted-foreground">{s.error}</span> : null}
          </div>
        </div>
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    );
  }
  if (s.render === "failed") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="grid aspect-[9/16] place-items-center rounded-md border border-destructive p-2 text-center">
          <div className="flex flex-col items-center gap-2">
            <StatusBadge status="error" size="sm" />
            <span className="text-caption text-destructive">{s.error ?? "No se pudo generar."}</span>
            {s.recoverable ? (
              <Button size="sm" variant="secondary" icon="refresh" loading={loading} onClick={() => act("recover")}>
                Recuperar
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("regenerate")}>
              {again}
            </Button>
          </div>
        </div>
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    );
  }
  const decided = s.status === "aprobado" || s.status === "rechazado";
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("aspect-[9/16] overflow-hidden rounded-md bg-muted inset-ring inset-ring-border", s.status === "rechazado" && "opacity-50")}>
        {s.src ? (
          video ? (
            <video src={s.src} controls playsInline preload="metadata" className="size-full object-cover" aria-label={`Clip ${s.key}`} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
            <img src={s.src} alt={`Imagen clave ${s.key}`} className="size-full object-cover" loading="lazy" />
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {decidable ? <StatusBadge status={s.status} size="sm" /> : null}
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
      {s.qa && !s.qa.pass ? (
        <details className="text-caption text-warning">
          <summary className="cursor-pointer">{s.qa.issues.length === 1 ? "Revisa 1 detalle" : `Revisa ${s.qa.issues.length} detalles`}</summary>
          <ul className="m-0 mt-1 list-disc pl-4">
            {s.qa.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
      ) : s.qa?.pass ? (
        <span className="text-caption text-success">Manos y producto revisados</span>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {decidable && !decided ? (
          <>
            <Button size="sm" variant="secondary" icon="check" loading={loading} onClick={() => act("approve")} aria-label={`Aprobar ${s.key}`}>
              Aprobar
            </Button>
            <Button size="sm" variant="ghost" icon="x" disabled={loading} onClick={() => act("reject")} aria-label={`Descartar ${s.key}`}>
              Descartar
            </Button>
          </>
        ) : null}
        {decidable && decided ? (
          <Button size="sm" variant="ghost" icon="undo" disabled={loading} onClick={() => act("reopen")} aria-label={`Volver a revisar ${s.key}`}>
            Revisar
          </Button>
        ) : null}
        {!decidable || s.status === "rechazado" ? (
          <Button size="sm" variant="ghost" icon="refresh" disabled={!!busy} onClick={() => act("regenerate")}>
            {again}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 4. Montaje

function MontageSection({ productId, card }: { productId: string; card: VideoCardView }) {
  const file = `video-angulo-${card.slot}.json`;
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-row font-semibold">Montaje en tu equipo</h3>
      <p className="text-label font-normal text-muted-foreground">
        Descarga el paquete y córrelo con el script de DropFlex: corta, hace los zooms, pone los subtítulos, la música que elijas y lo deja listo para Meta. Los enlaces del paquete duran 24 horas.
      </p>
      <Button size="sm" variant="secondary" icon="arrow-down" href={`/api/products/${productId}/videos/${card.script!.id}/package`} download={file} prefetch={false} className="self-start">
        Descargar paquete
      </Button>
      <pre className="m-0 overflow-x-auto rounded-md bg-muted p-3 font-mono text-caption">{`python3 scripts/ugc-montage.py ~/Downloads/${file} --music pista.mp3`}</pre>
      <p className="text-caption text-muted-foreground">La música es opcional; usa una pista con licencia comercial para anuncios.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 5. Video final

function FinalSection({ productId, card, busy, run, onState, onError }: { productId: string; card: VideoCardView; busy: string | null; run: Run; onState: (s: VideosState) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const f = card.final;
  const scriptId = card.script!.id;

  async function upload(file: File) {
    if (file.type !== "video/mp4") return onError("Sube el video en MP4.");
    setProgress(0);
    try {
      const facts = await mediaFacts(file);
      onState(await uploadFinalVideo(productId, scriptId, file, facts, setProgress).done);
      notify("Video subido: revísalo y apruébalo");
    } catch (e) {
      onError(errorText(e, "No pudimos subir el video."));
    } finally {
      setProgress(null);
    }
  }

  async function decide(action: "approve" | "reject") {
    await run(`final-${card.slot}`, () => productsApi.decideFinalVideo(productId, scriptId, action), "No pudimos guardar tu decisión.");
    if (action === "approve")
      notifyUndo("Aprobado: ya está en Anuncios", async () => {
        try {
          onState(await productsApi.decideFinalVideo(productId, scriptId, "reopen"));
        } catch (e) {
          onError(errorText(e, "No pudimos deshacer."));
        }
      });
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-row font-semibold">Video final</h3>
      <input ref={input} type="file" accept="video/mp4" className="sr-only" aria-label="Elegir el video montado" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {f?.src ? (
        <div className="grid gap-3 @3xl:grid-cols-3">
          <video src={f.src} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-md bg-muted object-cover" aria-label="Video final" />
          <div className="flex flex-col gap-2 @3xl:col-span-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={f.status} size="sm" />
              <span className="text-caption text-muted-foreground tabular-nums">{[durationLabel(f.durationS), f.sizeBytes ? `${(f.sizeBytes / 1024 / 1024).toFixed(1)} MB` : null].filter(Boolean).join(" · ")}</span>
            </div>
            {f.inAds ? <span className="text-caption text-muted-foreground">En Anuncios, en el conjunto de este ángulo.</span> : null}
            <div className="flex flex-wrap gap-2">
              {f.status !== "aprobado" ? (
                <Button size="sm" variant="secondary" icon="check" loading={busy === `final-${card.slot}`} disabled={!!busy} onClick={() => decide("approve")}>
                  Aprobar y mandar a Anuncios
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" icon="upload" disabled={!!busy || progress !== null} onClick={() => input.current?.click()}>
                Subir otra versión
              </Button>
              <Button size="sm" variant="ghost" icon="x" disabled={!!busy} onClick={() => decide("reject")}>
                Descartar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <p className="min-w-0 flex-1 text-label font-normal text-muted-foreground">Sube el MP4 que dejó el script (vertical 9:16, de 10 a 60 segundos).</p>
          <Button size="sm" variant="secondary" icon="upload" loading={progress !== null} disabled={!!busy} onClick={() => input.current?.click()}>
            {progress !== null ? `Subiendo ${Math.round(progress * 100)} %` : "Subir video montado"}
          </Button>
        </div>
      )}
    </div>
  );
}
