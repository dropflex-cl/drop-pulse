"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Icon,
  IconButton,
  ReviewImporter,
  ReviewItem,
  ReviewSummary,
  ReviewsStorePreview,
  SegmentedControl,
  StageMeter,
  TopBar,
  notify,
  notifyUndo,
  type MinStars,
} from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { useDesktop } from "@/components/shell/use-desktop";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { isAliExpressInput } from "@/lib/reviews/aliexpress";
import { IMPORT_ERRORS, importSummary } from "@/lib/reviews/copy";
import { productHref } from "@/lib/routes";
import type { CustomerReview, CustomerReviewState, ProductReviews, ReviewImport } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Reseñas (design-system › PantallasResenas1 y PantallasResenasEscritorio): importar de
// AliExpress, curar (aprobar · rechazar · editar) y, en escritorio, ver cómo quedan en la tienda.
// Decisiones optimistas con “Deshacer” en el toast, sin diálogos (como ReviewCard).

const POLL_MS = 1500;
/** duration-base: la tarjeta sale antes de cambiar de lista. */
const EXIT_MS = 200;
/** La ruta y los contadores se releen en el servidor cuando las decisiones se calman. */
const REFRESH_MS = 1200;

type Filter = "pending" | "approved" | "rejected";
type Decision = "approve" | "reject" | "reopen";
const AFTER: Record<Decision, CustomerReviewState> = {
  approve: "approved",
  reject: "rejected",
  reopen: "pending",
};

const running = (j?: ReviewImport | null) => j?.status === "queued" || j?.status === "running";

function importProgress(j: ReviewImport): { progress: number; detail: string } {
  const total = j.total || 0;
  const share = total ? Math.min(1, j.read / total) : 0;
  if (j.status === "queued" || !j.step) return { progress: 0.03, detail: "Conectando con AliExpress…" };
  if (j.step === "reading")
    return {
      progress: 0.05 + 0.55 * share,
      detail: `Leyendo reseñas… ${j.read} de ${total}`,
    };
  return {
    progress: 0.6 + 0.4 * share,
    detail: `Guardando reseñas y fotos… ${j.read} de ${total}`,
  };
}

/** “Aprobar las 9 de 5★ con foto y sin alertas” (arquitectura.md › 9). */
const isEasyApproval = (r: CustomerReview) => r.state === "pending" && r.rating === 5 && r.photos.length > 0 && r.flags.length === 0;

