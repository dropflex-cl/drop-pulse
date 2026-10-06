"use client";

import { ACCEPTED_TYPES, Button, Icon, ImageUploader, ProductInfoInput, ReferenceAddTile, ReferenceImage, StageMeter, Switch, TopBar, notify, type UploadItem, type UploaderMode, } from "@/components/df";
import { AiCostButton, useLocalCost } from "@/components/shell/ai-cost-provider";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { IMAGE_QA_USD } from "@/lib/ai/costs";
import { count } from "@/lib/format";
import { pickBase } from "@/lib/products/base";
import { ProductApiClientError, productsApi, uploadImage } from "@/lib/products/client";
import type { ProductData } from "@/lib/products/product-data";
import { detectTopics } from "@/lib/products/topics";
import { productHref } from "@/lib/routes";
import type { ProductBase, ReferenceImage as RefImage, SavedPricingDto } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DifferentiatorSection } from "./differentiator-section";
import { PricingSection } from "./pricing-section";
import { ProductDataSection } from "./product-data-section";

const AUTOSAVE_MS = 1500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NOTE = "La IA identifica tu producto en menos de un minuto. Nada se publica sin tu OK.";

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

/**
 * «Revisar cada imagen con IA»: el QA con Claude de cada imagen generada (página, creativos e imágenes
 * clave) y su reintento. Apagado por defecto; se guarda al tocarlo y vale para lo que termine después.
 */
function ImageQaSection({ productId, initial }: { productId: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const localCost = useLocalCost();
  const change = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    try {
      await productsApi.setImageQa(productId, next);
    } catch (e) {
      setEnabled(!next);
      notify(errorText(e, "No pudimos guardar el cambio. Intenta de nuevo."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label="Revisión de imágenes" className="rounded-lg border bg-card px-4 py-1">
      <Switch
        label="Revisar cada imagen con IA"
        hint={`La compara con la foto real y la genera otra vez si falla. ${localCost(IMAGE_QA_USD)} por imagen.`}
        checked={enabled}
        disabled={saving}
        onChange={change}
      />
    </section>
  );
}

export function BaseInfoScreen({ base }: { base: ProductBase }) {
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
  const [productData, setProductData] = useState<ProductData | undefined>(base.productData);

  const inUse = images.filter((i) => !i.excluded).length;
  const baseId = pickBase(images, (i) => i)?.id;

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
      <ProductDataSection productId={product.id} value={productData} onSaved={setProductData} />
      {base.hasBrief ? (
        // Se reinicia si la estrategia nueva trae otra propuesta.
        <DifferentiatorSection key={JSON.stringify(base.differentiator.proposed)} productId={product.id} initial={base.differentiator} />
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
  if (productData) {
    primary = pricing ? (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" iconEnd="chevron-right" href={productHref(product.id, "angulos")}>
        Continuar: Estrategia
      </Button>
    ) : (
      <Button variant="primary" size="lg" className="max-lg:w-full lg:h-control lg:text-row" iconEnd="chevron-right" disabled>
        Continuar: Estrategia
      </Button>
    );
    summary = pricing ? "Con estos datos y tu precio, prepara la estrategia en el chat." : "Guarda el precio y los packs para seguir: la estrategia parte de ese precio.";
  } else {
    primary = <Button variant="primary" size="lg" iconEnd="chevron-right" disabled className="max-lg:w-full lg:h-control lg:text-row">Continuar: Estrategia</Button>;
    summary = "Completa el nombre y la descripción del producto.";
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
          <div className="lg:hidden">{reviewsCta}</div>
          <PricingSection productId={product.id} currency={product.currency ?? "CLP"} saved={pricing} defaults={base.pricingDefaults} packLabels={base.packLabels} onSaved={setPricing} />
          <ImageQaSection productId={product.id} initial={base.imageQa} />
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
