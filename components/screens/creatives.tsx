"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiChip, Button, EmptyState, Field, Notice, RoleChip, StateChip, StatusBadge, TopBar, notify, notifyUndo } from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { ROLE_LIMITS } from "@/lib/creatives/catalog";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { CreativeAssetView, CreativeConceptView, CreativesState, ProductCreatives, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Creativos (docs/spec-creativos.md §6.6): la IA propone 6 conceptos desde los 2 ángulos
// aprobados; el comerciante revisa sus textos y genera cada uno en Higgsfield (la pieza sale terminada,
// con sus textos). Un QA revisa producto y textos. Aprobar la manda a los creativos de Anuncios.

const POLL_MS = 3000;
const active = (s?: RunStatus) => s === "queued" || s === "running";
const rendering = (a: CreativeAssetView) => a.render === "queued" || a.render === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

const ROLE_LABEL: Record<string, string> = {
  headline: "Titular",
  subheadline: "Bajada",
  callout: "Callout",
  badge: "Sello",
  table_header: "Columna",
  table_row: "Fila",
  note: "Nota",
};

/**
 * La pieza que se muestra por proporción: la más reciente (el reintento sin preset reemplaza al
 * primero), salvo que haya fallado y ya exista una lista: esa no se esconde.
 */
function latestByRatio(assets: CreativeAssetView[]): CreativeAssetView[] {
  const out = new Map<string, CreativeAssetView>();
  for (const a of assets) {
    const prev = out.get(a.ratio);
    if (a.render === "failed" && prev?.render === "succeeded") continue;
    out.set(a.ratio, a);
  }
  return [...out.values()].sort((a, b) => a.ratio.localeCompare(b.ratio));
}

