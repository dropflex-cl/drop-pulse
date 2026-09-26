"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AngleGroup,
  Button,
  ChatConsent,
  ChatModule,
  ChatPreview,
  CreativeConcept,
  CreativePiece,
  CreativeSummary,
  EmptyState,
  Field,
  Icon,
  ImageProviderPicker as ProviderPicker,
  Notice,
  SegmentedControl,
  TopBar,
  linkClasses,
  notify,
  notifyUndo,
  type ChatModuleState,
  type ConceptText,
  type PieceAction,
  type PieceState,
  type ProviderOption,
} from "@/components/df";
import { AiCostButton, useLocalCost, useStepCost } from "@/components/shell/ai-cost-provider";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { CHAT_FAMILY, ROLE_LIMITS, conceptRatios, type Ratio } from "@/lib/creatives/catalog";
import { CHAT_MESSAGE_MAX, CONTACT_NAME_MAX, chatShapeProblem, type WhatsappChat } from "@/lib/creatives/chat";
import { latestPieces, needsRender } from "@/lib/creatives/pieces";
import { IMAGE_COST_BY_PROVIDER, IMAGE_PROVIDER_NAME, type ImageProvider, type ImageProviderChoice } from "@/lib/image-provider";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { CreativeAssetView, CreativeConceptView, CreativesState, ProductCreatives, RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CreativesSheet } from "./creatives-sheet";
import { VideosPanel } from "./creatives-videos";
import { useImageProviderPick } from "./image-provider-picker";

// Etapa Creativos (design-system/creativos.md, docs/spec-creativos.md §6.6). Pestaña Imágenes: la IA
// propone conceptos desde los ángulos aprobados; el comerciante los revisa gratis y paga solo las piezas
// que pide (cada botón que gasta dice cuánto). Un QA revisa producto y textos. Aprobar manda la pieza a
// Anuncios, con Deshacer. Por ángulo, además, un «Chat de WhatsApp» armado (lib/creatives/chat.ts).
// Móvil: lista → concepto → pieza, como subvistas con historial. Escritorio: la lista al centro y el
// concepto o la pieza elegida a la derecha (atajos A / D).

const POLL_MS = 3000;
const active = (s?: RunStatus) => s === "queued" || s === "running";
const rendering = (a: CreativeAssetView) => a.render === "queued" || a.render === "running";
const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const ROLE_LABEL: Record<string, string> = {
  headline: "Titular",
  subheadline: "Bajada",
  callout: "Callout",
  badge: "Sello",
  table_header: "Columna",
  table_row: "Fila",
  note: "Nota",
};

/** Tiempo por pieza de cada proveedor, para elegir (Gemini responde sin cola). */
const PROVIDER_ETA: Record<ImageProvider, string> = { higgsfield: "~40 s", gemini: "~20 s" };

const STATE_WORD: Record<PieceState, string> = {
  empty: "sin generar",
  locked: "sin generar",
  queued: "en cola",
  generating: "generando",
  review: "por revisar",
  approved: "aprobada",
  discarded: "descartada",
  failed: "falló",
};

export function pieceState(a: CreativeAssetView): PieceState {
  if (a.render === "queued") return "queued";
  if (a.render === "running") return "generating";
  if (a.render === "failed") return "failed";
  return a.status === "aprobado" ? "approved" : a.status === "rechazado" ? "discarded" : "review";
}

const ratioLabel = (c: CreativeConceptView, ratio: Ratio) => (c.family === CHAT_FAMILY ? "Captura 9:16" : ratio === "9:16" ? "Stories 9:16" : "Feed 1:1");
const mainRatio = (c: CreativeConceptView) => conceptRatios(c.family)[0];
/** La 9:16 de un concepto con 1:1 espera a que exista la 1:1. */
const storiesLocked = (c: CreativeConceptView, ratio: Ratio) => ratio === "9:16" && conceptRatios(c.family).length > 1 && !c.assets.some((a) => a.ratio === "1:1" && a.render === "succeeded");

type View = { kind: "list" } | { kind: "concept" | "edit" | "chat-edit"; id: string } | { kind: "piece"; id: string };
type Selection = { kind: "concept" | "piece"; id: string };
type Sheet = { kind: "replace" } | { kind: "provider" } | { kind: "chat"; angle: number } | null;