export function ReviewsScreen({ data }: { data: ProductReviews }) {
  const { product } = data;
  const router = useRouter();
  const desktop = useDesktop();

  // Las reseñas vienen del servidor; las decisiones se aplican aquí al instante.
  const [reviews, setReviews] = useState(data.reviews);
  const [serverReviews, setServerReviews] = useState(data.reviews);
  if (serverReviews !== data.reviews) {
    setServerReviews(data.reviews);
    setReviews(data.reviews);
  }

  const [filter, setFilter] = useState<Filter>("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------- Importar
  const [job, setJob] = useState<ReviewImport | null>(data.lastImport ?? null);
  const [justFinished, setJustFinished] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [url, setUrl] = useState(data.source?.url ?? "");
  const [minStars, setMinStars] = useState<MinStars>("4");
  const [photosOnly, setPhotosOnly] = useState(false);
  const [translate, setTranslate] = useState(true);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const importing = running(job);
  // Un fallo de la última importación se muestra una vez, en la tarjeta, hasta el siguiente intento.
  const [jobErrorSeen, setJobErrorSeen] = useState(false);
  const importError = formError ?? (job?.status === "failed" && !jobErrorSeen ? job.error : null);

  async function startImport() {
    const raw = url.trim();
    if (!raw) return setFormError("Pega el enlace del producto en AliExpress.");
    if (!isAliExpressInput(raw)) return setFormError(IMPORT_ERRORS.not_aliexpress);
    setFormError(null);
    setJobErrorSeen(true);
    setStarting(true);
    try {
      const { job: created } = await productsApi.importReviews(product.id, {
        url: raw,
        minRating: Number(minStars) as 1 | 4 | 5,
        photosOnly,
        translate,
      });
      setJob(created);
      setJobErrorSeen(false);
      setJustFinished(false);
      router.refresh(); // la ruta dice “Importando de AliExpress”
    } catch (e) {
      setFormError(e instanceof ProductApiClientError ? e.message : IMPORT_ERRORS.failed);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!importing) return;
    const t = window.setInterval(async () => {
      try {
        const { job: latest } = await productsApi.reviewImport(product.id);
        if (!latest) return;
        setJob(latest);
        if (!running(latest)) {
          router.refresh();
          if (latest.status === "succeeded") {
            setJustFinished(true);
            setShowImporter(false);
            setFilter("pending");
          }
        }
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [importing, product.id, router]);

  // ---------------------------------------------------------------- Decidir
  const inFlight = useRef(0);
  const refreshTimer = useRef<number | undefined>(undefined);
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      if (inFlight.current === 0) router.refresh();
    }, REFRESH_MS);
  }, [router]);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  const setStates = useCallback((ids: string[], state: CustomerReviewState | ((r: CustomerReview) => CustomerReviewState)) => {
    setReviews((list) => list.map((r) => (ids.includes(r.id) ? { ...r, state: typeof state === "function" ? state(r) : state } : r)));
  }, []);

  /** Guarda en el servidor; si falla, vuelve atrás y lo dice. */
  const persist = useCallback(
    async (ids: string[], decision: Decision, before: Map<string, CustomerReviewState>) => {
      inFlight.current++;
      try {
        if (ids.length === 1) await productsApi.decideReview(product.id, ids[0]!, decision);
        else await productsApi.decideReviews(product.id, ids, decision);
      } catch (e) {
        setStates(ids, (r) => before.get(r.id) ?? r.state);
        notify(e instanceof ProductApiClientError ? e.message : "No pudimos guardar la decisión. Intenta de nuevo.");
      } finally {
        inFlight.current--;
        scheduleRefresh();
      }
    },
    [product.id, scheduleRefresh, setStates],
  );

  const decide = useCallback(
    (ids: string[], decision: Exclude<Decision, "reopen">, message: string) => {
      const before = new Map(reviews.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.state]));
      setEditing(null);
      // La tarjeta sale de “Por revisar” (200 ms, ease-exit) y recién después cambia de lista.
      setLeaving((s) => new Set([...s, ...ids]));
      window.setTimeout(() => {
        setStates(ids, AFTER[decision]);
        setLeaving((s) => new Set([...s].filter((id) => !ids.includes(id))));
      }, EXIT_MS);
      void persist(ids, decision, before);
      notifyUndo(message, () => {
        setStates(ids, (r) => before.get(r.id) ?? "pending");
        void persist(ids, "reopen", new Map(ids.map((id) => [id, AFTER[decision]])));
      });
    },
    [reviews, persist, setStates],
  );

  const reopen = useCallback(
    (review: CustomerReview) => {
      setStates([review.id], "pending");
      void persist([review.id], "reopen", new Map([[review.id, review.state]]));
    },
    [persist, setStates],
  );

  async function saveEdit(review: CustomerReview, text: string) {
    setSaving(true);
    try {
      const { review: saved } = await productsApi.editReview(product.id, review.id, text);
      setEditing(null);
      setLeaving((s) => new Set([...s, review.id]));
      window.setTimeout(() => {
        setReviews((list) => list.map((r) => (r.id === saved.id ? saved : r)));
        setLeaving((s) => new Set([...s].filter((id) => id !== review.id)));
      }, EXIT_MS);
      notifyUndo("Reseña aprobada", () => {
        setStates([review.id], "pending");
        void persist([review.id], "reopen", new Map([[review.id, "approved"]]));
      });
      scheduleRefresh();
    } catch (e) {
      notify(e instanceof ProductApiClientError ? e.message : "No pudimos guardar la reseña. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- Listas y cifras
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const r of reviews) {
      if (r.state === "pending") c.pending++;
      else if (r.state === "rejected") c.rejected++;
      else c.approved++;
    }
    return c;
  }, [reviews]);
  const visible = reviews.filter((r) => (filter === "approved" ? r.state === "approved" || r.state === "published" : r.state === filter) || leaving.has(r.id));
  const easy = reviews.filter(isEasyApproval);
  const firstPending = filter === "pending" ? visible.find((r) => !leaving.has(r.id)) : undefined;
  const kept = reviews.filter((r) => r.state !== "rejected");
  const average = kept.length ? kept.reduce((s, r) => s + r.rating, 0) / kept.length : 0;
  const distribution = [1, 2, 3, 4, 5].map((n) => reviews.filter((r) => r.rating === n).length) as [number, number, number, number, number];
  const approvedList = reviews.filter((r) => r.state === "approved" || r.state === "published");
  const approvedAvg = approvedList.length ? approvedList.reduce((s, r) => s + r.rating, 0) / approvedList.length : 0;

  // Atajos de escritorio sobre la primera por revisar: A aprobar, D rechazar, E editar.
  useEffect(() => {
    if (!desktop || !firstPending || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "a") decide([firstPending.id], "approve", "Reseña aprobada");
      else if (k === "d") decide([firstPending.id], "reject", "Reseña rechazada");
      else if (k === "e") setEditing(firstPending.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, firstPending, editing, decide]);

  // ---------------------------------------------------------------- Piezas
  const hasReviews = reviews.length > 0;
  const importerState = importing ? "fetching" : importError ? "error" : justFinished && job?.status === "succeeded" ? "done" : "idle";
  const { progress, detail } = job && importing ? importProgress(job) : { progress: 0, detail: undefined };
  // Mientras llega la lista nueva, el botón cuenta lo que trajo la importación.
  const toReview = counts.pending || (justFinished ? (job?.imported ?? 0) : 0);
  const importerOpen = !hasReviews || importing || showImporter || importerState === "done" || importerState === "error";

  const importer = (
    <ReviewImporter
      state={importerState}
      url={url}
      onUrlChange={(v) => {
        setUrl(v);
        if (formError) setFormError(null);
      }}
      error={importError ?? undefined}
      progress={progress}
      detail={detail}
      summary={job ? importSummary(job.imported, job.skipped, average || undefined) : undefined}
      actions={
        toReview ? (
          <Button
            size="sm"
            variant="primary"
            iconEnd="chevron-right"
            onClick={() => {
              setJustFinished(false);
              setFilter("pending");
            }}
          >
            {`Revisar ${toReview}`}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setJustFinished(false)}>
            Listo
          </Button>
        )
      }
      minStars={minStars}
      onMinStarsChange={setMinStars}
      photosOnly={photosOnly}
      onPhotosOnlyChange={setPhotosOnly}
      translate={translate}
      onTranslateChange={setTranslate}
      primary={!hasReviews}
      title={hasReviews && importerState === "idle" ? "Importar más de AliExpress" : undefined}
      onImport={startImport}
      starting={starting}
    />
  );

  const trust = (
    <div className="flex gap-3 rounded-lg border bg-card p-4">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-warning-soft text-warning">
        <Icon name="shield" />
      </span>
      <div>
        <p className="text-row font-semibold">Nada se publica sin tu aprobación</p>
        <p className="mt-0.5 text-label font-normal text-muted-foreground">
          Cada reseña queda pendiente hasta que la apruebes. Las publicamos con su calificación y fecha originales.
        </p>
      </div>
    </div>
  );

  const list = hasReviews ? (
    <section aria-label="Reseñas importadas" className="flex flex-col gap-3">
      <SegmentedControl
        block
        value={filter}
        onChange={(v) => {
          setEditing(null);
          setFilter(v as Filter);
        }}
        label="Filtrar reseñas"
        options={[
          { value: "pending", label: "Por revisar", count: counts.pending },
          { value: "approved", label: "Aprobadas", count: counts.approved },
          { value: "rejected", label: "Rechazadas", count: counts.rejected },
        ]}
        className="lg:self-start"
      />
      {filter === "pending" && easy.length > 1 ? (
        <div className="flex items-center gap-2 rounded-md bg-muted py-2 pr-2 pl-3 text-label font-normal">
          <Icon name="sparkle" size="sm" />
          <span className="flex-1">{`${easy.length} son de 5★ con foto y sin alertas`}</span>
          <Button
            size="sm"
            onClick={() =>
              decide(
                easy.map((r) => r.id),
                "approve",
                `${easy.length} reseñas aprobadas`,
              )
            }
          >
            {`Aprobar ${easy.length}`}
          </Button>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {`${counts.pending} por revisar`}
      </p>
      {visible.length ? (
        visible.map((r) => (
          <ReviewItem
            key={r.id}
            {...r}
            editing={editing === r.id}
            saving={saving && editing === r.id}
            keys={desktop && r.id === firstPending?.id}
            onApprove={() => decide([r.id], "approve", "Reseña aprobada")}
            onReject={() => decide([r.id], "reject", "Reseña rechazada")}
            onEdit={() => setEditing(r.id)}
            onCancelEdit={() => setEditing(null)}
            onSave={(text) => saveEdit(r, text)}
            onUndo={() => reopen(r)}
            className={cn(leaving.has(r.id) && "-translate-y-2 opacity-0 ease-exit")}
          />
        ))
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-small text-muted-foreground">
          {filter === "pending"
            ? counts.approved
              ? "Revisaste todas. Las aprobadas se publican cuando publiques el producto."
              : "No quedan reseñas por revisar."
            : filter === "approved"
              ? "Aún no apruebas reseñas."
              : "No rechazaste ninguna."}
        </p>
      )}
    </section>
  ) : null;

  const subtitle = hasReviews ? `${reviews.length} importadas · ${counts.pending} por revisar` : "Opcional · la IA también las usa para escribir";

  return (
    <div className="flex flex-col">
      <AssistantScope productId={product.id} product={product.name} stage="Reseñas" stageKey="resenas" image={product.image} />
      <TopBar
        back={product.name}
        backHref={productHref(product.id)}
        title="Reseñas"
        subtitle={subtitle}
        actions={
          <>
            {hasReviews && !importing ? (
              <IconButton icon="arrow-down" label={showImporter ? "Ocultar importar" : "Importar más"} onClick={() => setShowImporter((v) => !v)} />
            ) : null}
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="px-4 pb-2 lg:hidden">
        <StageMeter stages={product.meter} />
      </div>

      {/* Escritorio: lista al centro y, si cabe, resumen y vista de la tienda a la derecha (RvDesk). */}
      <div className="@container">
        <div
          className={cn(
            "flex flex-col gap-4 px-4 pt-2 pb-6 lg:gap-6 lg:px-7 lg:pt-5",
            hasReviews ? "@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_--spacing(85)] @4xl:items-start @4xl:gap-7" : "lg:max-w-content",
          )}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <div className="hidden items-center justify-between gap-3 lg:flex">
              <div>
                <h2 className="text-title">Reseñas</h2>
                <p className="text-caption text-muted-foreground">
                  {hasReviews ? `${reviews.length} importadas de AliExpress · ${counts.pending} por revisar` : "Opcional · la IA también las usa para escribir"}
                </p>
              </div>
              {hasReviews && !importing ? (
                <Button icon="arrow-down" onClick={() => setShowImporter((v) => !v)} aria-expanded={importerOpen}>
                  {showImporter ? "Ocultar" : "Importar más"}
                </Button>
              ) : null}
            </div>
            {importerOpen ? importer : null}
            {!hasReviews && !importing ? trust : null}
            {/* Móvil: el resumen arriba de la lista cuando ya no hay pendientes (ReviewSummary/README). */}
            {hasReviews && !counts.pending ? (
              <div className="rounded-lg border bg-card p-4 lg:hidden">
                <ReviewSummary average={average} total={reviews.length} distribution={distribution} />
              </div>
            ) : null}
            {list}
          </div>

          {hasReviews ? (
            <aside aria-label="Resumen de reseñas" className="hidden flex-col gap-4 lg:flex">
              <div className="rounded-lg border bg-card p-4">
                <ReviewSummary average={average} total={reviews.length} distribution={distribution} />
              </div>
              <ReviewsStorePreview
                average={approvedAvg}
                count={approvedList.length}
                reviews={approvedList.slice(0, 2).map((r) => ({
                  text: r.text,
                  rating: r.rating,
                  author: r.author,
                  country: r.country,
                }))}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
