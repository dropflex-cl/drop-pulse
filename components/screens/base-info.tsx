"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_TYPES,
  Button,
  GenerationProgress,
  Icon,
  ImageUploader,
  ProductInfoInput,
  ReferenceAddTile,
  ReferenceImage,
  StageMeter,
  TopBar,
  notify,
  notifyUndo,
  type UploadItem,
  type UploaderMode,
} from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import type { CustomerAvatar } from "@/lib/ai/schemas";
import { count } from "@/lib/format";
import { pickBase } from "@/lib/products/base";
import { ProductApiClientError, productsApi, uploadImage } from "@/lib/products/client";
import { detectTopics } from "@/lib/products/topics";
import { productHref } from "@/lib/routes";
import type { AvatarProposal, OptimizationRun, ProductBase, ReferenceImage as RefImage, SavedPricingDto } from "@/lib/types";
import { AvatarProposalCard } from "./avatar-proposal";
import { CompetitorsSection } from "./competitors-section";
import { DifferentiatorSection } from "./differentiator-section";
import { PricingSection } from "./pricing-section";

const AUTOSAVE_MS = 1500;
const POLL_MS = 2500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NOTE = "Define a tu cliente ideal en 1 o 2 minutos. Nada se publica sin tu OK.";

interface Upload extends UploadItem {
  file: File;
  cancel?: () => void;
}

const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