export function CreativesScreen({ data }: { data: ProductCreatives }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = data;
  const [state, setState] = useState<CreativesState>(data);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const { concepts, run } = state;
  const proposing = active(run?.status);
  const working = proposing || concepts.some((c) => c.assets.some(rendering));
  const cost = (n: number) => money(n * state.imageCostUsd, "USD");
  const missing = concepts.filter((c) => !c.assets.some((a) => a.ratio === "1:1"));
  const approved = concepts.flatMap((c) => c.assets).filter((a) => a.status === "aprobado").length;

  // ---------------------------------------------------------------- Sondeo
  const wasProposing = useRef(proposing);
  useEffect(() => {
    if (wasProposing.current && !proposing) {
      router.refresh();
      if (run?.status === "succeeded") notify("La IA propuso tus anuncios: revisa los textos y genera");
      else if (run?.status === "failed") notify(run.error ?? "No pudimos proponer los anuncios. Toca Reintentar.");
    }
    wasProposing.current = proposing;
  }, [proposing, run, router]);

  const readyCount = concepts.flatMap((c) => c.assets).filter((a) => a.render === "succeeded").length;
  const wasReady = useRef(readyCount);
  useEffect(() => {
    if (readyCount > wasReady.current) router.refresh();
    wasReady.current = readyCount;
  }, [readyCount, router]);

  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.creatives(product.id));
      } catch {
        // El sondeo sigue; un corte de red no es un error de la etapa.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [working, product.id]);

  async function run_(key: string, fn: () => Promise<CreativesState>, fallback: string) {
    setBusy(key);
    setError(undefined);
    try {
      setState(await fn());
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  const propose = () => run_("propose", () => productsApi.proposeCreatives(product.id), "No pudimos empezar. Intenta de nuevo.");
  const render = (c: CreativeConceptView, ratio: "1:1" | "9:16") =>
    run_(`render-${c.id}-${ratio}`, () => productsApi.renderConcept(product.id, c.id, ratio), "No pudimos empezar a generar la imagen.");

  async function renderAll() {
    setBusy("all");
    setError(undefined);
    try {
      let last: CreativesState | null = null;
      for (const c of missing) last = await productsApi.renderConcept(product.id, c.id, "1:1");
      if (last) setState(last);
      notify(`Generando ${missing.length} ${missing.length === 1 ? "imagen" : "imágenes"}`);
    } catch (e) {
      setError(errorText(e, "No pudimos generar todas. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  }

  const recover = (a: CreativeAssetView) =>
    run_(`recover-${a.id}`, () => productsApi.decideCreative(product.id, a.id, "recover"), "No pudimos recuperar la imagen. Intenta de nuevo.");

  async function decide(a: CreativeAssetView, action: "approve" | "reject") {
    setBusy(`decide-${a.id}`);
    setError(undefined);
    try {
      setState(await productsApi.decideCreative(product.id, a.id, action));
      router.refresh();
      notifyUndo(action === "approve" ? "Aprobado: ya está en Anuncios" : "Imagen descartada", async () => {
        try {
          setState(await productsApi.decideCreative(product.id, a.id, "reopen"));
          router.refresh();
        } catch (e) {
          setError(errorText(e, "No pudimos deshacer."));
        }
      });
    } catch (e) {
      setError(errorText(e, "No pudimos guardar tu decisión."));
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- Vistas
  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  const actionClass = "max-lg:w-full lg:h-control lg:text-row";

  if (state.locked) {
    const needsKey = state.connected === false && !state.locked.startsWith("Aprueba");
    body = (
      <EmptyState
        icon="lock"
        title={needsKey ? "Conecta tu cuenta de Higgsfield" : "Primero, los ángulos"}
        body={state.locked}
        action={
          needsKey ? (
            <Button variant="primary" icon="settings" href="/settings#creativos">
              Ir a Ajustes
            </Button>
          ) : (
            <Button variant="primary" iconEnd="chevron-right" href={productHref(product.id, "angulos")}>
              Ir a Ángulos
            </Button>
          )
        }
      />
    );
  } else if (proposing && !concepts.length) {
    body = <EmptyState icon="sparkle" busy title="La IA está pensando tus anuncios" body="Lee tus 2 ángulos y tu foto base. Suele tardar un minuto. Puedes salir: te avisamos." />;
  } else if (!concepts.length) {
    const failed = run?.status === "failed";
    body = (
      <EmptyState
        icon="sparkle"
        tone={failed ? "error" : "neutral"}
        title={failed ? "No pudimos proponer los anuncios" : "Anuncios de imagen terminados con IA"}
        body={
          failed
            ? (run?.error ?? "Toca Reintentar.")
            : `La IA propone 6 anuncios desde tus 2 ángulos. Tú revisas sus textos y eliges cuáles generar: cada imagen parte de tu foto base y cuesta cerca de ${cost(1)} de tu cuenta de Higgsfield.`
        }
        action={
          <Button variant="primary" icon="sparkle" loading={busy === "propose"} onClick={propose}>
            {failed ? "Reintentar" : "Proponer anuncios"}
          </Button>
        }
      />
    );
  } else {
    const groups = (["primary", "secondary"] as const).map((role) => ({ role, items: concepts.filter((c) => c.angle === role) })).filter((g) => g.items.length);
    body = (
      <div className="flex flex-col gap-6">
        {run?.status === "failed" ? <Notice tone="warning" icon="alert" title="No pudimos proponer otros anuncios." body={run.error ?? "Toca Proponer otros para reintentar."} /> : null}
        {proposing ? <Notice tone="info" icon="sparkle" title="La IA está proponiendo otros anuncios." body="Cuando termine, reemplazan a estos. Lo que ya aprobaste sigue en Anuncios." /> : null}
        {missing.length && !desktop ? (
          <p className="text-caption text-muted-foreground">{`${missing.length === 1 ? "Generar el que falta" : `Generar los ${missing.length} que faltan`} cuesta cerca de ${cost(missing.length)} de tu cuenta de Higgsfield.`}</p>
        ) : null}
        {groups.map((g) => (
          <section key={g.role} aria-labelledby={`angulo-${g.role}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <RoleChip role={g.role === "primary" ? "principal" : "secundario"} short />
              <h2 id={`angulo-${g.role}`} className="text-heading">
                {g.items[0].angleName}
              </h2>
            </div>
            <div className="grid gap-3 @3xl:grid-cols-2">
              {g.items.map((c) => (
                <ConceptCard
                  key={c.id}
                  productId={product.id}
                  concept={c}
                  busy={busy}
                  costLabel={cost(1)}
                  onRender={(ratio) => render(c, ratio)}
                  onDecide={decide}
                  onRecover={recover}
                  onSaved={setState}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
    footer = (
      <StickyActions
        variant="bar"
        summary={<span className="hidden @4xl:inline">{approved ? `${approved} ${approved === 1 ? "anuncio aprobado" : "anuncios aprobados"} en Anuncios.` : "Aprueba los que quieras lanzar: pasan a Anuncios."}</span>}
        className="lg:px-8"
      >
        <Button size="lg" icon="sparkle" loading={busy === "propose"} disabled={proposing} onClick={propose} className={actionClass}>
          {desktop ? "Proponer otros" : "Otros"}
        </Button>
        {missing.length ? (
          <Button variant="primary" size="lg" icon="image" loading={busy === "all"} disabled={!!busy} onClick={renderAll} className={actionClass}>
            {desktop ? `Generar ${missing.length} (≈ ${cost(missing.length)})` : `Generar ${missing.length}`}
          </Button>
        ) : approved ? (
          <Button variant="primary" size="lg" iconEnd="chevron-right" href={productHref(product.id, "anuncios")} className={actionClass}>
            {desktop ? "Continuar: Anuncios" : "Anuncios"}
          </Button>
        ) : (
          <Button variant="primary" size="lg" iconEnd="chevron-right" disabled className={actionClass}>
            {desktop ? "Continuar: Anuncios" : "Anuncios"}
          </Button>
        )}
      </StickyActions>
    );
  }

  const subtitle = state.locked ? "Bloqueada" : proposing ? "La IA está trabajando" : concepts.length ? `${concepts.length} conceptos · ${approved} aprobados` : "Opcional";

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Creativos" stageKey="creativos" image={product.image} />
      <TopBar back={product.name} backHref={`/products/${product.id}`} title="Creativos" subtitle={subtitle} actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        } className="sticky top-0 z-sticky lg:hidden" />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
        <p className="hidden text-body text-muted-foreground lg:block">Creativos · {subtitle}</p>
        <div>{body}</div>
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

// ---------------------------------------------------------------- Concepto

function ConceptCard({
  productId,
  concept: c,
  busy,
  costLabel,
  onRender,
  onDecide,
  onRecover,
  onSaved,
  onError,
}: {
  productId: string;
  concept: CreativeConceptView;
  busy: string | null;
  costLabel: string;
  onRender: (ratio: "1:1" | "9:16") => void;
  onDecide: (a: CreativeAssetView, action: "approve" | "reject") => void;
  onRecover: (a: CreativeAssetView) => void;
  onSaved: (s: CreativesState) => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [texts, setTexts] = useState(c.texts);
  const [saving, setSaving] = useState(false);
  const shown = latestByRatio(c.assets);
  const has = (ratio: string) => c.assets.some((a) => a.ratio === ratio);
  const inProgress = c.assets.some(rendering);

  async function save() {
    setSaving(true);
    try {
      onSaved(await productsApi.editConcept(productId, c.id, texts));
      setEditing(false);
      notify("Textos guardados");
    } catch (e) {
      onError(errorText(e, "No pudimos guardar los textos."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article aria-labelledby={`concepto-${c.id}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <AiChip>{c.familyName}</AiChip>
        {c.preset ? <span className="text-caption text-muted-foreground">Estilo {c.preset.name}</span> : <span className="text-caption text-muted-foreground">Sin estilo, edición directa</span>}
      </div>
      <div>
        <h3 id={`concepto-${c.id}`} className="text-row font-semibold">
          {c.name}
        </h3>
        <p className="mt-0.5 text-label font-normal text-muted-foreground">{c.why}</p>
        {c.look ? <p className="mt-1 text-caption text-muted-foreground">Cómo se verá: {c.look}</p> : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          {texts.map((t, i) => (
            <Field
              key={i}
              label={ROLE_LABEL[t.role] ?? t.role}
              value={t.text}
              maxLength={ROLE_LIMITS[t.role]}
              hint={`${t.text.length} de ${ROLE_LIMITS[t.role]} caracteres`}
              onValueChange={(v) => setTexts((l) => l.map((x, j) => (j === i ? { ...x, text: v } : x)))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon="check" loading={saving} onClick={save}>
              Guardar textos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTexts(c.texts);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro text-muted-foreground">Textos que van en la imagen{c.edited ? " · editados" : ""}</span>
            <Button size="sm" variant="ghost" icon="edit" disabled={inProgress} onClick={() => setEditing(true)} aria-label={`Editar los textos de ${c.name}`}>
              Editar
            </Button>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {c.texts.map((t, i) => (
              <li key={i} className="text-small">
                <span className="text-caption text-muted-foreground">{ROLE_LABEL[t.role] ?? t.role}: </span>
                <span className={cn(t.role === "headline" && "font-semibold")}>{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length ? (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((a) => (
            <AssetTile
              key={a.id}
              asset={a}
              busy={busy === `decide-${a.id}`}
              recovering={busy === `recover-${a.id}`}
              costLabel={costLabel}
              onDecide={onDecide}
              onRecover={() => onRecover(a)}
              onRetry={() => onRender(a.ratio)}
            />
          ))}
        </div>
      ) : null}

      {!editing ? (
        <div className="flex flex-wrap gap-2">
          {!has("1:1") ? (
            <Button size="sm" variant="secondary" icon="image" loading={busy === `render-${c.id}-1:1`} disabled={!!busy} onClick={() => onRender("1:1")}>
              {`Generar feed 1:1 · ${costLabel}`}
            </Button>
          ) : null}
          {has("1:1") && !has("9:16") ? (
            <Button size="sm" variant="ghost" icon="plus" loading={busy === `render-${c.id}-9:16`} disabled={!!busy} onClick={() => onRender("9:16")}>
              {`Versión Stories 9:16 · ${costLabel}`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------- Pieza

function AssetTile({
  asset: a,
  busy,
  recovering,
  costLabel,
  onDecide,
  onRecover,
  onRetry,
}: {
  asset: CreativeAssetView;
  busy: boolean;
  recovering: boolean;
  costLabel: string;
  onDecide: (a: CreativeAssetView, action: "approve" | "reject") => void;
  onRecover: () => void;
  onRetry: () => void;
}) {
  const aspect = a.ratio === "9:16" ? "aspect-[9/16]" : "aspect-square";
  const label = a.ratio === "9:16" ? "Stories 9:16" : "Feed 1:1";
  if (rendering(a)) {
    return (
      <div className="flex flex-col gap-1.5">
        <div role="status" className={cn("grid place-items-center rounded-md bg-muted p-3 text-center", aspect)}>
          <div className="flex flex-col items-center gap-2">
            <StateChip label={a.render === "queued" ? "En cola" : "Generando"} icon="loader" tone="progress" spin />
            <span className="text-caption text-muted-foreground">{a.error ?? (a.attempt > 1 ? "Segundo intento, sin estilo, para corregir el texto" : "Suele tardar menos de un minuto")}</span>
          </div>
        </div>
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    );
  }
  if (a.render === "failed") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="grid min-h-40 place-items-center rounded-md border border-destructive p-3 text-center">
          <div className="flex flex-col items-center gap-2">
            <StatusBadge status="error" size="sm" />
            <span className="text-caption text-destructive">{a.error ?? "No se pudo generar."}</span>
            {a.recoverable ? (
              <>
                <span className="text-caption text-muted-foreground">Higgsfield sí la recibió: recupérala sin volver a pagar.</span>
                <Button size="sm" variant="secondary" icon="refresh" loading={recovering} onClick={onRecover}>
                  Recuperar imagen
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" disabled={recovering} onClick={onRetry}>
              {`Generar de nuevo · ${costLabel}`}
            </Button>
          </div>
        </div>
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
    );
  }
  const decided = a.status === "aprobado" || a.status === "rechazado";
  return (
    <div className="flex flex-col gap-1.5">
      <a href={a.src} target="_blank" rel="noreferrer" className={cn("block overflow-hidden rounded-md bg-muted inset-ring inset-ring-border", aspect, a.status === "rechazado" && "opacity-50")}>
        {a.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
          <img src={a.src} alt={`Anuncio generado ${label}`} className="size-full object-cover" loading="lazy" />
        ) : null}
      </a>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={a.status} size="sm" />
        <span className="text-caption text-muted-foreground">{label}</span>
      </div>
      {a.qa ? (
        a.qa.pass ? (
          <span className="text-caption text-success">Texto y producto revisados</span>
        ) : (
          <details className="text-caption text-warning">
            <summary className="cursor-pointer">Revisa: {a.qa.issues.length === 1 ? "1 detalle" : `${a.qa.issues.length} detalles`}</summary>
            <ul className="m-0 mt-1 list-disc pl-4">
              {a.qa.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </details>
        )
      ) : null}
      {!decided ? (
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" icon="check" loading={busy} onClick={() => onDecide(a, "approve")} aria-label={`Aprobar ${label}`}>
            Aprobar
          </Button>
          <Button size="sm" variant="ghost" icon="x" disabled={busy} onClick={() => onDecide(a, "reject")} aria-label={`Descartar ${label}`}>
            Descartar
          </Button>
        </div>
      ) : a.inAds ? (
        <span className="text-caption text-muted-foreground">En Anuncios</span>
      ) : null}
    </div>
  );
}
