"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  CopySummary,
  EmptyState,
  Notice,
  PageOutline,
  ReviewActions,
  ReviewCard,
  StageMeter,
  TopBar,
  notify,
  notifyUndo,
  type BlockState,
  type MeterStage,
  type ReviewState,
  type SummaryTag,
} from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { PageAccent } from "./page-accent";
import { useDesktop } from "@/components/shell/use-desktop";
import { PAGE_SECTIONS, splitFaq } from "@/lib/copy/blocks";
import { copyProgress, itemState, type ItemState } from "@/lib/copy/progress";
import { COPY_STAGE_TITLE } from "@/lib/products/stages";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { CopyItem, CopyState, ProductCopy, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Textos, la página del producto (PantallasTextos1/2 y PantallasTextosEscritorio,
// design-system/textos.md): con los 2 desarrollos aprobados → «Escribir textos con IA» → un bloque a
// la vez (aceptar · editar · descartar, con Deshacer y atajos A / D / E) → lo aprobado por sección.

const POLL_MS = 2500;
const EXIT_MS = 200; // duration-base: la propuesta decidida sale antes de mostrar la siguiente
const active = (s?: RunStatus) => s === "queued" || s === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
const pendingItem = (i: CopyItem) => itemState(i) === "pending";

/** Qué pasa si se descarta, dicho antes de decidir. */
function discardHint(i: CopyItem): string {
  if (i.key === "title") return "se mantiene el título actual de Shopify.";
  if (i.original) return "se mantiene la descripción actual de Shopify.";
  if (i.key === "faq") return "esta pregunta no va en la página.";
  if (i.required) return "queda pendiente: es obligatorio y tendrás que aprobar una versión.";
  return "este bloque no va en la página.";
}

const OUTLINE_STATE: Record<ItemState, BlockState> = {
  accepted: "accepted",
  edited: "edited",
  kept: "accepted",
  discarded: "discarded",
  missing: "missing",
  pending: "pending",
};

const SUMMARY_TAG: Partial<Record<ItemState, SummaryTag>> = {
  edited: "edited",
  kept: "kept",
  discarded: "omitted",
  missing: "missing",
};

/** El texto de un bloque para leer (las preguntas, en dos líneas). */
function plain(i: CopyItem): string {
  if (i.key !== "faq") return i.text;
  const { q, a } = splitFaq(i.text);
  return `${q}\n${a}`;
}

export function CopyScreen({ data }: { data: ProductCopy }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = data;
  const [state, setState] = useState<CopyState>(data);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const { items, run } = state;
  const writing = active(run?.status);
  const progress = copyProgress(items);
  const firstPending = items.find(pendingItem);
  const current = items.find((i) => i.id === selected) ?? firstPending;
  const currentIndex = current ? items.indexOf(current) + 1 : 0;
  const anglesHref = productHref(product.id, "angulos");
  const imagesHref = productHref(product.id, "imagenes");
  const redoable = items.some((i) => i.status !== "aprobado");

  // ---------------------------------------------------------------- Sondeo
  // Al llegar desde «Continuar» en Ángulos, el layout del producto (encabezado y ruta) se conserva de
  // la pantalla anterior: se relee una vez para que diga «Escribiendo» y no «Ángulos listos».
  useEffect(() => {
    if (writing) router.refresh();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wasWriting = useRef(writing);
  useEffect(() => {
    if (wasWriting.current && !writing) {
      router.refresh();
      if (run?.status === "succeeded") notify("La página está escrita: revisa cada bloque");
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
      setSelected(null);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(errorText(e, "No pudimos empezar a escribir la página. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  };

  const decide = useCallback(
    async (item: CopyItem, action: "approve" | "reject" | "reopen", text?: string) => {
      setBusy(action);
      setError(undefined);
      const exit = action !== "reopen";
      if (exit) setLeaving(true);
      try {
        const [next] = await Promise.all([
          productsApi.decideCopyItem(product.id, item.id, action, text),
          exit ? new Promise((r) => window.setTimeout(r, EXIT_MS)) : null,
        ]);
        setState(next);
        setEditing(false);
        if (action === "reopen") {
          setSelected(item.id);
          return;
        }
        // Pasa sola al siguiente pendiente, como la revisión de textos.
        setSelected(null);
        router.refresh();
        notifyUndo(action === "approve" ? (text != null ? "Tu versión quedó aceptada" : "Propuesta aceptada") : "Propuesta descartada", () =>
          decide(item, "reopen"),
        );
      } catch (e) {
        setError(errorText(e, "No pudimos guardar tu decisión. Intenta de nuevo."));
      } finally {
        setBusy(null);
        setLeaving(false);
      }
    },
    [product.id, router],
  );

  // Atajos de escritorio: A aceptar, D descartar, E editar (fuera de campos de texto).
  useEffect(() => {
    if (!desktop || !current) return;
    const onKey = (e: KeyboardEvent) => {
      if (editing || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "a") decide(current, "approve");
      else if (k === "d") decide(current, "reject");
      else if (k === "e") setEditing(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, current, editing, busy, decide]);

  const pick = (id: string) => {
    setSelected(id);
    setEditing(false);
    setOutlineOpen(false);
  };

  // ---------------------------------------------------------------- Piezas
  let view: "locked" | "start" | "writing" | "failed" | "review" | "done";
  if (state.locked) view = "locked";
  else if (writing && !items.length) view = "writing";
  else if (!items.length) view = run?.status === "failed" ? "failed" : "start";
  else if (current) view = "review";
  else view = "done";

  const counter = `${progress.approved} de ${progress.total} aceptados`;
  const subtitle =
    view === "review" || view === "done"
      ? `${counter}${progress.missing.length ? ` · ${progress.missing.length === 1 ? "1 obligatorio pendiente" : `${progress.missing.length} obligatorios pendientes`}` : ""}`
      : writing
        ? "La IA está escribiendo"
        : "La página del producto en tu tienda";

  const outlineGroups = PAGE_SECTIONS.map((title) => ({
    title,
    items: [
      ...items
        .filter((i) => i.section === title)
        .map((i) => ({
          id: i.id,
          label: i.label,
          required: i.required,
          state: i.id === current?.id ? ("current" as const) : OUTLINE_STATE[itemState(i)],
        })),
      ...(title === "Dudas" && state.noGuarantee ? [{ label: "Garantía", state: "omitted" as const }] : []),
    ],
  })).filter((g) => g.items.length);

  const summarySections = PAGE_SECTIONS.map((title) => ({
    title,
    items: [
      ...items
        .filter((i) => i.section === title)
        .map((i) => {
          const s = itemState(i);
          const text = s === "kept" ? i.original : s === "accepted" || s === "edited" ? plain(i) : undefined;
          return { id: i.id, label: i.label, text, tag: SUMMARY_TAG[s] };
        }),
      ...(title === "Dudas" && state.noGuarantee
        ? [
            {
              label: "Garantía",
              tag: "omitted" as const,
              text: "Tu ficha no tiene días de garantía.",
            },
          ]
        : []),
    ],
  })).filter((s) => s.items.length);

  const staleNotice = state.stale ? (
    <Notice
      title="Cambiaste tus ángulos."
      body="Reescribe los textos que no aprobaste."
      action={
        <Button size="sm" variant="secondary" icon="sparkle" loading={busy === "redo"} disabled={writing || !redoable} onClick={() => write(true)}>
          Reescribir
        </Button>
      }
    />
  ) : null;

  // Una reescritura en curso o con error no tapa lo que ya está escrito.
  const runNotice =
    items.length && writing ? (
      <Notice tone="info" icon="sparkle" title="La IA está reescribiendo los textos que no aprobaste." body="Puedes seguir revisando: se actualizan solos." />
    ) : items.length && run?.status === "failed" ? (
      <div role="alert" className="rounded-md bg-destructive-soft p-3 text-label font-normal text-destructive">
        {run.error ?? "No pudimos reescribir los textos. Toca Rehacer descartados."}
      </div>
    ) : null;

  const actionClass = "max-lg:w-full lg:h-control lg:text-row";
  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (view === "locked") {
    body = (
      <EmptyState
        icon="lock"
        title="Aprueba los 2 desarrollos de Ángulos"
        body="Los textos de la página salen del ángulo principal y del secundario."
        action={
          <Button size="sm" iconEnd="chevron-right" href={anglesHref}>
            Ir a Ángulos
          </Button>
        }
      />
    );
  } else if (view === "start" || view === "failed") {
    const failed = view === "failed";
    body = (
      <EmptyState
        icon={failed ? "alert" : "text"}
        tone={failed ? "error" : "neutral"}
        title={failed ? "No se pudieron escribir los textos" : "Escribe la página de tu producto"}
        body={
          failed
            ? (run?.error ?? "Toca Reintentar.")
            : "Título, descripción, beneficios, cómo funciona, preguntas, envío y pago, y lo que ve Google. Cada texto lo apruebas tú."
        }
        action={
          <Button variant="primary" icon="sparkle" loading={busy === "write"} onClick={() => write(false)}>
            {failed ? "Reintentar" : "Escribir textos con IA"}
          </Button>
        }
      />
    );
  } else if (view === "writing") {
    body = (
      <EmptyState icon="sparkle" busy title="La IA está escribiendo los textos" body="Suele tardar menos de un minuto. Puedes salir: te avisamos en Hoy.">
        <div aria-hidden className="mt-2 flex w-full flex-col items-center gap-2">
          {["w-4/5", "w-2/3", "w-3/4"].map((w) => (
            <span key={w} className={cn("block h-3.5 animate-pulse rounded-sm bg-muted", w)} />
          ))}
        </div>
      </EmptyState>
    );
  } else if (view === "review" && current) {
    const faq = current.key === "faq" ? splitFaq(current.text) : undefined;
    const cardState: ReviewState = editing ? "editing" : current.status === "aprobado" ? "accepted" : current.status === "rechazado" ? "discarded" : "pending";
    body = (
      <div className="flex flex-col gap-3">
        {staleNotice}
        {runNotice}
        {current.missing ? (
          <Notice tone="info" icon="clock" title={`Completa ${current.missing}.`} body="La IA no lo tiene: escríbelo al editar este bloque." />
        ) : null}
        <div
          className={cn(
            "transition-[opacity,translate] duration-base",
            leaving ? "-translate-y-2 opacity-0 ease-exit" : "translate-y-0 opacity-100 ease-enter",
          )}
        >
          <ReviewCard
            key={current.id}
            field={current.label}
            section={current.section}
            required={current.required}
            angle={current.angle}
            note={current.note}
            limit={current.limit}
            unit={current.unit}
            faq={faq}
            original={current.original}
            originalLabel="Hoy en Shopify"
            proposal={current.text}
            proposalText={current.text}
            discardHint={discardHint(current)}
            edited={current.edited}
            index={currentIndex}
            total={items.length}
            state={cardState}
            keys={desktop}
            autoFocus
            rows={current.key === "how_it_works" || current.key === "shipping_payment" ? 6 : undefined}
            layout={current.original ? "side" : "stacked"}
            hideActions={!desktop && !editing}
            onAccept={() => decide(current, "approve")}
            onDiscard={() => decide(current, "reject")}
            onEdit={() => setEditing(true)}
            onCancelEdit={() => setEditing(false)}
            onSaveEdit={(text) => decide(current, "approve", text)}
          />
        </div>
      </div>
    );
    footer =
      desktop || editing ? null : (
        <StickyActions stack>
          <ReviewActions
            disabled={!!busy}
            onAccept={() => decide(current, "approve")}
            onDiscard={() => decide(current, "reject")}
            onEdit={() => setEditing(true)}
          />
        </StickyActions>
      );
  } else {
    const missingItem = items.find((i) => itemState(i) === "missing");
    body = (
      <div className="flex flex-col gap-3">
        {staleNotice}
        {runNotice}
        {missingItem ? (
          <Notice
            title={`Falta aprobar ${missingItem.label}.`}
            body="Es obligatorio: escribe tu versión para completar la etapa."
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelected(missingItem.id);
                  setEditing(true);
                }}
              >
                Escribir
              </Button>
            }
          />
        ) : null}
        <CopySummary sections={summarySections} />
      </div>
    );
    const nextLabel = desktop ? "Continuar: Imágenes" : "Imágenes";
    const next = progress.complete ? (
      <Button variant="primary" size="lg" iconEnd="chevron-right" href={imagesHref} className={actionClass}>
        {nextLabel}
      </Button>
    ) : (
      <Button variant="primary" size="lg" iconEnd="chevron-right" disabled className={actionClass}>
        {nextLabel}
      </Button>
    );
    footer = (
      <StickyActions
        variant="bar"
        summary={
          // En escritorio angosto no cabe junto a los dos botones.
          <span className="hidden @4xl:inline">{progress.complete ? "La página está lista. Sigue con las imágenes." : "Aprueba los obligatorios para continuar."}</span>
        }
        className="lg:px-8"
      >
        <Button size="lg" icon="sparkle" loading={busy === "redo"} disabled={!redoable || writing} onClick={() => write(true)} className={actionClass}>
          {desktop ? "Rehacer descartados" : "Rehacer"}
        </Button>
        {next}
      </StickyActions>
    );
  }

  const meter: MeterStage[] = items.map((i) => (i.id === current?.id ? "current" : pendingItem(i) ? "locked" : "done"));
  const reviewing = view === "review" || view === "done";

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
            {reviewing ? (
              <Button variant="ghost" size="sm" onClick={() => setOutlineOpen(true)} aria-label={`La página: ${counter}`}>
                {progress.approved}/{progress.total}
              </Button>
            ) : null}
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      {reviewing ? (
        <div className="px-4 pb-2 lg:hidden">
          <StageMeter stages={meter} />
        </div>
      ) : null}

      {/* La página como índice a la derecha solo si queda espacio para la tarjeta (≥ 896px de contenido); si no, se abre como hoja. */}
      <div className={cn("flex flex-1 flex-col", reviewing && "@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_--spacing(70)]")}>
        <div className="flex min-w-0 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
          <div className="hidden items-center gap-3 lg:flex lg:max-w-content">
            <p className="flex-1 text-body text-muted-foreground">
              {COPY_STAGE_TITLE} · {reviewing ? counter : subtitle}
            </p>
            {reviewing ? (
              <Button variant="ghost" size="sm" className="@4xl:hidden" onClick={() => setOutlineOpen(true)}>
                Ver la página
              </Button>
            ) : null}
            {view === "review" ? (
              <Button variant="ghost" icon="sparkle" loading={busy === "redo"} disabled={!redoable || writing} onClick={() => write(true)}>
                Rehacer descartados
              </Button>
            ) : null}
          </div>
          <div className="lg:max-w-content">{body}</div>
          {view !== "locked" ? <PageAccent productId={product.id} initial={data.accent} className="lg:max-w-content" /> : null}
          {error ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {reviewing ? (
          <aside aria-label="La página" className="hidden border-l bg-sidebar px-4 pt-6 pb-4 @4xl:block">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-heading">La página</h2>
              <span className="text-caption text-muted-foreground tabular-nums">
                {progress.approved}/{progress.total}
              </span>
            </div>
            <PageOutline groups={outlineGroups} onPick={pick} className="sticky top-6 mt-3" />
          </aside>
        ) : null}
      </div>

      {footer}

      {/* Móvil (el contador de la barra superior) y escritorio angosto («Ver la página»): la página completa como hoja. */}
      <Drawer open={outlineOpen} onOpenChange={setOutlineOpen} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
        <DrawerContent className="max-h-[85svh] lg:max-h-none">
          <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
            <DrawerTitle className="text-heading">La página</DrawerTitle>
            <span className="text-caption text-muted-foreground tabular-nums">{counter}</span>
          </div>
          <DrawerDescription className="sr-only">Los bloques de la página en su orden. Toca uno para revisarlo.</DrawerDescription>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]">
            <PageOutline groups={outlineGroups} onPick={pick} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