export function CreativesScreen({ data, initialTab = "images" }: { data: ProductCreatives; initialTab?: "images" | "videos" }) {
  const router = useRouter();
  const desktop = useDesktop();
  const localCost = useLocalCost();
  const proposeCost = useStepCost("creative_concepts");
  const chatCost = useStepCost("creative_chat");
  const { product } = data;
  const [state, setState] = useState<CreativesState>(data);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<"images" | "videos">(initialTab);
  const [view, setView] = useState<View>({ kind: "list" });
  const [picked, setPicked] = useState<Selection | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ack, setAck] = useState(false);
  // Escritorio: el concepto que se está editando en el panel derecho.
  const [deskEditing, setDeskEditing] = useState<string | null>(null);
  // Ángulos plegados por el comerciante; sin elegir, se pliegan los que no piden revisar (menos el primero).
  const [folded, setFolded] = useState<Record<number, boolean>>({});

  const { concepts, run } = state;
  const provider = state.imageProvider.value;
  const proposing = active(run?.status);
  const working = proposing || concepts.some((c) => c.assets.some(rendering));
  const costFor = useCallback((p: ImageProvider | null | undefined) => localCost(IMAGE_COST_BY_PROVIDER[p ?? "higgsfield"]), [localCost]);
  const assets = concepts.flatMap((c) => c.assets);
  const shown = concepts.flatMap((c) => latestPieces(c.assets));
  const approved = assets.filter((a) => a.status === "aprobado").length;
  const toReview = shown.filter((a) => pieceState(a) === "review").length;
  const missing = concepts.filter((c) => !c.assets.some((a) => a.ratio === mainRatio(c)));
  const adsHref = productHref(product.id, "anuncios");
  const setProvider = (imageProvider: ImageProviderChoice) => setState((s) => ({ ...s, imageProvider, imageCostUsd: IMAGE_COST_BY_PROVIDER[imageProvider.value ?? "higgsfield"] }));
  const { pick } = useImageProviderPick("creatives", state.imageProvider, setProvider);
  const providerOptions: ProviderOption[] = state.imageProvider.options.map((o) => ({ id: o.id, name: o.name, cost: costFor(o.id), eta: PROVIDER_ETA[o.id], connected: o.available, reason: o.reason }));

  const groups = ([1, 2, 3] as const).map((angle) => ({ angle, items: concepts.filter((c) => c.angle === angle) })).filter((g) => g.items.length);
  const place = (c: CreativeConceptView) => {
    const g = groups.find((x) => x.angle === c.angle);
    return { n: (g?.items.indexOf(c) ?? 0) + 1, of: g?.items.length ?? 1 };
  };
  const findConcept = (id: string) => concepts.find((c) => c.id === id);
  const findPiece = (id: string) => {
    for (const c of concepts) {
      const a = c.assets.find((x) => x.id === id);
      if (a) return { c, a };
    }
    return null;
  };

  // ---------------------------------------------------------------- Subvistas (móvil) con historial
  const go = useCallback((v: View) => {
    window.history.pushState({ ...window.history.state, creatives: v }, "");
    setView(v);
    window.scrollTo(0, 0);
  }, []);
  const back = () => window.history.back();
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setView((e.state as { creatives?: View } | null)?.creatives ?? { kind: "list" });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openPiece = (a: CreativeAssetView) => (desktop ? setPicked({ kind: "piece", id: a.id }) : go({ kind: "piece", id: a.id }));
  const openConcept = (c: CreativeConceptView) => (desktop ? setPicked({ kind: "concept", id: c.id }) : go({ kind: "concept", id: c.id }));

  // ---------------------------------------------------------------- Sondeo
  const wasProposing = useRef(proposing);
  useEffect(() => {
    if (wasProposing.current && !proposing) {
      router.refresh();
      if (run?.status === "succeeded") notify(`La IA propuso tus anuncios: ${plural(concepts.length, "concepto", "conceptos")}.`, { action: "Ver", onAction: () => window.scrollTo({ top: 0 }) });
      else if (run?.status === "failed") notify("No se pudieron proponer tus anuncios.", { action: "Reintentar", onAction: () => void propose() });
    }
    wasProposing.current = proposing;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el estado de la corrida
  }, [proposing, run, router]);

  const readyCount = assets.filter((a) => a.render === "succeeded").length;
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

  // ---------------------------------------------------------------- Acciones
  async function run_(key: string, fn: () => Promise<CreativesState>, fallback: string): Promise<CreativesState | null> {
    setBusy(key);
    setError(undefined);
    try {
      const next = await fn();
      setState(next);
      return next;
    } catch (e) {
      setError(errorText(e, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function propose() {
    setSheet(null);
    await run_("propose", () => productsApi.proposeCreatives(product.id), "No pudimos empezar. Intenta de nuevo.");
  }
  const render = (c: CreativeConceptView, ratio: Ratio, p?: ImageProvider) =>
    run_(`render-${c.id}-${ratio}`, () => productsApi.renderConcept(product.id, c.id, ratio, p), "No pudimos empezar a generar la imagen.");

  async function renderAll() {
    setBusy("all");
    setError(undefined);
    try {
      let last: CreativesState | null = null;
      for (const c of missing) last = await productsApi.renderConcept(product.id, c.id, mainRatio(c));
      if (last) setState(last);
      notify(`Generando ${plural(missing.length, "pieza", "piezas")}. Puedes salir: te avisamos.`);
    } catch (e) {
      setError(errorText(e, "No pudimos generar todas. Intenta de nuevo."));
    } finally {
      setBusy(null);
    }
  }

  async function createChat(angle: number) {
    const next = await run_(`chat-${angle}`, () => productsApi.createChat(product.id, angle), "No pudimos escribir el chat. Intenta de nuevo.");
    if (!next) return;
    setSheet(null);
    const chat = next.concepts.find((c) => c.angle === angle && c.family === CHAT_FAMILY);
    if (chat) openConcept(chat);
  }

  async function reopen(a: CreativeAssetView) {
    const next = await run_(`undo-${a.id}`, () => productsApi.decideCreative(product.id, a.id, "reopen"), "No pudimos deshacer.");
    if (next) router.refresh();
  }

  async function decide(a: CreativeAssetView, action: "approve" | "reject") {
    const next = await run_(`${action}-${a.id}`, () => productsApi.decideCreative(product.id, a.id, action), "No pudimos guardar tu decisión.");
    if (!next) return;
    router.refresh();
    notifyUndo(action === "approve" ? "Aprobada. Ya está en Anuncios." : "Descartada. El archivo se borra en 2 min.", () => void reopen(a));
  }

  function onPieceAction(c: CreativeConceptView, a: CreativeAssetView | null, ratio: Ratio, act: PieceAction) {
    if (!a) return void render(c, ratio);
    if (act === "review") return openPiece(a);
    if (act === "approve" || act === "discard") return void decide(a, act === "approve" ? "approve" : "reject");
    if (act === "undo") return void reopen(a);
    if (act === "recover") return void run_(`recover-${a.id}`, () => productsApi.decideCreative(product.id, a.id, "recover"), "No pudimos recuperar la imagen. Intenta de nuevo.");
    if (act === "retry") return void render(c, a.ratio, a.provider);
  }

  const pieceBusy = (c: CreativeConceptView, a: CreativeAssetView): PieceAction | null =>
    busy === `approve-${a.id}` ? "approve" : busy === `reject-${a.id}` ? "discard" : busy === `undo-${a.id}` ? "undo" : busy === `recover-${a.id}` ? "recover" : busy === `render-${c.id}-${a.ratio}` ? "retry" : null;

  // Escritorio: A aprueba y D descarta la pieza abierta a la derecha.
  const selection = desktop ? resolveSelection(picked, concepts, shown) : null;
  const selectedPiece = selection?.kind === "piece" ? findPiece(selection.id) : null;
  useEffect(() => {
    if (!desktop || !selectedPiece || pieceState(selectedPiece.a) !== "review" || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "a") void decide(selectedPiece.a, "approve");
      else if (k === "d") void decide(selectedPiece.a, "reject");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide cambia en cada render
  }, [desktop, selectedPiece?.a.id, selectedPiece?.a.status, busy]);

  // ---------------------------------------------------------------- Piezas de un concepto
  function pieceRows(c: CreativeConceptView, large = false) {
    const all = latestPieces(c.assets);
    return conceptRatios(c.family).flatMap((ratio) => {
      const mine = all.filter((a) => a.ratio === ratio);
      if (!mine.length) {
        const locked = storiesLocked(c, ratio);
        return [
          <CreativePiece
            key={ratio}
            ratio={ratio}
            label={ratioLabel(c, ratio)}
            state={locked ? "locked" : "empty"}
            large={large}
            cost={costFor(provider)}
            busy={busy === `render-${c.id}-${ratio}` ? "generate" : null}
            disabled={Boolean(busy) || !provider}
            onAction={() => onPieceAction(c, null, ratio, "generate")}
          />,
        ];
      }
      return mine.map((a) => (
        <CreativePiece
          key={a.id}
          ratio={a.ratio}
          label={ratioLabel(c, a.ratio)}
          state={pieceState(a)}
          provider={IMAGE_PROVIDER_NAME[a.provider]}
          src={a.src}
          cost={costFor(a.provider)}
          retry={a.attempt > 1}
          qa={a.qa?.issues}
          recoverable={a.recoverable}
          error={a.error}
          eta={a.render === "queued" ? a.error : undefined}
          busy={pieceBusy(c, a)}
          disabled={Boolean(busy)}
          large={large}
          onOpen={() => openPiece(a)}
          onAction={(act) => onPieceAction(c, a, a.ratio, act)}
        />
      ));
    });
  }

  /** La próxima pieza que se puede generar del concepto con el proveedor elegido. */
  function nextRender(c: CreativeConceptView): { ratio: Ratio; label: string } | null {
    const ratio = conceptRatios(c.family).find((r) => needsRender(c.assets, r, provider) && !storiesLocked(c, r) && !c.assets.some((a) => a.ratio === r && rendering(a)));
    if (!ratio || !provider) return null;
    const other = c.assets.some((a) => a.ratio === ratio);
    const what = c.family === CHAT_FAMILY ? "captura 9:16" : ratio === "9:16" ? "Stories 9:16" : "feed 1:1";
    return { ratio, label: `Generar ${what}${other ? ` con ${IMAGE_PROVIDER_NAME[provider]}` : ""} · ${costFor(provider)}` };
  }

  // ---------------------------------------------------------------- Vistas
  const needsKey = Boolean(state.locked) && state.connected === false && !state.locked!.startsWith("Aprueba");
  const anglesLocked = Boolean(state.locked) && !needsKey;
  const hasPieces = assets.length > 0;
  const subtitle = anglesLocked ? "Bloqueada" : proposing ? "La IA está trabajando" : approved ? plural(approved, "pieza aprobada", "piezas aprobadas") : "Opcional";

  const skip = (
    <p className="text-center text-label font-normal text-muted-foreground">
      Es opcional:{" "}
      <Link href={adsHref} className={linkClasses}>
        ir a Anuncios y subir creativos a mano
      </Link>
    </p>
  );
  const errorLine = error ? (
    <p role="alert" className="text-label font-normal text-destructive">
      {error}
    </p>
  ) : null;

  // Subvistas de móvil: reemplazan la pantalla entera.
  if (!desktop && tab === "images" && view.kind !== "list") {
    const sub = renderSubview();
    if (sub) return sub;
  }

  function renderSubview(): React.ReactNode {
    if (view.kind === "piece") {
      const found = findPiece(view.id);
      if (!found) return null;
      const { c, a } = found;
      const { n } = place(c);
      return (
        <div className="flex flex-col">
          <TopBar back={`Concepto ${n}`} onBack={back} title={ratioLabel(c, a.ratio)} subtitle={`${IMAGE_PROVIDER_NAME[a.provider]} · ${STATE_WORD[pieceState(a)]}`} className="sticky top-0 z-sticky" />
          <div className="flex flex-col gap-3 px-4 pt-1 pb-6">
            {pieceFull(c, a)}
            {errorLine}
            <div className="flex flex-col">{pieceRows(c).filter((r) => (r as React.ReactElement).key !== a.id)}</div>
          </div>
        </div>
      );
    }
    if (view.kind === "list") return null;
    const c = findConcept(view.id);
    if (!c) return null;
    const { n, of } = place(c);
    if (view.kind === "edit") {
      return (
        <div className="flex flex-col">
          <TopBar back={`Concepto ${n}`} onBack={back} title="Editar textos" subtitle="Van dentro de la imagen" className="sticky top-0 z-sticky" />
          <div className="px-4 pt-1 pb-4">
            <TextsEditor key={c.id} productId={product.id} concept={c} slot={n} onSaved={setState} onDone={back} onError={setError} />
            {errorLine}
          </div>
        </div>
      );
    }
    if (view.kind === "chat-edit" && c.chat) {
      return (
        <div className="flex flex-col">
          <TopBar back="Chat de WhatsApp" onBack={back} title="Editar chat" className="sticky top-0 z-sticky" />
          <div className="px-4 pt-1 pb-4">
            <ChatEditor key={c.id} productId={product.id} concept={c} chat={c.chat} onSaved={setState} onDone={back} onError={setError} />
            {errorLine}
          </div>
        </div>
      );
    }
    const chat = c.family === CHAT_FAMILY;
    const next = nextRender(c);
    return (
      <div className="flex flex-col">
        <TopBar
          back="Creativos"
          onBack={back}
          title={chat ? "Chat de WhatsApp" : `Concepto ${n}`}
          subtitle={chat ? `Ángulo ${c.angle} · conversación armada` : `Ángulo ${c.angle} · ${n} de ${of}`}
          actions={<AssistantButton scope="Creativos" />}
          className="sticky top-0 z-sticky"
        />
        <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
          {conceptDetail(c, n, () => go({ kind: chat ? "chat-edit" : "edit", id: c.id }))}
          {errorLine}
        </div>
        {next ? (
          <StickyActions stack mobileNote={chat ? "Solo 9:16. Después se aprueba o descarta como cualquier pieza." : undefined}>
            <Button variant="primary" size="lg" block icon="sparkle" loading={busy === `render-${c.id}-${next.ratio}`} disabled={Boolean(busy)} onClick={() => render(c, next.ratio)}>
              {next.label}
            </Button>
          </StickyActions>
        ) : null}
      </div>
    );
  }

  /** El concepto completo: por qué, cómo se verá, los textos (o el chat) y sus piezas. */
  function conceptDetail(c: CreativeConceptView, slot: number, onEdit: () => void) {
    const chat = c.family === CHAT_FAMILY && c.chat;
    const inProgress = c.assets.some(rendering);
    return (
      <CreativeConcept
        slot={chat ? undefined : slot}
        title={c.name}
        family={c.familyName}
        style={chat ? "Captura 9:16" : c.preset?.name}
        styleKind={chat ? "plain" : c.preset ? "preset" : "direct"}
        why={c.why}
        look={c.look}
        texts={c.texts.map((t) => ({ role: ROLE_LABEL[t.role] ?? t.role, value: t.text, limit: ROLE_LIMITS[t.role] }))}
        locked={inProgress}
        onEdit={onEdit}
        body={
          chat ? (
            <div className="flex flex-col gap-2.5">
              <ChatPreview contact={chat.contact_name} messages={chat.messages.map((m) => ({ me: m.from === "me", text: m.text, time: m.time, photo: m.photo }))} image={product.image} />
              <div className="flex flex-wrap items-center gap-2">
                <Button icon="edit" disabled={inProgress} onClick={onEdit}>
                  Editar
                </Button>
                <Button icon="refresh" loading={busy === `chat-${c.angle}`} disabled={Boolean(busy) || inProgress} onClick={() => createChat(c.angle)}>
                  {chatCost ? `Otro chat · ${chatCost}` : "Otro chat"}
                </Button>
              </div>
              {inProgress ? <p className="text-caption text-muted-foreground">No se puede editar mientras se genera la captura.</p> : null}
            </div>
          ) : undefined
        }
        pieces={pieceRows(c)}
      />
    );
  }

  /** Una pieza en grande, con su QA y las acciones; y generar la misma con el otro proveedor. */
  function pieceFull(c: CreativeConceptView, a: CreativeAssetView) {
    const others = rendering(a) ? [] : state.imageProvider.options.filter((o) => o.available && o.id !== a.provider && needsRender(c.assets, a.ratio, o.id));
    return (
      <CreativePiece
        variant="full"
        ratio={a.ratio}
        label={ratioLabel(c, a.ratio)}
        state={pieceState(a)}
        provider={IMAGE_PROVIDER_NAME[a.provider]}
        src={a.src}
        cost={costFor(a.provider)}
        retry={a.attempt > 1}
        qa={a.qa?.issues}
        recoverable={a.recoverable}
        error={a.error}
        eta={a.render === "queued" ? a.error : undefined}
        busy={pieceBusy(c, a)}
        disabled={Boolean(busy)}
        onAction={(act) => onPieceAction(c, a, a.ratio, act)}
        extra={others.map((o) => (
          <Button key={o.id} variant="ghost" icon="refresh" loading={busy === `render-${c.id}-${a.ratio}`} disabled={Boolean(busy)} onClick={() => render(c, a.ratio, o.id)}>
            {`Generar con ${o.name} · ${costFor(o.id)}`}
          </Button>
        ))}
      />
    );
  }

  // ---------------------------------------------------------------- Contenido de la pestaña Imágenes
  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  // «Es opcional: ir a Anuncios…» abajo solo en móvil; en escritorio va en la barra de arriba.
  let footerMobileOnly = false;
  let aside: React.ReactNode = null;

  if (anglesLocked) {
    body = (
      <EmptyState
        icon="lock"
        title="Primero, los ángulos"
        body={`${state.locked} Los anuncios se arman desde tus ángulos aprobados.`}
        action={
          <Button variant="primary" iconEnd="chevron-right" href={productHref(product.id, "angulos")}>
            Ir a Ángulos
          </Button>
        }
      />
    );
    footer = <StickyActions>{skip}</StickyActions>;
    footerMobileOnly = true;
  } else if (needsKey) {
    body = (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon="image"
          title="Conecta un proveedor de imágenes"
          body="Higgsfield o Gemini. Se conecta una vez en Ajustes y sirve para todos tus productos."
          action={
            <Button variant="primary" icon="settings" href="/settings#creativos">
              Ir a Ajustes
            </Button>
          }
        />
        <p className="text-center text-caption text-muted-foreground">En la pestaña Videos verás «Conecta Higgsfield»: los videos solo usan Higgsfield.</p>
      </div>
    );
    footer = <StickyActions>{skip}</StickyActions>;
    footerMobileOnly = true;
  } else if (proposing && !concepts.length) {
    body = (
      <EmptyState
        icon="sparkle"
        busy
        title="La IA está proponiendo tus anuncios"
        body="Tarda ~1 min. Puedes salir de esta pantalla; te avisamos cuando termine."
        secondary={<Button href={`/products/${product.id}`}>Volver al producto</Button>}
      />
    );
    footer = <StickyActions>{skip}</StickyActions>;
    footerMobileOnly = true;
  } else if (!concepts.length && run?.status === "failed") {
    body = (
      <EmptyState
        icon="alert"
        tone="error"
        title="No se pudo proponer"
        body={run.error ?? "La IA no terminó la propuesta. Tus ángulos y la foto base siguen igual."}
        action={
          <Button variant="primary" icon="undo" loading={busy === "propose"} onClick={propose}>
            {proposeCost ? `Reintentar · ${proposeCost}` : "Reintentar"}
          </Button>
        }
      />
    );
    footer = <StickyActions>{skip}</StickyActions>;
    footerMobileOnly = true;
  } else if (!concepts.length) {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-heading">Anuncios estáticos</h2>
          <p className="mt-1 text-body text-muted-foreground">Claude lee tus ángulos y la foto base y propone unos 6 conceptos. Revisas cada uno antes de pagar su imagen.</p>
        </div>
        <div className="flex items-center gap-3 rounded-md border p-2">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
            <img src={product.image} alt="" className="size-12 rounded-sm bg-muted object-cover" />
          ) : (
            <span className="size-12 rounded-sm bg-muted" />
          )}
          <div className="flex min-w-0 flex-1 flex-col text-label font-normal text-muted-foreground">
            <b className="text-small font-semibold text-foreground">Foto base</b>
            Toda imagen parte de esta foto
          </div>
          <Link href={productHref(product.id, "importado")} className={linkClasses}>
            Cambiar
          </Link>
        </div>
        <ProviderPicker value={provider} providers={providerOptions} onChange={pick} />
      </div>
    );
    footer = (
      <StickyActions stack mobileNote="Tarda ~1 min. Puedes salir de la pantalla: te avisamos.">
        <Button variant="primary" size="lg" block={!desktop} icon="sparkle" loading={busy === "propose"} onClick={propose}>
          {proposeCost ? `Proponer anuncios · ${proposeCost}` : "Proponer anuncios"}
        </Button>
      </StickyActions>
    );
  } else {
    const kept = assets.filter((a) => a.kept).length;
    body = (
      <div className="flex flex-col gap-4">
        <CreativeSummary
          counts={{ review: toReview, pending: missing.length, approved }}
          onProposeOther={() => setSheet({ kind: "replace" })}
          proposeDisabled={proposing || Boolean(busy)}
          className="lg:max-w-130"
        />
        {run?.status === "failed" ? <Notice tone="warning" icon="alert" title="No pudimos proponer otros anuncios." body={run.error ?? "Reintenta desde el menú ⋯ › Proponer otros conceptos."} /> : null}
        {proposing ? <Notice tone="info" icon="sparkle" title="La IA está proponiendo otros anuncios." body="Cuando termine, reemplazan a estos. Lo aprobado sigue en Anuncios mientras tanto." /> : null}
        {errorLine}
        {groups.map((g, gi) => {
          const images = g.items.filter((c) => c.family !== CHAT_FAMILY);
          const chat = g.items.find((c) => c.family === CHAT_FAMILY);
          const counts = angleCounts(g.items);
          const isFolded = folded[g.angle] ?? (gi > 0 && !counts.review);
          // Por revisar → sin generar → aprobados; el número del concepto se mantiene.
          const ranked = images.map((c, i) => ({ c, slot: i + 1, emphasis: conceptEmphasis(c) })).sort((a, b) => RANK[a.emphasis] - RANK[b.emphasis]);
          const concept = ({ c, slot, emphasis }: (typeof ranked)[number]) => (
            <CreativeConcept
              key={c.id}
              compact
              slot={slot}
              title={c.name}
              family={c.familyName}
              style={c.preset?.name}
              styleKind={c.preset ? "preset" : "direct"}
              emphasis={emphasis}
              thumbs={emphasis === "done" ? latestPieces(c.assets).map((a) => ({ src: a.src, ratio: a.ratio })) : undefined}
              onOpen={() => openConcept(c)}
              selected={selection?.kind === "concept" && selection.id === c.id}
              pieces={pieceRows(c, emphasis === "review")}
            />
          );
          const open = ranked.filter((x) => x.emphasis !== "done");
          const done = ranked.filter((x) => x.emphasis === "done");
          return (
            <AngleGroup
              key={g.angle}
              slot={g.angle}
              name={g.items[0].angleName}
              counts={counts}
              first={gi === 0}
              collapsed={isFolded}
              onToggle={groups.length > 1 ? () => setFolded((f) => ({ ...f, [g.angle]: !isFolded })) : undefined}
              chat={
                <ChatModule
                  state={chatState(chat)}
                  disabled={proposing || Boolean(busy)}
                  onAction={() => {
                    if (chat) return openConcept(chat);
                    setAck(false);
                    setSheet({ kind: "chat", angle: g.angle });
                  }}
                />
              }
            >
              {open.length ? <div className="grid gap-2.5 @2xl:grid-cols-2">{open.map(concept)}</div> : null}
              {done.map(concept)}
            </AngleGroup>
          );
        })}
        <CreativesSheet
          open={sheet?.kind === "replace"}
          onClose={() => setSheet(null)}
          title="¿Proponer otros conceptos?"
          actions={
            <>
              <Button size="lg" onClick={() => setSheet(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" size="lg" loading={busy === "propose"} onClick={propose}>
                Proponer otros
              </Button>
            </>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-body">
            <ReplaceItem icon="undo">{`${concepts.length === 1 ? "El concepto se cambia" : `Los ${concepts.length} conceptos se cambian`} por nuevos.`}</ReplaceItem>
            <ReplaceItem icon="check">Mientras la IA trabaja, lo aprobado sigue en Anuncios.</ReplaceItem>
            <ReplaceItem icon="alert" warn>
              Al terminar se borran las piezas de los conceptos reemplazados
              {approved ? (
                <>
                  , <b>{approved === 1 ? "también la aprobada" : `también las ${approved} aprobadas`}</b>
                </>
              ) : null}
              .
            </ReplaceItem>
            {kept ? <ReplaceItem icon="shield">{`Se ${kept === 1 ? "conserva 1 que ya está en Meta o la usa" : `conservan ${kept} que ya están en Meta o las usa`} un anuncio.`}</ReplaceItem> : null}
          </ul>
          <p className="text-caption text-muted-foreground">{`Tarda ~1 min${proposeCost ? ` · ${proposeCost}` : ""}`}</p>
        </CreativesSheet>
      </div>
    );

    const canContinue = approved > 0;
    const providerLine = <ProviderPicker inline value={provider} providers={providerOptions} onChangeRequest={() => setSheet({ kind: "provider" })} className="lg:justify-start" />;
    footer = (
      <StickyActions variant="bar" stack summary={providerLine} mobileNote={!canContinue ? "Aprueba al menos una pieza para continuar a Anuncios." : undefined} className="lg:px-7">
        {/* Móvil: el proveedor va sobre el botón de generar, donde afecta el costo. En escritorio, a la izquierda de la barra. */}
        <div className="lg:hidden">{providerLine}</div>
        {missing.length ? (
          <Button variant="primary" size="lg" icon="sparkle" loading={busy === "all"} disabled={Boolean(busy) || !provider} onClick={renderAll}>
            {`Generar ${missing.length} · ${localCost(missing.length * IMAGE_COST_BY_PROVIDER[provider ?? "higgsfield"])}`}
          </Button>
        ) : null}
        {/* En escritorio, Continuar a Anuncios va en la barra de arriba. */}
        {canContinue ? (
          <Button size="lg" variant={missing.length ? "secondary" : "primary"} iconEnd="chevron-right" href={adsHref} className="lg:hidden">
            Continuar a Anuncios
          </Button>
        ) : (
          <Button size="lg" variant={missing.length ? "secondary" : "primary"} iconEnd="chevron-right" disabled className="lg:hidden">
            Continuar a Anuncios
          </Button>
        )}
      </StickyActions>
    );

    if (desktop && selection) aside = selectionPanel(selection);
  }

  function selectionPanel(selection: Selection): React.ReactNode {
    if (selection.kind === "piece") {
      const found = findPiece(selection.id);
      if (!found) return null;
      const { c, a } = found;
      const { n } = place(c);
      return (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-heading">{`${c.family === CHAT_FAMILY ? "Chat" : `Concepto ${n}`} · ${ratioLabel(c, a.ratio)}`}</h2>
            {pieceState(a) === "review" ? <span className="text-caption text-muted-foreground">A · D</span> : null}
          </div>
          {pieceFull(c, a)}
          <button type="button" onClick={() => setPicked({ kind: "concept", id: c.id })} className={cn(linkClasses, "self-start")}>
            Ver el concepto
          </button>
        </>
      );
    }
    const c = findConcept(selection.id);
    if (!c) return null;
    const { n } = place(c);
    const chat = c.family === CHAT_FAMILY;
    const editing = deskEditing === c.id;
    const setEditing = (on: boolean) => setDeskEditing(on ? c.id : null);
    const next = nextRender(c);
    return (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-heading">{chat ? "Chat de WhatsApp" : `Concepto ${n}`}</h2>
          <span className="text-caption text-muted-foreground">{`Ángulo ${c.angle}${chat ? " · conversación armada" : ""}`}</span>
        </div>
        {editing && !chat ? (
          <TextsEditor key={c.id} productId={product.id} concept={c} slot={n} onSaved={setState} onDone={() => setEditing(false)} onError={setError} />
        ) : editing && c.chat ? (
          <ChatEditor key={c.id} productId={product.id} concept={c} chat={c.chat} onSaved={setState} onDone={() => setEditing(false)} onError={setError} />
        ) : (
          <>
            {conceptDetail(c, n, () => setEditing(true))}
            {next ? (
              <Button variant="primary" block icon="sparkle" loading={busy === `render-${c.id}-${next.ratio}`} disabled={Boolean(busy)} onClick={() => render(c, next.ratio)}>
                {next.label}
              </Button>
            ) : null}
          </>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- Marco
  const tabs = (
    <SegmentedControl
      label="Tipo de creativo"
      block
      value={tab}
      onChange={(v) => setTab(v as "images" | "videos")}
      options={[
        { value: "images", label: "Imágenes" },
        { value: "videos", label: "Videos" },
      ]}
    />
  );
  const showTabs = !anglesLocked;

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Creativos" stageKey="creativos" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title="Creativos"
        subtitle={subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton scope="Creativos" />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      {/* Escritorio: la pestaña y Continuar a Anuncios (el producto, el costo y el asistente van en el encabezado del producto). */}
      <div className="hidden items-center gap-4 border-b px-7 py-3 lg:flex">
        <p className="min-w-0 flex-1 text-body text-muted-foreground">{`Creativos · ${subtitle.toLowerCase()}`}</p>
        {showTabs ? <div className="w-60">{tabs}</div> : null}
        {tab === "images" && hasPieces ? (
          <div className="flex items-center gap-2">
            {!approved ? <span className="text-caption text-muted-foreground">Aprueba al menos una pieza</span> : null}
            {approved ? (
              <Button iconEnd="chevron-right" href={adsHref}>
                Continuar a Anuncios
              </Button>
            ) : (
              <Button iconEnd="chevron-right" disabled>
                Continuar a Anuncios
              </Button>
            )}
          </div>
        ) : tab === "images" ? (
          skip
        ) : null}
      </div>
      {showTabs ? <div className="px-4 pb-2 lg:hidden">{tabs}</div> : null}

      {tab === "videos" ? (
        <VideosPanel productId={product.id} initial={data.videos} desktop={desktop} />
      ) : (
        <div className={cn("flex flex-1 flex-col", aside && "lg:grid lg:grid-cols-[minmax(0,1fr)_--spacing(100)]")}>
          <div className="@container flex min-w-0 flex-1 flex-col">
            <div className={cn("flex flex-1 flex-col px-4 pt-2 pb-4 lg:px-7 lg:pt-4", !concepts.length && "justify-center lg:mx-auto lg:w-full lg:max-w-content lg:justify-start lg:pt-8")}>
              {body}
              {!concepts.length ? errorLine : null}
            </div>
            {footerMobileOnly ? <div className="lg:hidden">{footer}</div> : footer}
          </div>
          {aside ? (
            <aside aria-label="Pieza elegida" className="sticky top-0 hidden max-h-svh flex-col gap-3 self-start overflow-auto border-l bg-sidebar px-6 py-4 lg:flex">
              {aside}
            </aside>
          ) : null}
        </div>
      )}

      <CreativesSheet open={sheet?.kind === "provider"} onClose={() => setSheet(null)} title="Proveedor de imagen">
        <ProviderPicker
          value={provider}
          providers={providerOptions}
          onChange={(v) => {
            void pick(v);
            setSheet(null);
          }}
        />
      </CreativesSheet>
      <CreativesSheet open={sheet?.kind === "chat"} onClose={() => setSheet(null)} title={`Chat de WhatsApp · Ángulo ${sheet?.kind === "chat" ? sheet.angle : ""}`}>
        <ChatConsent checked={ack} onCheckedChange={setAck} cost={chatCost ?? undefined} loading={sheet?.kind === "chat" && busy === `chat-${sheet.angle}`} onCreate={() => sheet?.kind === "chat" && createChat(sheet.angle)} />
        {errorLine}
      </CreativesSheet>
    </div>
  );
}

/** El peso de un concepto en la lista (design-system/creativos.md › Jerarquía visual). */
type Emphasis = "review" | "normal" | "done";
const RANK: Record<Emphasis, number> = { review: 0, normal: 1, done: 2 };

function conceptEmphasis(c: CreativeConceptView): Emphasis {
  const shown = latestPieces(c.assets);
  if (shown.some((a) => pieceState(a) === "review")) return "review";
  const complete = conceptRatios(c.family).every((r) => shown.some((a) => a.ratio === r));
  return complete && shown.every((a) => pieceState(a) === "approved") ? "done" : "normal";
}

/** Lo que pide cada ángulo: piezas por revisar, conceptos sin su pieza principal y piezas aprobadas. */
function angleCounts(items: CreativeConceptView[]) {
  const shown = items.flatMap((c) => latestPieces(c.assets));
  return {
    review: shown.filter((a) => pieceState(a) === "review").length,
    pending: items.filter((c) => !c.assets.some((a) => a.ratio === mainRatio(c))).length,
    approved: items.flatMap((c) => c.assets).filter((a) => a.status === "aprobado").length,
  };
}

function chatState(chat: CreativeConceptView | undefined): ChatModuleState {
  if (!chat) return "new";
  const shown = latestPieces(chat.assets);
  if (shown.some(rendering)) return "working";
  if (shown.some((a) => pieceState(a) === "review")) return "review";
  if (shown.some((a) => pieceState(a) === "approved")) return "approved";
  return "created";
}

/** Qué se abre a la derecha en escritorio: lo elegido si sigue vigente; si no, la primera por revisar o el primer concepto. */
function resolveSelection(picked: Selection | null, concepts: CreativeConceptView[], shown: CreativeAssetView[]): Selection | null {
  if (picked?.kind === "concept" && concepts.some((c) => c.id === picked.id)) return picked;
  if (picked?.kind === "piece" && concepts.some((c) => c.assets.some((a) => a.id === picked.id))) return picked;
  const review = shown.find((a) => pieceState(a) === "review");
  if (review) return { kind: "piece", id: review.id };
  return concepts[0] ? { kind: "concept", id: concepts[0].id } : null;
}

/** Una línea de «Proponer otros» (.df-replace): qué se reemplaza, qué sigue y qué se borra. */
function ReplaceItem({ icon, warn, children }: { icon: "undo" | "check" | "alert" | "shield"; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Icon name={icon} size="sm" className={cn("mt-0.75", warn ? "text-warning" : "text-muted-foreground")} />
      <span>{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------- Edición

/** Editar los textos que van dentro de la imagen, con su límite por rol. */
function TextsEditor({
  productId,
  concept: c,
  slot,
  onSaved,
  onDone,
  onError,
}: {
  productId: string;
  concept: CreativeConceptView;
  slot: number;
  onSaved: (s: CreativesState) => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [texts, setTexts] = useState(c.texts);
  const [saving, setSaving] = useState(false);
  const view: ConceptText[] = texts.map((t) => ({ role: ROLE_LABEL[t.role] ?? t.role, value: t.text, limit: ROLE_LIMITS[t.role] }));
  const over = view.some((t) => t.limit != null && t.value.length > t.limit);
  const changed = texts.some((t, i) => t.text !== c.texts[i]?.text);

  async function save() {
    setSaving(true);
    try {
      onSaved(await productsApi.editConcept(productId, c.id, texts));
      notify("Textos guardados");
      onDone();
    } catch (e) {
      onError(errorText(e, "No pudimos guardar los textos."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CreativeConcept
        slot={slot}
        title={c.name}
        family={c.familyName}
        style={c.preset?.name}
        styleKind={c.preset ? "preset" : "direct"}
        why={c.why}
        look={c.look}
        texts={view}
        editing
        onTextChange={(i, v) => setTexts((l) => l.map((x, j) => (j === i ? { ...x, text: v } : x)))}
      />
      <StickyActions className="lg:mt-3">
        <Button size="lg" disabled={saving} onClick={onDone}>
          Cancelar
        </Button>
        <Button variant="primary" size="lg" loading={saving} disabled={over || !changed} onClick={save}>
          Guardar
        </Button>
      </StickyActions>
    </>
  );
}

/** Editar el contacto y cada mensaje del chat (el de la foto es su pie). */
function ChatEditor({
  productId,
  concept: c,
  chat,
  onSaved,
  onDone,
  onError,
}: {
  productId: string;
  concept: CreativeConceptView;
  chat: WhatsappChat;
  onSaved: (s: CreativesState) => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [draft, setDraft] = useState(chat);
  const [saving, setSaving] = useState(false);
  const problem = chatShapeProblem(draft);
  const area = "w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-body text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft";

  async function save() {
    setSaving(true);
    try {
      onSaved(await productsApi.editChat(productId, c.id, { contact_name: draft.contact_name, messages: draft.messages.map((m) => ({ text: m.text })) }));
      notify("Chat guardado");
      onDone();
    } catch (e) {
      onError(errorText(e, "No pudimos guardar el chat."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Nombre del contacto"
        value={draft.contact_name}
        maxLength={CONTACT_NAME_MAX}
        hint={`${draft.contact_name.length} de ${CONTACT_NAME_MAX} caracteres`}
        onValueChange={(v) => setDraft((d) => ({ ...d, contact_name: v }))}
      />
      {draft.messages.map((m, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <label htmlFor={`chat-m${i}`} className="text-label">
            {`${m.from === "me" ? "Lector" : draft.contact_name || "Contacto"} · ${m.time}${m.photo ? " · pie de la foto" : ""}`}
          </label>
          <textarea
            id={`chat-m${i}`}
            rows={2}
            value={m.text}
            maxLength={CHAT_MESSAGE_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, messages: d.messages.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))}
            className={area}
          />
          <span className="text-caption text-muted-foreground tabular-nums">{`${m.text.length} de ${CHAT_MESSAGE_MAX} caracteres`}</span>
        </div>
      ))}
      {problem ? (
        <p role="alert" className="text-label font-normal text-destructive">
          {problem}
        </p>
      ) : null}
      <StickyActions>
        <Button size="lg" disabled={saving} onClick={onDone}>
          Cancelar
        </Button>
        <Button variant="primary" size="lg" loading={saving} disabled={Boolean(problem)} onClick={save}>
          Guardar
        </Button>
      </StickyActions>
    </div>
  );
}
