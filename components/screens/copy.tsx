"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Icon, Notice, OfferPreview, StageMeter, StatusBadge, TopBar, notify, type MeterStage } from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { ListingPreview } from "@/components/store-preview/listing";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LISTING, type Listing } from "@/lib/copy/listing";
import { LISTING_SLOTS, PAGE_GROUPS, componentName, missingImages, type ListingSlot } from "@/lib/copy/page-ui";
import { copyProgress, enabledLabel } from "@/lib/copy/progress";
import { COPY_STAGE_TITLE } from "@/lib/products/stages";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import { CATALOG } from "@/lib/shopify/components/catalog";
import type { CopyState, ImagePick, ProductCopy, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageAccent } from "./page-accent";
import { ComponentCard } from "./page/component-card";
import { ComponentEditor, imagesBySlot } from "./page/component-editor";

// Etapa Página del producto (docs/spec-pagina-componentes.md, design-system/textos.md): con los 2
// desarrollos aprobados → «Escribir la página con IA» (una llamada) → la ficha (se aprueba) y los
// componentes de conversión como se verán en la tienda, cada uno con «Usar en la página». Tocar un
// componente abre su hoja de edición; guardar lo aprueba y lo usa.

const POLL_MS = 2500;
const active = (s?: RunStatus) => s === "queued" || s === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

