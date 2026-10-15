"use client";

/* eslint-disable @next/next/no-img-element -- Las URLs firmadas conservan todos los cuadros de la animación. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, ImageUploader, notify } from "@/components/df";
import { GIFS, GIF_MAX, GIF_MAX_UPLOAD_BYTES, GIF_MIN_SIDE } from "@/lib/page-images/catalog";
import { productsApi, uploadPageImage } from "@/lib/products/client";
import type { PageImageOptionView, PageImagesState } from "@/lib/types";

const EMPTY: PageImageOptionView[] = [];

/** Los archivos son compartidos por las versiones; los textos siguen la versión elegida. */
export function GifMedia({ productId, initial = EMPTY, content, disabled = false }: {
  productId: string;
  initial?: PageImageOptionView[];
  content: unknown;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initial);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [upload, setUpload] = useState<{ name: string; progress: number }>();
  const pending = useRef(false);
  useEffect(() => { setOptions(initial); }, [initial]);

  const available = options.filter(option => !option.discarded && option.render === "succeeded");
  const chosen = available.filter(option => option.chosen).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const unused = available.filter(option => !option.chosen);
  const texts = (content as { gifs?: { heading?: string }[] } | null)?.gifs ?? [];
  const locked = disabled || busy;

  async function act(action: () => Promise<PageImagesState>, message: string) {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true); setError(undefined);
    try {
      const next = await action();
      setOptions(next.slots.find(slot => slot.key === GIFS)?.options ?? []);
      notify(message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar el GIF. Intenta de nuevo.");
    } finally {
      pending.current = false;
      setBusy(false); setUpload(undefined);
    }
  }

  function uploadFile(file: File) {
    if (pending.current || disabled) return;
    setError(undefined);
    if (file.size > GIF_MAX_UPLOAD_BYTES) {
      setError("El GIF pesa más de 25 MB. Recórtalo o súbelo más corto.");
      return;
    }
    void act(async () => {
      setUpload({ name: file.name, progress: 0 });
      return uploadPageImage(productId, GIFS, file, progress => setUpload({ name: file.name, progress })).done;
    }, "GIF agregado a la página");
  }

  function move(index: number, offset: number) {
    const ids = chosen.map(option => option.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void act(() => productsApi.orderGallery(productId, ids, GIFS), "Orden de los GIF guardado");
  }

  return <section aria-label="GIFs del producto" className="mt-4 flex flex-col gap-3 border-t pt-4">
    <p className="text-small text-muted-foreground">El GIF 1 acompaña al texto 1, y así sucesivamente. Los archivos y su orden se comparten entre todas las versiones. Publica para mostrar los cambios en tu tienda.</p>
    {chosen.length ? <ol className="flex list-none flex-col gap-3 p-0">{chosen.map((option, index) => <li key={option.id} className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-label tabular-nums">{index + 1} · {texts[index]?.heading ?? `Texto ${index + 1}`}</p>
      {option.src ? <img src={option.src} alt={`GIF ${index + 1} del producto en uso`} className="max-h-44 w-full rounded-md bg-muted object-contain" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon="arrow-up" label={`Mover GIF ${index + 1} antes`} disabled={locked || index === 0} onClick={() => move(index, -1)} />
        <IconButton icon="arrow-down" label={`Mover GIF ${index + 1} después`} disabled={locked || index === chosen.length - 1} onClick={() => move(index, 1)} />
        <Button size="sm" disabled={locked} onClick={() => void act(() => productsApi.decidePageImage(productId, option.id, "unchoose"), "GIF quitado de la página")}>Quitar GIF {index + 1}</Button>
      </div>
    </li>)}</ol> : <p className="text-body text-muted-foreground">Sube un GIF para mostrar el producto en uso. Sin GIFs, este componente no aparece en tu tienda.</p>}
    <p className="text-caption tabular-nums text-muted-foreground">{chosen.length} de {GIF_MAX} GIFs en la página</p>
    {unused.length ? <details className="rounded-md border p-3"><summary className="min-h-touch cursor-pointer text-label">GIFs guardados sin usar</summary><div className="mt-3 grid grid-cols-2 gap-3">{unused.map((option, index) => <div key={option.id} className="flex min-w-0 flex-col gap-2">
      {option.src ? <img src={option.src} alt={`GIF guardado ${index + 1}`} className="max-h-44 w-full rounded-md bg-muted object-contain" /> : null}
      <Button size="sm" disabled={locked || chosen.length >= GIF_MAX} onClick={() => void act(() => productsApi.decidePageImage(productId, option.id, "choose"), "GIF agregado a la página")}>Usar GIF</Button>
    </div>)}</div></details> : null}
    {chosen.length < GIF_MAX ? <fieldset disabled={locked} className="min-w-0">
      <ImageUploader mode={mode} onModeChange={setMode} compact multiple={false} noun="GIFs"
        compactLabel="Subir GIF" accept={["image/gif", "image/webp", "image/png", "image/apng"]}
        formats={`GIF, WebP animado o APNG · hasta 25 MB · mínimo ${GIF_MIN_SIDE} px por lado`}
        onFiles={files => { if (files[0]) uploadFile(files[0]); }}
        url={url} onUrlChange={setUrl} urlLabel="Enlace del GIF" urlHint="Pega el enlace directo al archivo animado."
        state={busy && mode === "url" ? "fetching" : "idle"}
        onFetchUrl={() => { if (url.trim()) void act(async () => { const next = await productsApi.importPageImageUrl(productId, GIFS, url.trim()); setUrl(""); return next; }, "GIF agregado a la página"); }}
        items={upload ? [{ id: "gif-upload", name: upload.name, state: "uploading", progress: upload.progress }] : []} />
    </fieldset> : <p className="text-small text-muted-foreground">Ya usas {GIF_MAX} GIFs. Quita uno para agregar otro.</p>}
    {busy ? <p role="status" className="text-caption text-muted-foreground">{upload && upload.progress < 1 ? "Subiendo GIF…" : "Guardando GIFs…"}</p> : null}
    {error ? <p role="alert" className="text-small text-destructive">{error}</p> : null}
  </section>;
}