function savedLabel(at: number | undefined, now: number): string {
  if (!at) return "Guardado";
  const s = Math.max(1, Math.round((now - at) / 1000));
  if (s < 60) return `Guardado hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `Guardado hace ${m} min` : "Guardado";
}

/** Autoguardado a los 1,5 s sin escribir; `save` guarda ya (antes de optimizar). */
function useAutosave(productId: string, initial: string, initialSavedAt?: string) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [savedAt, setSavedAt] = useState(initialSavedAt ? Date.parse(initialSavedAt) : undefined);
  const [topics, setTopics] = useState<string[]>(() => detectTopics(initial));
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    const value = pending.current;
    if (value === null) return true;
    pending.current = null;
    setSaving(true);
    try {
      const res = await productsApi.saveBaseInfo(productId, value);
      setSavedAt(Date.parse(res.savedAt));
      setTopics(res.topics);
      setError(undefined);
      return true;
    } catch (e) {
      pending.current ??= value;
      setError(errorText(e, "No pudimos guardar. Revisa tu conexión; lo intentamos de nuevo al escribir."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [productId]);

  const change = (value: string) => {
    setText(value);
    setTopics(detectTopics(value));
    pending.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, AUTOSAVE_MS);
  };

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    // Si se cierra la pestaña con cambios, se intenta guardar igual.
    const beforeUnload = () => {
      if (pending.current !== null) {
        navigator.sendBeacon?.(`/api/products/${productId}/base-info`, new Blob([JSON.stringify({ text: pending.current })], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [productId]);

  return { text, change, save, saving, error, topics, saved: savedLabel(savedAt, now) };
}

/** “Optimizando”: los dos pasos de la corrida, con el mismo avance que el onboarding. */
function OptimizingCard({ run, image, name }: { run: OptimizationRun; image?: string; name: string }) {
  const onAvatar = run.step === "customer_avatar";
  return (
    <section aria-label="Optimización en curso" className="rounded-lg border bg-card p-4">
      <GenerationProgress
        title="La IA está trabajando"
        progressLabel={`${onAvatar ? 1 : 0} de 2 pasos listos`}
        items={[
          { name: "Ficha del producto", image, status: onAvatar ? "generado" : "publicando", detail: onAvatar ? "Lista" : "Ordenando tu información e imágenes" },
          { name: `Cliente ideal de ${name}`, image, status: onAvatar ? "publicando" : "cola", detail: onAvatar ? "Definiendo quién compra y por qué" : "Empieza al terminar la ficha" },
        ]}
      />
    </section>
  );
}

export function BaseInfoScreen({ base }: { base: ProductBase }) {
  const router = useRouter();
  const desktop = useDesktop();
  const { product } = base;
  const info = useAutosave(product.id, base.baseInfo, base.baseInfoUpdatedAt);

  const [images, setImages] = useState<RefImage[]>(base.images);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<UploaderMode>("file");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const [fetching, setFetching] = useState(false);

  const [pricing, setPricing] = useState<SavedPricingDto | undefined>(base.pricing);
  const [run, setRun] = useState<OptimizationRun | undefined>(base.run);
  const [avatar, setAvatar] = useState<AvatarProposal | undefined>(base.avatar);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const running = run?.status === "queued" || run?.status === "running";
  const failed = run?.status === "failed" && !(avatar && avatar.createdAt >= run.createdAt);
  const inUse = images.filter((i) => !i.excluded).length;
  const baseId = pickBase(images, (i) => i)?.id;
  const approved = avatar?.status === "aprobado";

  // ---------------------------------------------------------------- Sondeo de la corrida
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(async () => {
      try {
        const s = await productsApi.status(product.id);
        if (s.run) setRun(s.run);
        if (s.avatar) setAvatar(s.avatar);
        if (s.run && s.run.status !== "queued" && s.run.status !== "running") {
          // La ruta, el encabezado y Hoy se leen en el servidor.
          router.refresh();
          if (s.run.status === "succeeded") notify("Tu cliente ideal está listo para revisar");
        }
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [running, product.id, router]);

  // ---------------------------------------------------------------- Imágenes
  const startUpload = useCallback(
    (u: Upload) => {
      if (!ACCEPTED_TYPES.includes(u.file.type)) {
        setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, state: "error", detail: "Solo imágenes JPG, PNG o WEBP" } : x)));
        return;
      }
      if (u.file.size > MAX_FILE_BYTES) {
        setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, state: "error", detail: "Pesa más de 10 MB" } : x)));
        return;
      }
      const job = uploadImage(product.id, u.file, (p) => setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, progress: p } : x))));
      setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, state: "uploading", progress: 0, cancel: job.cancel } : x)));
      job.done
        .then((image) => {
          setImages((list) => [...list, image]);
          const mb = (u.file.size / 1024 / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 });
          setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, state: "done", detail: `${mb} MB · lista`, cancel: undefined } : x)));
        })
        .catch((e) => {
          if (e instanceof ProductApiClientError && e.field === "abort") {
            setUploads((l) => l.filter((x) => x.id !== u.id));
            return;
          }
          setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, state: "error", detail: errorText(e, "No se pudo subir"), cancel: undefined } : x)));
        });
    },
    [product.id],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const fresh = files.map((file) => ({ id: crypto.randomUUID(), name: file.name || "imagen", state: "uploading" as const, progress: 0, file }));
      setUploads((l) => [...l, ...fresh]);
      fresh.forEach(startUpload);
    },
    [startUpload],
  );

  // Pegar una imagen con Ctrl/Cmd+V en la página también la sube.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
      notify(files.length === 1 ? "Subiendo la imagen pegada" : `Subiendo ${files.length} imágenes pegadas`);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const fetchUrl = async () => {
    setFetching(true);
    setUrlError(undefined);
    try {
      const { image } = await productsApi.imageFromUrl(product.id, url);
      setImages((list) => [...list, image]);
      setUrl("");
      notify("Imagen agregada");
    } catch (e) {
      setUrlError(errorText(e, "No pudimos traer la imagen. Intenta de nuevo."));
    } finally {
      setFetching(false);
    }
  };

  const toggle = async (img: RefImage) => {
    const excluded = !img.excluded;
    if (excluded && img.id === baseId) {
      notify("Es la imagen base. Toca otra para elegirla como base antes de dejar de usar esta.");
      return;
    }
    setImages((list) => list.map((i) => (i.id === img.id ? { ...i, excluded } : i)));
    try {
      await productsApi.setExcluded(product.id, img.id, excluded);
    } catch (e) {
      setImages((list) => list.map((i) => (i.id === img.id ? { ...i, excluded: !excluded } : i)));
      notify(errorText(e, "No pudimos guardar el cambio. Intenta de nuevo."));
    }
  };

  const chooseBase = async (img: RefImage) => {
    if (img.id === baseId && img.base) return;
    const before = images;
    setImages((list) => list.map((i) => ({ ...i, base: i.id === img.id, excluded: i.id === img.id ? false : i.excluded })));
    try {
      await productsApi.setBase(product.id, img.id);
      notify("Imagen base elegida. La IA partirá de ella en todo lo que genere.");
    } catch (e) {
      setImages(before);
      notify(errorText(e, "No pudimos elegir la imagen base. Intenta de nuevo."));
    }
  };

  // ---------------------------------------------------------------- Optimizar y decidir
  const optimize = async () => {
    setStarting(true);
    setStartError(undefined);
    try {
      await info.save();
      const { run: started } = await productsApi.optimize(product.id);
      setRun(started);
      setEditing(false);
    } catch (e) {
      setStartError(errorText(e, "No pudimos empezar. Intenta de nuevo en un momento."));
    } finally {
      setStarting(false);
    }
  };

  const decide = async (action: "approve" | "reopen") => {
    setDeciding(true);
    try {
      const res = await productsApi.decideAvatar(product.id, action);
      setAvatar(res.avatar);
      router.refresh();
      if (action === "approve") notifyUndo("Cliente ideal aprobado", () => decide("reopen"));
    } catch (e) {
      notify(errorText(e, "No pudimos guardar tu decisión. Intenta de nuevo."));
    } finally {
      setDeciding(false);
    }
  };

  const saveEdited = async (edited: CustomerAvatar) => {
    setDeciding(true);
    try {
      const res = await productsApi.editAvatar(product.id, edited, true);
      setAvatar(res.avatar);
      setEditing(false);
      router.refresh();
      notifyUndo("Cambios guardados y cliente ideal aprobado", () => decide("reopen"));
    } catch (e) {
      notify(errorText(e, "No pudimos guardar los cambios. Intenta de nuevo."));
    } finally {
      setDeciding(false);
    }
  };

  // ---------------------------------------------------------------- Piezas
  const pendingUploads = uploads.filter((u) => u.state !== "done");
  const refsHeader = (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-heading">Imágenes de referencia</h2>
      <span className="text-caption text-muted-foreground tabular-nums">
        {count(inUse)} de {count(images.length)} en uso
      </span>
    </div>
  );
  const refTiles = (dense: boolean) => (
    <>
      {images.map((img) => (
        <ReferenceImage
          key={img.id}
          src={img.src}
          alt={img.alt || "Imagen de referencia"}
          source={img.source}
          cover={img.cover}
          base={img.id === baseId}
          dense={dense}
          state={img.excluded ? "excluded" : "ready"}
          onToggle={() => toggle(img)}
          onSelect={() => chooseBase(img)}
        />
      ))}
      {pendingUploads.map((u) => (
        <ReferenceImage
          key={u.id}
          name={u.name}
          state={u.state === "error" ? "error" : "uploading"}
          progress={u.progress}
          error={u.detail}
          onRetry={() => startUpload(u)}
        />
      ))}
    </>
  );
  const uploader = (compact: boolean) => (
    <ImageUploader
      compact={compact}
      mode={mode}
      onModeChange={setMode}
      state={fetching ? "fetching" : "idle"}
      items={uploads}
      onFiles={addFiles}
      onCancel={(id) => uploads.find((u) => u.id === id)?.cancel?.()}
      onRetry={(id) => {
        const u = uploads.find((x) => x.id === id);
        if (u) startUpload(u);
      }}
      url={url}
      onUrlChange={(v) => {
        setUrl(v);
        setUrlError(undefined);
      }}
      urlError={urlError}
      onFetchUrl={fetchUrl}
    />
  );

  const status = (
    <>
      {running && run ? <OptimizingCard run={run} image={product.image} name={product.name} /> : null}
      {failed && run ? (
        <div role="alert" className="flex gap-3 rounded-lg border border-destructive bg-destructive-soft p-4 text-destructive">
          <Icon name="alert" />
          <div className="min-w-0 flex-1">
            <p className="text-row">No se pudo optimizar</p>
            <p className="text-label font-normal">{run.error ?? "Toca Reintentar."}</p>
          </div>
        </div>
      ) : null}
      {avatar && !running ? (
        <AvatarProposalCard
          proposal={avatar}
          editing={editing}
          saving={deciding}
          onEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onSave={saveEdited}
          onRegenerate={optimize}
          regenerating={starting}
        />
      ) : null}
      {base.hasBrief && !running ? (
        // Se reinicia si la ficha nueva trae otra propuesta.
        <DifferentiatorSection key={JSON.stringify(base.differentiator.proposed)} productId={product.id} initial={base.differentiator} />
      ) : null}
      {avatar && !running && base.missingInputs.length ? (
        <section aria-labelledby="falta" className="rounded-lg border bg-card p-4">
          <h2 id="falta" className="text-heading">
            Para mejores anuncios, cuéntale a la IA
          </h2>
          <p className="mt-0.5 text-label font-normal text-muted-foreground">Agrégalo abajo, en lo que sabes del producto, y vuelve a generar.</p>
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-small">
            {base.missingInputs.map((m) => (
              <li key={m.field}>{m.question}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );

  // Acceso a la etapa opcional Reseñas (arquitectura.md › 9): importadas antes de optimizar, la IA
  // las usa para escribir con palabras de clientes.
  const reviewsStage = product.stages.find((s) => s.key === "resenas");
  const reviewsCta = (
    <Link
      href={productHref(product.id, "resenas")}
      className="grid min-h-14 w-full grid-cols-[--spacing(5)_1fr_--spacing(4)] items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left text-foreground hover:bg-accent"
    >
      <Icon name="star" size="sm" />
      <span>
        <b className="block text-small font-medium">{reviewsStage?.state === "available" ? "Importa reseñas de AliExpress" : "Reseñas"}</b>
        <small className="block text-caption text-muted-foreground">
          {reviewsStage?.state === "available" ? "Opcional. La IA las usa para escribir." : reviewsStage?.desc}
        </small>
      </span>
      <Icon name="chevron-right" size="sm" />
    </Link>
  );

  const infoInput = (rows: number) => (
    <ProductInfoInput
      value={info.text}
      onChange={info.change}
      found={info.topics}
      fromShopify={base.fromShopify}
      saving={info.saving}
      saved={info.saved}
      error={info.error}
      rows={rows}
      onAddTopic={(t) => info.change(`${info.text.replace(/\s+$/, "")}${info.text.trim() ? "\n\n" : ""}${t}: `)}
    />
  );

  // Acción principal: una por vista (design-system › primary).
  let primary: React.ReactNode;
  let summary: React.ReactNode = NOTE;
  if (editing) {
    primary = null;
  } else if (running) {
    primary = (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" loading>
        Optimizando
      </Button>
    );
    summary = "Puedes salir de esta pantalla: te avisamos en Hoy cuando esté listo.";
  } else if (avatar && !approved) {
    primary = (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" icon="check" loading={deciding} onClick={() => decide("approve")}>
        Aceptar cliente ideal
      </Button>
    );
    summary = "Revisa la propuesta. Puedes editarla o volver a generarla.";
  } else if (approved) {
    primary = (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" iconEnd="chevron-right" href={productHref(product.id, "angulos")}>
        Continuar: Ángulos
      </Button>
    );
    summary = "Cliente ideal aprobado. Con él, la IA evalúa cómo vender el producto.";
  } else {
    primary = (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" icon="sparkle" loading={starting} disabled={inUse === 0 || !pricing} onClick={optimize}>
        {failed ? "Reintentar" : "Optimizar con IA"}
      </Button>
    );
    if (inUse === 0) summary = "Agrega o vuelve a usar al menos una imagen para optimizar.";
    else if (!pricing) summary = "Guarda el precio y los packs para optimizar: la IA escribe para ese precio.";
  }

  return (
    // Escritorio: el pie con la acción queda abajo aunque el contenido sea corto (como el onboarding).
    <div className="flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Información base" stageKey="importado" image={product.image} />
      <TopBar
        back="Productos"
        backHref="/products"
        title={product.name}
        subtitle={product.summary}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="px-4 pb-2 lg:hidden">
        <StageMeter stages={product.meter} />
      </div>

      <div className="flex flex-col gap-5 px-4 pt-2 pb-4 lg:grid lg:flex-1 lg:grid-cols-[minmax(0,1fr)_--spacing(90)] lg:items-start lg:gap-8 lg:px-8 lg:pt-6">
        <div className="flex min-w-0 flex-col gap-5">
          {status}
          {/* Móvil: las imágenes van arriba, en una fila de 4 con “Agregar”. */}
          <section aria-label="Imágenes de referencia" className="lg:hidden">
            {refsHeader}
            <div className="grid grid-cols-4 gap-2">
              {refTiles(true)}
              <ReferenceAddTile onClick={() => setSheetOpen(true)} />
            </div>
          </section>
          {infoInput(desktop ? 9 : 4)}
          <CompetitorsSection productId={product.id} currency={product.currency ?? "CLP"} initial={base.competitors} />
          <div className="lg:hidden">{reviewsCta}</div>
          <PricingSection productId={product.id} currency={product.currency ?? "CLP"} saved={pricing} defaults={base.pricingDefaults} packLabels={base.packLabels} onSaved={setPricing} />
        </div>
        {/* Escritorio: referencias y carga a la derecha. */}
        <aside aria-label="Imágenes de referencia" className="hidden flex-col gap-4 lg:flex">
          <div>
            {refsHeader}
            <div className="grid grid-cols-2 gap-2">{refTiles(false)}</div>
          </div>
          {uploader(false)}
          {reviewsCta}
        </aside>
      </div>

      {startError ? (
        <p role="alert" className="px-4 pb-3 text-label font-normal text-destructive lg:px-8">
          {startError}
        </p>
      ) : null}

      {primary ? (
        <StickyActions variant="bar" stack summary={summary} mobileNote={summary} className="lg:px-8">
          {primary}
        </StickyActions>
      ) : null}

      {/* Móvil: la carga vive en una hoja inferior que abre el tile “Agregar”. */}
      {desktop ? null : (
        <Drawer open={sheetOpen} onOpenChange={setSheetOpen} repositionInputs={false}>
          <DrawerContent className="max-h-[85svh]">
            <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3">
              <DrawerTitle className="text-heading">Agregar imágenes</DrawerTitle>
              <DrawerDescription className="sr-only">Desde tu equipo o desde un enlace.</DrawerDescription>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{uploader(true)}</div>
            <div className="border-t px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]">
              <Button variant="primary" size="lg" block icon="check" onClick={() => setSheetOpen(false)}>
                Listo
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