export function CopyScreen({ data }: { data: ProductCopy }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = data;
  const [state, setState] = useState<CopyState>(data);
  const [accent, setAccent] = useState<string | null>(data.accent);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [editError, setEditError] = useState<string>();

  const { components, run, facts, images } = state;
  const writing = active(run?.status);
  const progress = copyProgress(components);
  const listing = components.find((c) => c.component === LISTING);
  const byId = new Map(components.map((c) => [c.component, c]));
  const editingView = editing ? byId.get(editing) : undefined;
  const anglesHref = productHref(product.id, "angulos");
  const imagesHref = productHref(product.id, "imagenes");
  const reviewsHref = productHref(product.id, "resenas");
  // Hay algo que reescribir: lo no aprobado, la ficha que falta o un componente que ya tiene las reseñas que necesitaba.
  const redoable =
    !listing || components.some((c) => c.status !== "aprobado") || CATALOG.some((c) => c.metafield && !byId.has(c.id) && facts.count >= (c.minReviews ?? 0));

  // ---------------------------------------------------------------- Sondeo
  // Al llegar desde «Continuar» en Ángulos, el layout del producto se conserva de la pantalla
  // anterior: se relee una vez para que diga «Escribiendo» y no «Ángulos listos».
  useEffect(() => {
    if (writing) router.refresh();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wasWriting = useRef(writing);
  useEffect(() => {
    if (wasWriting.current && !writing) {
      router.refresh();
      if (run?.status === "succeeded") notify("La página está escrita: aprueba la ficha y elige los componentes");
      else if (run?.status === "failed") notify(run.error ?? "No pudimos escribir la página. Toca Reintentar.");
    }
    wasWriting.current = writing;
    if (!writing) return;
    const t = window.setInterval(async () => {
      try {
        setState(await productsApi.copy(product.id));
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [writing, run, product.id, router]);

  // ---------------------------------------------------------------- Acciones
  const write = async (redo: boolean) => {
    setBusy(redo ? "redo" : "write");
    setError(undefined);
    try {
      setState(await productsApi.writeCopy(product.id, redo));
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errorText(e, "No pudimos empezar a escribir la página. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  const update = async (component: string, patch: { content?: unknown; enabled?: boolean; images?: ImagePick[]; approve?: boolean }, done?: string) => {
    setBusy(component);
    setError(undefined);
    setEditError(undefined);
    try {
      setState(await productsApi.updateComponent(product.id, component, patch));
      if (done) notify(done);
      router.refresh();
      return true;
    } catch (e) {
      const message = errorText(e, "No pudimos guardar el cambio. Intenta de nuevo.");
      if (editing) setEditError(message);
      else setError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string, enabled: boolean) => update(id, { enabled }, enabled ? `${componentName(id)} va en la página` : `${componentName(id)} ya no va en la página`);
  const save = async (patch: { content: unknown; images?: ImagePick[] }) => {
    if (!editing) return;
    const listingEdit = editing === LISTING;
    if (await update(editing, patch, listingEdit ? "Ficha aprobada" : `${componentName(editing)} guardado y en la página`)) setEditing(null);
  };

  // ---------------------------------------------------------------- Piezas
  let view: "locked" | "start" | "writing" | "failed" | "page";
  if (state.locked) view = "locked";
  else if (writing && !components.length) view = "writing";
  else if (!components.length) view = run?.status === "failed" ? "failed" : "start";
  else view = "page";

  const enabledText = enabledLabel(progress.enabled);
  const subtitle =
    view === "page"
      ? progress.complete
        ? `Ficha aprobada · ${enabledText.toLowerCase()}`
        : "Falta aprobar la ficha"
      : writing
        ? "La IA está escribiendo"
        : "La página del producto en tu tienda";

  const staleNotice = state.stale ? (
    <Notice
      title="Cambiaste tus ángulos."
      body="Reescribe lo que no aprobaste para que calce con ellos."
      action={
        <Button size="sm" variant="secondary" icon="sparkle" loading={busy === "redo"} disabled={writing || !redoable} onClick={() => write(true)}>
          Reescribir
        </Button>
      }
    />
  ) : null;

  // Una reescritura en curso o con error no tapa lo que ya está escrito.
  const runNotice =
    components.length && writing ? (
      <Notice tone="info" icon="sparkle" title="La IA está reescribiendo lo que no aprobaste." body="Puedes seguir revisando: se actualiza solo." />
    ) : components.length && run?.status === "failed" ? (
      <div role="alert" className="rounded-md bg-destructive-soft p-3 text-label font-normal text-destructive">
        {run.error ?? "No pudimos reescribir la página. Toca Reescribir lo no aprobado."}
      </div>
    ) : null;

  const ficha = listing ? (listing.content as Partial<Listing>) : undefined;
  const listingCard = listing ? (
    <section aria-labelledby="ficha" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="ficha" className="text-heading">
            Ficha del producto
          </h2>
          <p className="text-caption text-muted-foreground">Título, oferta y lo que ve Google. Es obligatoria.</p>
        </div>
        <StatusBadge status={listing.status === "aprobado" ? "aprobado" : "revision"} label={listing.status === "aprobado" ? "Aprobada" : "Por aprobar"} />
      </div>
      <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-[--spacing(72)_minmax(0,1fr)] @3xl:items-start @3xl:gap-4">
        <OfferPreview title={ficha?.title ?? product.name} price={facts.price} compareAt={facts.compareAt} image={facts.productImage} />
        <div className="flex flex-col gap-3">
          {ficha?.offer_line ? <p className="text-small font-medium">{ficha.offer_line}</p> : null}
          {ficha?.short_description ? <p className="text-small text-muted-foreground">{ficha.short_description}</p> : null}
          <dl className="grid gap-1 rounded-md bg-muted p-3 text-caption">
            <dt className="text-muted-foreground">En Google</dt>
            <dd className="font-medium text-foreground">{ficha?.seo_title}</dd>
            <dd className="text-muted-foreground">{ficha?.seo_description}</dd>
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="edit" onClick={() => setEditing(LISTING)} className="max-lg:flex-1">
          Revisar ficha
        </Button>
        {listing.status !== "aprobado" ? (
          <Button variant="primary" icon="check" loading={busy === LISTING} onClick={() => update(LISTING, { approve: true }, "Ficha aprobada")} className="max-lg:flex-1">
            Aprobar ficha
          </Button>
        ) : null}
      </div>
    </section>
  ) : (
    <Notice tone="info" icon="sparkle" title="La ficha se escribe con lo que falta." body="Toca Reescribir lo no aprobado." />
  );

  const cards = PAGE_GROUPS.map((g) => {
    const list = CATALOG.filter((c) => c.kind === g.kind);
    return (
      <section key={g.kind} aria-labelledby={`grupo-${g.kind}`} className="flex flex-col gap-3">
        <div>
          <h2 id={`grupo-${g.kind}`} className="text-heading">
            {g.title}
          </h2>
          <p className="text-caption text-muted-foreground">{g.hint}</p>
        </div>
        {list.map((c) => {
          const v = byId.get(c.id);
          const needs = c.minReviews && facts.count < c.minReviews ? c.minReviews : 0;
          return (
            <ComponentCard
              key={c.id}
              id={c.id}
              view={v}
              facts={facts}
              accent={accent}
              catalog={images}
              busy={busy === c.id}
              unavailable={
                !v && needs
                  ? { reason: needs === 1 ? "Necesita al menos 1 reseña aprobada." : `Necesita al menos ${needs} reseñas aprobadas.`, href: reviewsHref, action: "Ir a Reseñas" }
                  : undefined
              }
              onToggle={(on) => toggle(c.id, on)}
              onEdit={() => {
                setEditError(undefined);
                setEditing(c.id);
              }}
            />
          );
        })}
      </section>
    );
  });

  /** La página armada como la tienda: los bloques en su lugar de la ficha y después las secciones (escritorio). */
  const inPage = CATALOG.filter((c) => byId.get(c.id)?.enabled && !missingImages(c.id, byId.get(c.id)!.images).some((s) => s.min > 0));
  const draw = (c: (typeof CATALOG)[number]) => {
    const v = byId.get(c.id)!;
    const Preview = PREVIEWS[c.id];
    return (
      <div key={c.id} className={c.kind === "section" ? undefined : "py-1"}>
        <Preview content={v.content} facts={facts} images={imagesBySlot(v.images, images)} />
      </div>
    );
  };
  const slots: Partial<Record<ListingSlot, React.ReactNode>> = {};
  for (const slot of ["top", "afterPrice", "afterButton"] as const) {
    const here = inPage.filter((c) => c.kind === "block" && (LISTING_SLOTS[c.id] ?? "afterButton") === slot);
    if (here.length) slots[slot] = here.map(draw);
  }
  const pageColumn = (
    <aside aria-label="Tu página" className="hidden border-l bg-sidebar px-4 pt-6 pb-4 @5xl:block">
      <div className="sticky top-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-heading">Tu página</h2>
          <span className="text-caption text-muted-foreground">{enabledText}</span>
        </div>
        <div role="region" aria-label="Vista previa de tu página" tabIndex={0} className="max-h-[calc(100svh-var(--spacing)*24)] overflow-y-auto rounded-lg border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StoreFrame accent={accent} scale={0.85}>
            {listing ? <ListingPreview content={listing.content as Partial<Listing>} facts={facts} images={{}} slots={slots} /> : null}
            {inPage.filter((c) => c.kind === "section").map(draw)}
          </StoreFrame>
        </div>
      </div>
    </aside>
  );

  const actionClass = "max-lg:w-full lg:h-control lg:text-row";
  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (view === "locked") {
    body = (
      state.locked === "images" ? (
        <EmptyState
          icon="lock"
          title="Primero, las imágenes"
          body="La página usa las imágenes que elijas: la portada y la galería van en la ficha, y los componentes toman sus fotos de ahí."
          action={
            <Button size="sm" iconEnd="chevron-right" href={productHref(product.id, "imagenes")}>
              Ir a Imágenes
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon="lock"
          title="Aprueba los 2 desarrollos de Ángulos"
          body="La página sale del ángulo principal y del secundario."
          action={
            <Button size="sm" iconEnd="chevron-right" href={anglesHref}>
              Ir a Ángulos
            </Button>
          }
        />
      )
    );
  } else if (view === "start" || view === "failed") {
    const failed = view === "failed";
    body = (
      <EmptyState
        icon={failed ? "alert" : "text"}
        tone={failed ? "error" : "neutral"}
        title={failed ? "No se pudo escribir la página" : "Escribe la página de tu producto"}
        body={
          failed
            ? (run?.error ?? "Toca Reintentar.")
            : `La ficha (título, oferta y Google) y ${CATALOG.length} componentes que responden las dudas del comprador: beneficios, envío, reseñas, GIFs, preguntas y más. Tú eliges cuáles van.`
        }
        action={
          <Button variant="primary" icon="sparkle" loading={busy === "write"} onClick={() => write(false)}>
            {failed ? "Reintentar" : "Escribir la página con IA"}
          </Button>
        }
      />
    );
  } else if (view === "writing") {
    body = (
      <EmptyState icon="sparkle" busy title="La IA está escribiendo la página" body="La ficha y todos los componentes, en una sola escritura. Suele tardar 1 a 2 minutos. Puedes salir: te avisamos en Hoy.">
        <div aria-hidden className="mt-2 flex w-full flex-col items-center gap-2">
          {["w-4/5", "w-2/3", "w-3/4"].map((w) => (
            <span key={w} className={cn("block h-3.5 animate-pulse rounded-sm bg-muted", w)} />
          ))}
        </div>
      </EmptyState>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {staleNotice || runNotice ? (
          <div className="flex flex-col gap-3">
            {staleNotice}
            {runNotice}
          </div>
        ) : null}
        {listingCard}
        <PageAccent productId={product.id} initial={data.accent} onSaved={setAccent} />
        {cards}
      </div>
    );
    const nextLabel = desktop ? "Continuar: Publicar" : "Publicar";
    footer = (
      <StickyActions
        variant="bar"
        summary={
          // En escritorio angosto no cabe junto a los dos botones.
          <span className="hidden @4xl:inline">{progress.complete ? `La ficha está aprobada · ${enabledText.toLowerCase()}.` : "Aprueba la ficha para continuar."}</span>
        }
        className="lg:px-8"
      >
        <Button size="lg" icon="sparkle" loading={busy === "redo"} disabled={!redoable || writing} onClick={() => write(true)} className={actionClass}>
          {desktop ? "Reescribir lo no aprobado" : "Reescribir"}
        </Button>
        {progress.complete ? (
          <Button variant="primary" size="lg" iconEnd="chevron-right" href={productHref(product.id, "publicar")} className={actionClass}>
            {nextLabel}
          </Button>
        ) : (
          <Button variant="primary" size="lg" iconEnd="chevron-right" disabled className={actionClass}>
            {nextLabel}
          </Button>
        )}
      </StickyActions>
    );
  }

  const meter: MeterStage[] = view === "page" ? [progress.complete ? "done" : "review", ...CATALOG.map((c): MeterStage => (byId.get(c.id)?.enabled ? "done" : "locked"))] : [];

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage={COPY_STAGE_TITLE} stageKey="textos" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title={COPY_STAGE_TITLE}
        subtitle={subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      {view === "page" ? (
        <div className="px-4 pb-2 lg:hidden">
          <StageMeter stages={meter} />
        </div>
      ) : null}

      <div className={cn("flex flex-1 flex-col", view === "page" && "@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_--spacing(100)]")}>
        <div className="flex min-w-0 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
          <div className="hidden items-center gap-3 lg:flex lg:max-w-content">
            <p className="flex-1 text-body text-muted-foreground">
              {COPY_STAGE_TITLE} · {subtitle}
            </p>
            {view === "page" && progress.complete ? (
              <span className="inline-flex items-center gap-1 text-label text-success">
                <Icon name="check" size="sm" />
                Lista para Imágenes
              </span>
            ) : null}
          </div>
          <div className="lg:max-w-content">{body}</div>
          {view === "start" || view === "failed" || view === "writing" ? <PageAccent productId={product.id} initial={data.accent} onSaved={setAccent} className="lg:max-w-content" /> : null}
          {error ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {view === "page" ? pageColumn : null}
      </div>

      {footer}

      {/* La hoja de edición: abajo en móvil, a la derecha en escritorio. */}
      <Drawer open={Boolean(editingView)} onOpenChange={(open) => !open && setEditing(null)} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
        <DrawerContent className="h-[92svh] lg:h-auto lg:w-[min(--spacing(160),100vw)] lg:max-w-none">
          {editingView ? (
            <ComponentEditor
              key={editingView.id}
              view={editingView}
              facts={facts}
              accent={accent}
              catalog={images}
              imagesHref={imagesHref}
              saving={busy === editingView.component}
              error={editError}
              onCancel={() => setEditing(null)}
              onSave={save}
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

