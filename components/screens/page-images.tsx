"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Icon, IconButton, ImageUploader, Notice, StateChip, StatusBadge, TopBar, notify, notifyUndo, type UploadItem, type UploaderMode } from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { money } from "@/lib/format";
import { GALLERY_MAX, GALLERY_MIN, GALLERY_SHOTS, GIF_MAX } from "@/lib/page-images/catalog";
import { ProductApiClientError, productsApi, uploadPageImage } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { PageImageOptionView, PageImageSlotView, PageImagesState, ProductPageImages, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Imágenes (docs/spec-imagenes.md, design-system imagenes.md): las imágenes de la página del
// producto por espacio, en el orden de la página. La IA propone y genera una toma por espacio; el
// comerciante elige entre lo generado, sus fotos de Información base y lo que suba.
// Móvil: vista general → espacio. Escritorio: espacios a la izquierda y el espacio elegido al centro.

const POLL_MS = 3000;
const active = (s?: RunStatus) => s === "queued" || s === "running";
const rendering = (o: PageImageOptionView) => o.render === "queued" || o.render === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
const SOURCE: Record<PageImageOptionView["source"], string> = { ai: "IA", upload: "Subida", reference: "Tu foto" };

/** Las opciones que se muestran: sin las descartadas (esperan su borrado). */
const visible = (s: PageImageSlotView) => s.options.filter((o) => !o.discarded);
const chosenOf = (s: PageImageSlotView) => visible(s).filter((o) => o.chosen).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function PageImagesScreen({ data }: { data: ProductPageImages }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = data;
  const [state, setState] = useState<PageImagesState>(data);
  // El espacio abierto va en la URL (?espacio=): en móvil, «atrás» vuelve a la vista general.
  const open = useSearchParams().get("espacio");
  const setOpen = (key: string | null) => router.push(key ? `?espacio=${encodeURIComponent(key)}` : `/products/${product.id}/images`, { scroll: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const { slots, run } = state;
  const proposing = active(run?.status);
  const all = slots.flatMap((s) => s.options);
  const working = proposing || all.some(rendering);
  const hasShots = slots.some((s) => s.shots.length);
  const cost = (n: number) => money(n * state.imageCostUsd, "USD");
  const setSize = 1 + GALLERY_SHOTS + slots.filter((s) => s.kind === "benefit").length;
  const empty = slots.flatMap((s) => s.shots.filter((sh) => !visible(s).some((o) => o.shotId === sh.id && o.render !== "failed")));
  const cover = slots.find((s) => s.kind === "cover");
  const gallery = slots.find((s) => s.kind === "gallery");
  const galleryChosen = gallery ? chosenOf(gallery).length : 0;
  const ready = Boolean(cover && chosenOf(cover).length) && galleryChosen >= GALLERY_MIN;
  const current = slots.find((s) => s.key === open) ?? (desktop ? slots[0] : undefined);

  // ---------------------------------------------------------------- Sondeo
  const wasProposing = useRef(proposing);
  useEffect(() => {
    if (wasProposing.current && !proposing) {
      router.refresh();
      if (run?.status === "succeeded") notify("La IA armó tu galería: las imágenes se están generando");
      else if (run?.status === "failed") notify(run.error ?? "No pudimos proponer las imágenes. Toca Reintentar.");
    }
    wasProposing.current = proposing;
  }, [proposing, run, router]);

  const readyCount = all.filter((o) => o.render === "succeeded").length;
  const wasReady = useRef(readyCount);
  useEffect(() => {
    if (readyCount > wasReady.current) router.refresh();
    wasReady.current = readyCount;
  }, [readyCount, router]);

  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.pageImages(product.id));
      } catch {
        // El sondeo sigue; un corte de red no es un error de la etapa.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [working, product.id]);

  async function act(key: string, fn: () => Promise<PageImagesState>, fallback: string, done?: string) {
    setBusy(key);
    setError(undefined);
    try {
      setState(await fn());
      router.refresh();
      if (done) notify(done);
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  // «Continuar» dispara la escritura de la página (design-system/textos.md › start): la página usa
  // estas imágenes. Si ya estaba escrita, solo lleva a ella.
  const continueToCopy = async () => {
    setBusy("copy");
    try {
      await productsApi.writeCopy(product.id);
    } catch {
      // Si no se pudo empezar (tope diario, conexión), la página lo dice y ofrece empezar desde ahí.
    }
    router.push(productHref(product.id, "textos"));
  };

  const propose = () => act("propose", () => productsApi.proposePageImages(product.id), "No pudimos empezar. Intenta de nuevo.");
  const fill = () => act("fill", () => productsApi.fillPageImages(product.id), "No pudimos generar. Intenta de nuevo.", `Generando ${empty.length} ${empty.length === 1 ? "imagen" : "imágenes"}`);

  // ---------------------------------------------------------------- Vistas
  const actionClass = "max-lg:w-full lg:h-control lg:text-row";
  const subtitle = state.locked ? "Bloqueada" : proposing ? "La IA está armando tu galería" : `${slots.filter((s) => chosenOf(s).length).length} de ${slots.length} espacios con imagen`;

  let body: React.ReactNode;
  if (state.locked) {
    body = (
      <EmptyState
        icon="lock"
        title="Primero, los ángulos de venta"
        body={state.locked}
        action={
          <Button variant="primary" iconEnd="chevron-right" href={productHref(product.id, "angulos")}>
            Ir a Ángulos
          </Button>
        }
      />
    );
  } else {
    const notices = (
      <>
        {state.cannotGenerate ? (
          <Notice
            tone="info"
            icon="lock"
            title="Por ahora puedes elegir tus fotos o subir otras."
            body={state.cannotGenerate}
            action={
              !state.connected ? (
                <Button size="sm" variant="secondary" icon="settings" href="/settings#creativos">
                  Ir a Ajustes
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {run?.status === "failed" ? <Notice tone="warning" icon="alert" title="No pudimos armar la galería." body={run.error ?? "Toca Reintentar."} /> : null}
        {proposing ? <Notice tone="info" icon="sparkle" title="La IA está armando tu galería." body="Lee tu foto base, tus ángulos y tu página. En un minuto empiezan a aparecer las imágenes; puedes salir: te avisamos." /> : null}
        {state.stale && !proposing ? <Notice tone="warning" icon="refresh" title="Cambiaron los beneficios de tu página." body="Propón otra galería para que cada beneficio tenga su imagen." /> : null}
        {!hasShots && !proposing && !state.cannotGenerate ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                <Icon name="sparkle" />
              </span>
              <div>
                <h2 className="text-row font-semibold">{run?.status === "failed" ? "Reintenta la galería" : "La IA arma la galería de tu página"}</h2>
                <p className="mt-0.5 text-label font-normal text-muted-foreground">
                  {`Portada, ${GALLERY_SHOTS} imágenes de galería y una por cada beneficio, con el estilo de una marca: ${setSize} imágenes desde tu foto base, cerca de ${cost(setSize)} de tu cuenta de Higgsfield.`}
                </p>
              </div>
            </div>
            <Button variant="primary" icon="sparkle" loading={busy === "propose"} onClick={propose} className="self-start max-lg:w-full">
              {run?.status === "failed" ? "Reintentar" : `Generar la galería · ${cost(setSize)}`}
            </Button>
          </div>
        ) : null}
      </>
    );
    const list = <SlotList slots={slots} current={desktop ? current?.key : undefined} onOpen={setOpen} />;
    const detail = current ? (
      <SlotDetail
        key={current.key}
        productId={product.id}
        slot={current}
        references={state.references}
        canGenerate={!state.cannotGenerate}
        costLabel={cost(1)}
        busy={busy}
        onAct={act}
        onState={setState}
        onError={setError}
        onBack={desktop ? undefined : () => setOpen(null)}
      />
    ) : null;
    body = desktop ? (
      <div className="flex flex-col gap-4">
        {notices}
        <div className="grid grid-cols-[20rem_minmax(0,1fr)] gap-6">
          <div className="self-start">{list}</div>
          <div>{detail}</div>
        </div>
      </div>
    ) : current ? (
      detail
    ) : (
      <div className="flex flex-col gap-4">
        {notices}
        {list}
      </div>
    );
  }

  const footer =
    state.locked || (!desktop && current) ? null : (
      <StickyActions
        variant="bar"
        summary={
          <span className="max-lg:hidden">
            {ready ? `Portada y ${galleryChosen} de galería elegidas.` : `Elige la portada y al menos ${GALLERY_MIN} imágenes de galería.`}
          </span>
        }
        className="lg:px-8"
      >
        {hasShots ? (
          <Button size="lg" icon="sparkle" loading={busy === "propose"} disabled={proposing || !!state.cannotGenerate} onClick={propose} className={actionClass}>
            {desktop ? `Proponer otra galería · ${cost(setSize)}` : "Otra galería"}
          </Button>
        ) : null}
        {empty.length && !state.cannotGenerate ? (
          <Button variant="primary" size="lg" icon="sparkle" loading={busy === "fill"} disabled={!!busy || proposing} onClick={fill} className={actionClass}>
            {`Generar los vacíos · ${cost(empty.length)}`}
          </Button>
        ) : (
          <Button variant="primary" size="lg" iconEnd="chevron-right" disabled={!ready} loading={busy === "copy"} onClick={continueToCopy} className={actionClass}>
            {desktop ? "Continuar: Página del producto" : "Página del producto"}
          </Button>
        )}
      </StickyActions>
    );

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Imágenes" stageKey="imagenes" image={product.image} />
      <TopBar
        back={current && !desktop ? "Imágenes" : product.name}
        backHref={current && !desktop ? `/products/${product.id}/images` : `/products/${product.id}`}
        title={current && !desktop ? current.title : "Imágenes"}
        subtitle={current && !desktop ? current.format : subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
        <p className="hidden text-body text-muted-foreground lg:block">Imágenes · {subtitle}</p>
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

// ---------------------------------------------------------------- Espacios

function slotBadge(s: PageImageSlotView): { label: string; tone: "success" | "progress" | "quiet" | "danger"; icon: "check" | "loader" | "image" | "alert" } | null {
  const opts = visible(s);
  const chosen = chosenOf(s).length;
  if (opts.some(rendering)) return { label: "Generando", tone: "progress", icon: "loader" };
  if (chosen) return { label: s.kind === "gif" ? `${chosen} en uso` : s.kind === "gallery" ? `${chosen} elegidas` : "Elegida", tone: "success", icon: "check" };
  const ok = opts.filter((o) => o.render === "succeeded").length;
  if (ok) return { label: ok === 1 ? "1 opción" : `${ok} opciones`, tone: "quiet", icon: "image" };
  if (opts.some((o) => o.render === "failed")) return { label: "Con error", tone: "danger", icon: "alert" };
  return null;
}

function SlotList({ slots, current, onOpen }: { slots: PageImageSlotView[]; current?: string; onOpen: (key: string) => void }) {
  const groups = [
    { title: "Galería", items: slots.filter((s) => s.kind === "cover" || s.kind === "gallery") },
    { title: "Por qué comprarlo", items: slots.filter((s) => s.kind === "benefit") },
    { title: "En movimiento", items: slots.filter((s) => s.kind === "gif") },
  ].filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-1.5">
          <h2 className="text-micro font-medium text-muted-foreground uppercase">{g.title}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {g.items.map((s) => {
              const badge = slotBadge(s);
              const thumb = chosenOf(s)[0] ?? visible(s).find((o) => o.src);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(s.key)}
                    aria-current={current === s.key ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card p-2.5 text-left text-card-foreground hover:bg-accent",
                      current === s.key && "border-primary bg-primary-soft",
                    )}
                  >
                    <span className={cn("grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground", s.kind === "benefit" && "h-[4.66rem]")}>
                      {thumb?.src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
                        <img src={thumb.src} alt="" className="size-full object-cover" />
                      ) : (
                        <Icon name={visible(s).some(rendering) ? "sparkle" : "image"} className={visible(s).some(rendering) ? "animate-pulse" : undefined} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-row font-semibold">
                        {s.title}
                        {s.required ? <span className="rounded-sm bg-muted px-1.5 text-micro font-medium text-muted-foreground">Obligatorio</span> : null}
                      </span>
                      {s.pairs ? <span className="line-clamp-2 text-caption text-muted-foreground">{`“${s.pairs}”`}</span> : null}
                      <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                        {s.format}
                        {badge ? <StateChip label={badge.label} icon={badge.icon} tone={badge.tone} spin={badge.icon === "loader"} /> : null}
                      </span>
                    </span>
                    <Icon name="chevron-right" size="sm" className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Un espacio

function SlotDetail({
  productId,
  slot: s,
  references,
  canGenerate,
  costLabel,
  busy,
  onAct,
  onState,
  onError,
  onBack,
}: {
  productId: string;
  slot: PageImageSlotView;
  references: PageImagesState["references"];
  canGenerate: boolean;
  costLabel: string;
  busy: string | null;
  onAct: (key: string, fn: () => Promise<PageImagesState>, fallback: string, done?: string) => Promise<void>;
  onState: (s: PageImagesState) => void;
  onError: (m: string) => void;
  onBack?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const opts = visible(s);
  const chosen = chosenOf(s);
  const usedRefs = new Set(opts.filter((o) => o.referenceId).map((o) => o.referenceId));
  const freeRefs = references.filter((r) => !usedRefs.has(r.id));
  const aspect = s.ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";
  const gif = s.kind === "gif";
  // Galería y GIF: varias elegidas, en orden.
  const ordered = s.kind === "gallery" || gif;
  const max = gif ? GIF_MAX : GALLERY_MAX;
  const full = ordered && chosen.length >= max;

  const decide = (o: PageImageOptionView, action: "choose" | "unchoose" | "recover") =>
    onAct(`${action}-${o.id}`, () => productsApi.decidePageImage(productId, o.id, action), action === "recover" ? "No pudimos recuperar la imagen." : "No pudimos guardar tu elección.");

  // «Usar de portada»: si estaba elegida en la galería, sale de ella (la tienda no la repite).
  const makeCover = (o: PageImageOptionView) =>
    onAct(`cover-${o.id}`, () => productsApi.decidePageImage(productId, o.id, "cover"), "No pudimos cambiar la portada.", o.chosen ? "Es tu portada: la quitamos de la galería" : "Es tu portada");

  async function discard(o: PageImageOptionView) {
    await onAct(`discard-${o.id}`, () => productsApi.decidePageImage(productId, o.id, "discard"), "No pudimos descartarla.");
    if (o.source !== "reference")
      notifyUndo("Imagen descartada", async () => {
        try {
          onState(await productsApi.decidePageImage(productId, o.id, "reopen"));
        } catch (e) {
          onError(errorText(e, "No pudimos deshacer."));
        }
      });
  }

  function move(o: PageImageOptionView, delta: -1 | 1) {
    const ids = chosen.map((c) => c.id);
    const i = ids.indexOf(o.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void onAct(`order-${o.id}`, () => productsApi.orderGallery(productId, ids, s.key), "No pudimos guardar el orden.");
  }

  async function onFile(file?: File) {
    if (!file) return;
    setUpload(0);
    try {
      onState(await uploadPageImage(productId, s.key, file, setUpload).done);
      notify("Imagen agregada");
    } catch (e) {
      onError(errorText(e, "No pudimos subir la imagen."));
    } finally {
      setUpload(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section aria-labelledby={`espacio-${s.key}`} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 id={`espacio-${s.key}`} className="text-heading max-lg:sr-only">
          {s.title}
        </h2>
        <span className="text-caption text-muted-foreground max-lg:sr-only">{s.format}</span>
      </div>

      {s.pairs ? (
        <div className="rounded-md bg-muted p-3">
          <div className="text-micro text-muted-foreground">Acompaña a este texto</div>
          <p className="m-0 mt-0.5 text-body">{s.pairs}</p>
        </div>
      ) : null}

      {gif ? (
        <div className="rounded-md bg-muted p-3">
          <p className="m-0 text-body">{`Sube hasta ${GIF_MAX} GIF del producto funcionando. La página ya trae ${GIF_MAX} textos, del más fuerte al más débil: el GIF 1 lleva el texto 1, el GIF 2 el texto 2 y así. Con 3 GIF se usan los 3 primeros textos.`}</p>
          <p className="m-0 mt-1 text-caption text-muted-foreground">Lo guardamos como WebP animado, más liviano para el teléfono del comprador.</p>
        </div>
      ) : null}

      {gif ? (
        full ? (
          <p className="text-caption text-muted-foreground">{`Ya usas ${GIF_MAX} GIF: quita uno para agregar otro.`}</p>
        ) : (
          <GifAdder productId={productId} slot={s.key} room={GIF_MAX - chosen.length} onState={onState} />
        )
      ) : null}

      {ordered ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-label">{gif ? `En la página · ${chosen.length} de ${GIF_MAX}, en este orden` : `Elegidas · ${chosen.length} de ${GALLERY_MIN} a ${GALLERY_MAX}, en este orden`}</h3>
          {chosen.length ? (
            <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0 @xl:grid-cols-6">
              {chosen.map((o, i) => (
                <li key={o.id} className="flex flex-col gap-1">
                  <div className="relative aspect-square overflow-hidden rounded-md bg-muted inset-ring inset-ring-border">
                    {o.src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
                      <img src={o.src} alt={gif ? `GIF ${i + 1}` : `Galería ${i + 1}`} className="size-full object-cover" />
                    ) : null}
                    <span className="absolute top-1 left-1 grid size-6 place-items-center rounded-full bg-primary text-micro font-semibold text-primary-foreground">{i + 1}</span>
                  </div>
                  <div className="flex justify-center gap-1">
                    <IconButton icon="chevron-left" label={`Mover la ${i + 1} antes`} disabled={i === 0 || !!busy} onClick={() => move(o, -1)} />
                    <IconButton icon="chevron-right" label={`Mover la ${i + 1} después`} disabled={i === chosen.length - 1 || !!busy} onClick={() => move(o, 1)} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-caption text-muted-foreground">{gif ? "Todavía no hay GIF en la página. Sube el primero." : "Toca Elegir en las opciones de abajo. La primera va justo después de la portada."}</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-label">{gif ? "Tus GIF" : "Opciones"}</h3>
        {opts.length ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 @xl:grid-cols-3 @4xl:grid-cols-4">
            {opts.map((o) => (
              <li key={o.id}>
                <OptionTile
                  option={o}
                  aspect={aspect}
                  gallery={ordered}
                  full={full}
                  busy={busy}
                  costLabel={costLabel}
                  canGenerate={canGenerate}
                  onChoose={() => decide(o, "choose")}
                  onUnchoose={() => decide(o, "unchoose")}
                  onDiscard={() => discard(o)}
                  onRecover={() => decide(o, "recover")}
                  onCover={s.kind === "gallery" ? () => makeCover(o) : undefined}
                  onRetry={o.shotId ? () => onAct(`shot-${o.shotId}`, () => productsApi.renderShot(productId, o.shotId!), "No pudimos generar otra.") : undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-muted-foreground">
            {gif ? "Todavía no subes GIF." : canGenerate ? "Todavía no hay opciones. Genera la galería o sube una imagen." : "Elige una de tus fotos o sube una imagen."}
          </p>
        )}
      </div>

      {s.shots.length && canGenerate ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-label">Generar otra</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {s.shots.map((sh) => (
              <li key={sh.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="text-row font-medium">{sh.name}</span>
                  <span className="block text-caption text-muted-foreground">{`${sh.type} · ${sh.look}`}</span>
                </span>
                <Button size="sm" variant="secondary" icon="sparkle" loading={busy === `shot-${sh.id}`} disabled={!!busy} onClick={() => onAct(`shot-${sh.id}`, () => productsApi.renderShot(productId, sh.id), "No pudimos generar otra.", "Generando otra imagen")}>
                  {`Generar otra · ${costLabel}`}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {freeRefs.length && !gif ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-label">Tus fotos</h3>
          <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0 @xl:grid-cols-6">
            {freeRefs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={!!busy || full}
                  onClick={() => onAct(`ref-${r.id}`, () => productsApi.chooseReference(productId, s.key, r.id), "No pudimos elegir la foto.", "Foto elegida")}
                  aria-label={`Elegir tu foto ${r.alt || ""}`.trim()}
                  className="block aspect-square w-full cursor-pointer overflow-hidden rounded-md bg-muted inset-ring inset-ring-border disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto de Shopify o firmada de Storage */}
                  <img src={r.src} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {gif ? null : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button variant="secondary" icon="upload" loading={upload !== null} disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {upload !== null ? `Subiendo ${Math.round(upload * 100)}%` : "Subir imagen"}
            </Button>
          </>
        )}
        {onBack ? (
          <Button variant="ghost" icon="chevron-left" onClick={onBack}>
            Todos los espacios
          </Button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Agregar GIF

const GIF_TYPES = ["image/gif", "image/webp", "image/png", "image/apng"];

/**
 * Agregar GIF con el mismo ImageUploader de Información base: desde el equipo (varios a la vez, en
 * el orden elegido, hasta llenar los 5) o desde un enlace, que descarga el servidor.
 */
function GifAdder({ productId, slot, room, onState }: { productId: string; slot: string; room: number; onState: (s: PageImagesState) => void }) {
  const [mode, setMode] = useState<UploaderMode>("file");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const [fetching, setFetching] = useState(false);
  const [items, setItems] = useState<(UploadItem & { cancel?: () => void })[]>([]);
  const patch = (id: string, p: Partial<UploadItem & { cancel?: () => void }>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));

  async function addFiles(files: File[]) {
    // Uno tras otro: cada GIF entra al final de la fila, así el orden es el que se eligió.
    for (const [i, file] of files.entries()) {
      const id = `${Date.now()}-${i}-${file.name}`;
      if (i >= room) {
        setItems((list) => [...list, { id, name: file.name, state: "error", detail: `Ya hay ${GIF_MAX} GIF: quita uno para agregar este.` }]);
        continue;
      }
      const upload = uploadPageImage(productId, slot, file, (p) => patch(id, { progress: p }));
      setItems((list) => [...list, { id, name: file.name, state: "uploading", progress: 0, cancel: upload.cancel }]);
      try {
        onState(await upload.done);
        patch(id, { state: "done", detail: "Agregado", cancel: undefined });
      } catch (e) {
        patch(id, { state: "error", detail: errorText(e, "No pudimos subir el GIF."), cancel: undefined });
      }
    }
  }

  async function fetchUrl() {
    setFetching(true);
    setUrlError(undefined);
    try {
      onState(await productsApi.importPageImageUrl(productId, slot, url.trim()));
      setUrl("");
      notify("GIF agregado");
    } catch (e) {
      setUrlError(errorText(e, "No pudimos traer el GIF. Intenta de nuevo o súbelo desde tu equipo."));
    } finally {
      setFetching(false);
    }
  }

  return (
    <ImageUploader
      mode={mode}
      onModeChange={setMode}
      state={fetching ? "fetching" : "idle"}
      items={items}
      onFiles={addFiles}
      onCancel={(id) => items.find((it) => it.id === id)?.cancel?.()}
      url={url}
      onUrlChange={(v) => {
        setUrl(v);
        setUrlError(undefined);
      }}
      urlError={urlError}
      onFetchUrl={fetchUrl}
      accept={GIF_TYPES}
      noun="GIF"
      dragLabel="Arrastra tus GIF aquí o "
      pickLabel="elige desde tu equipo"
      compactLabel="Elige tus GIF"
      formats={`GIF, WebP animado o APNG · hasta 25 MB cada uno · máximo ${GIF_MAX}`}
      urlLabel="Enlace del GIF"
      urlHint="Pega el enlace directo al GIF (por ejemplo, desde Giphy o la página del proveedor)."
    />
  );
}

// ---------------------------------------------------------------- Una opción

function OptionTile({
  option: o,
  aspect,
  gallery,
  full,
  busy,
  costLabel,
  canGenerate,
  onChoose,
  onUnchoose,
  onDiscard,
  onRecover,
  onRetry,
  onCover,
}: {
  option: PageImageOptionView;
  aspect: string;
  gallery: boolean;
  full: boolean;
  busy: string | null;
  costLabel: string;
  canGenerate: boolean;
  onChoose: () => void;
  onUnchoose: () => void;
  onDiscard: () => void;
  onRecover: () => void;
  onRetry?: () => void;
  /** Solo en la galería: la pasa a ser la portada. */
  onCover?: () => void;
}) {
  if (rendering(o)) {
    return (
      <div className="flex flex-col gap-1.5">
        <div role="status" className={cn("grid place-items-center rounded-md bg-muted p-3 text-center", aspect)}>
          <div className="flex flex-col items-center gap-2">
            <StateChip label={o.render === "queued" ? "En cola" : "Generando"} icon="loader" tone="progress" spin />
            <span className="text-caption text-muted-foreground">{o.error ?? (o.attempt > 1 ? "Segundo intento, para corregir lo que el QA encontró" : "Suele tardar menos de un minuto")}</span>
          </div>
        </div>
        <span className="text-caption text-muted-foreground">{SOURCE[o.source]}</span>
      </div>
    );
  }
  if (o.render === "failed") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className={cn("grid place-items-center overflow-hidden rounded-md border border-destructive p-3 text-center", aspect)}>
          <div className="flex flex-col items-center gap-2">
            <StatusBadge status="error" size="sm" />
            <span className="line-clamp-4 text-caption text-destructive">{o.error ?? "No se pudo generar."}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {o.recoverable ? (
            <Button size="sm" variant="secondary" icon="refresh" loading={busy === `recover-${o.id}`} onClick={onRecover}>
              Recuperar
            </Button>
          ) : null}
          {onRetry && canGenerate ? (
            <Button size="sm" variant="secondary" icon="sparkle" disabled={!!busy} onClick={onRetry}>
              {`Otra · ${costLabel}`}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon="x" disabled={!!busy} onClick={onDiscard}>
            Quitar
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <a
        href={o.src}
        target="_blank"
        rel="noreferrer"
        className={cn("relative block overflow-hidden rounded-md bg-muted inset-ring inset-ring-border", aspect, o.chosen && "ring-2 ring-primary")}
      >
        {o.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage
          <img src={o.src} alt={`Opción ${SOURCE[o.source]}`} className="size-full object-cover" loading="lazy" />
        ) : null}
        <span className="absolute bottom-1 left-1 rounded-sm bg-background/90 px-1.5 text-micro font-medium">{SOURCE[o.source]}</span>
        {o.cover ? <span className="absolute top-1 left-1 rounded-sm bg-primary px-1.5 text-micro font-semibold text-primary-foreground">Portada</span> : null}
        {o.chosen ? (
          <span className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-primary text-micro font-semibold text-primary-foreground">
            {gallery && o.order ? o.order : <Icon name="check" size="sm" />}
          </span>
        ) : null}
      </a>
      {o.qa ? (
        o.qa.pass ? (
          <span className="text-caption text-success">Producto y textos revisados</span>
        ) : (
          <details className="text-caption text-warning">
            <summary className="cursor-pointer">Revisa: {o.qa.issues.length === 1 ? "1 detalle" : `${o.qa.issues.length} detalles`}</summary>
            <ul className="m-0 mt-1 list-disc pl-4">
              {o.qa.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </details>
        )
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {o.chosen ? (
          <Button size="sm" variant="secondary" icon="x" loading={busy === `unchoose-${o.id}`} disabled={!!busy} onClick={onUnchoose}>
            Quitar
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon="check" loading={busy === `choose-${o.id}`} disabled={!!busy || full} onClick={onChoose}>
            Elegir
          </Button>
        )}
        {onCover && !o.cover ? (
          <Button size="sm" variant="secondary" icon="star" loading={busy === `cover-${o.id}`} disabled={!!busy} onClick={onCover} aria-label="Usar esta imagen de portada">
            Portada
          </Button>
        ) : null}
        {!o.chosen ? (
          <Button size="sm" variant="ghost" icon="x" disabled={!!busy} onClick={onDiscard} aria-label="Descartar esta opción">
            Descartar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
