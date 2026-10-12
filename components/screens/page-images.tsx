"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";
import { DndContext, TouchSensor, MouseSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { imageSelectionDuration, interactionTolerance } from "@/lib/tokens";
import { VISUAL_LIMITS } from "@/lib/product-intelligence/visual-schemas";
import { useRouter } from "next/navigation";
import { Button, EmptyState, IconButton, ImageTile, Notice, notify } from "@/components/df";
import { productsApi, uploadPageImage } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import { imageTargetLabel, visualImageUses } from "@/lib/page-images/uses";
import { contentAvailable, selectedUse } from "@/lib/product-intelligence/current-content";
import { money } from "@/lib/format";
import type { PageImageOptionView, ProductPageImages, VisualWorkbench } from "@/lib/types";

function SelectedImage({ option, order, busy, onSelect, children }: { option: PageImageOptionView; order: number; busy: boolean; onSelect: () => void; children: React.ReactNode }) {
  const { setNodeRef, transform, listeners, attributes, isDragging } = useSortable({ id: option.id, disabled: busy, transition: null });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform) }} className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 ${isDragging ? "z-sticky shadow-md" : "transition-transform duration-base ease-exit"}`}>
    <ImageTile src={option.src} alt="Imagen del producto" state="selected" order={order} disabled={busy} onSelect={onSelect} {...listeners} aria-describedby={attributes["aria-describedby"]} aria-roledescription="imagen reordenable" className="touch-manipulation" />
    <p className="text-label tabular-nums">{order === 1 ? "1 · Portada" : `${order} · Galería`}</p>{children}
  </article>;
}

/** Solo las imágenes existentes, sus usos y su orden. La dirección creativa se guarda desde el chat. */
export function PageImagesScreen({ data, visual }: { data: ProductPageImages; visual?: VisualWorkbench | null }) {
  const dndId = useId();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: interactionTolerance } }), useSensor(TouchSensor, { activationConstraint: { delay: imageSelectionDuration, tolerance: interactionTolerance } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const router = useRouter(), upload = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(data), [workbench, setWorkbench] = useState(visual);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [destinations, setDestinations] = useState<Record<string,string>>({});
  const retries = useRef(new Map<string, string>());
  useEffect(() => { setState(data); setWorkbench(visual); }, [data, visual]);
  const slots = state.slots.filter(s => ["cover", "gallery"].includes(s.kind));
  const options = slots.flatMap(s => s.options).filter(o => !o.discarded);
  const cover = slots.find(s => s.kind === "cover")?.options.find(o => o.chosen);
  const gallery = (slots.find(s => s.kind === "gallery")?.options ?? []).filter(o => o.chosen && !o.discarded).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const other = options.filter(o => !o.chosen);
  const working = options.some(o => o.render === "queued" || o.render === "running");
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [working, router]);
  async function refresh() {
    const [next, result] = await Promise.all([productsApi.pageImages(data.product.id), fetch(`/api/products/${data.product.id}/visual`)]);
    if (!result.ok) throw new Error("No pudimos actualizar las imágenes. Actualiza la página.");
    setState({ ...next, product: data.product }); setWorkbench(await result.json()); router.refresh();
  }
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(undefined);
    try { await action(); await refresh(); notify(message); }
    catch(e) { setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo."); }
    finally { setBusy(false); }
  }
  async function selection(nextCover: string | null, nextGallery: string[]) {
    if (!workbench) throw new Error("No pudimos recuperar las imágenes. Actualiza la página.");
    const signature = JSON.stringify([workbench.dependency_stamp, nextCover, nextGallery]);
    const key = retries.current.get(signature) ?? crypto.randomUUID(); retries.current.set(signature, key);
    const response = await fetch(`/api/products/${data.product.id}/images/selection`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      expected_revision: workbench.revision, expected_etag: workbench.etag, expected_dependency_stamp: workbench.gallery_etag ? `gallery:${workbench.gallery_etag}` : workbench.dependency_stamp,
      idempotency_key: key, cover: nextCover, gallery: nextGallery,
    }) });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "La selección cambió. Actualiza e intenta de nuevo.");
    retries.current.delete(signature);
  }
  const imageUses = visualImageUses(workbench?.records ?? []);
  const library = workbench?.records.filter(r => r.kind === "asset" && contentAvailable(r) && r.file && !workbench.records.some(b => b.kind === "binding" && selectedUse(b) && b.payload.asset_id === r.id && options.some(o => o.id === b.id && o.chosen))) ?? [];
  async function moreImages() {
    if(!workbench) return;
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/products/${data.product.id}/visual?offset=${workbench.asset_offset + VISUAL_LIMITS.pageSize}`);
      if(!response.ok) throw new Error("No pudimos abrir más imágenes. Intenta de nuevo.");
      const next: VisualWorkbench = await response.json();
      if(next.dependency_stamp !== workbench.dependency_stamp) { await refresh(); throw new Error("Las imágenes cambiaron. Recuperamos la lista actualizada."); }
      setWorkbench({ ...next, records: [...workbench.records.filter(r => r.kind === "asset" && !next.records.some(n => n.id === r.id)), ...next.records] });
    } catch(e) { setError(e instanceof Error ? e.message : "No pudimos abrir más imágenes."); }
    finally { setBusy(false); }
  }
  async function bind(assetId: string, targetKey: string) {
    const target = workbench?.targets.find(t => t.key === targetKey);
    if (!target || !workbench) throw new Error("El destino cambió. Actualiza la página.");
    const signature = JSON.stringify(["bind",workbench.etag,assetId,targetKey]), key = retries.current.get(signature) ?? crypto.randomUUID(); retries.current.set(signature,key);
    const response = await fetch(`/api/products/${data.product.id}/visual`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({tool:"bind_visual_asset",input:{
      product_id:data.product.id,schema_version:"1.0",expected_revision:workbench.revision,expected_etag:workbench.etag,expected_dependency_stamp:workbench.dependency_stamp,idempotency_key:key,asset_id:assetId,bindings:[{target:target.target,target_etag:target.etag,reason:"Imagen elegida por el comerciante"}],
    }}) });
    const result=await response.json(); if(!response.ok || result.ok===false) throw new Error(result.error?.message ?? result.error ?? "No pudimos elegir la imagen. Actualiza e intenta de nuevo.");
    retries.current.delete(signature);
  }
  const galleryIds = gallery.map(o => o.id);
  const pick = (o: PageImageOptionView) => act(() => selection(cover?.id ?? o.id, cover ? [...galleryIds, o.id] : galleryIds), "Imagen elegida");
  const setCover = (o: PageImageOptionView) => act(() => selection(o.id, galleryIds.filter(id => id !== o.id)), "Portada cambiada");
  const remove = (o: PageImageOptionView) => act(() => selection(cover?.id === o.id ? null : cover?.id ?? null, galleryIds.filter(id => id !== o.id)), "Imagen quitada de la página");
  function move(index: number, offset: number) {
    const ids = [...galleryIds]; [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    return act(() => selection(cover?.id ?? null, ids), "Orden guardado");
  }
  function tile(o: PageImageOptionView, index?: number) {
    const actions = <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => void remove(o)}>Quitar</Button>
      {o.id !== cover?.id ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setCover(o)}>Usar de portada</Button> : null}
      {index !== undefined ? <><IconButton icon="arrow-up" label="Mover imagen antes" disabled={busy || index === 0} onClick={() => void move(index,-1)} /><IconButton icon="arrow-down" label="Mover imagen después" disabled={busy || index === gallery.length-1} onClick={() => void move(index,1)} /></> : null}
    </div>;
    if(o.chosen && o.render === "succeeded") return <SelectedImage key={o.id} option={o} order={o.id === cover?.id ? 1 : (index ?? 0)+2} busy={busy} onSelect={() => void remove(o)}>{actions}</SelectedImage>;
    return <article key={o.id} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3">
      {o.src ? <ImageTile src={o.src} alt="Imagen guardada del producto" disabled={busy || Boolean(cover && gallery.length >= 5)} onSelect={() => void pick(o)} /> : <p className="grid aspect-square place-items-center text-caption text-muted-foreground">{o.render === "failed" ? o.error ?? "No se pudo crear la imagen" : "Creando imagen…"}</p>}
      <p className="text-label tabular-nums">{o.id === cover?.id ? "1 · Portada" : index !== undefined ? `${index + 2} · Galería` : "Disponible"}</p>
      {o.render === "succeeded" ? <div className="flex flex-wrap gap-2">
        {!o.chosen ? <Button size="sm" disabled={busy || Boolean(cover && gallery.length >= 5)} onClick={() => void pick(o)}>Elegir</Button> : <Button size="sm" disabled={busy} onClick={() => void remove(o)}>Quitar</Button>}
        {o.id !== cover?.id ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setCover(o)}>Usar de portada</Button> : null}
        {index !== undefined ? <><IconButton icon="arrow-up" label="Mover imagen antes" disabled={busy || index === 0} onClick={() => void move(index,-1)} /><IconButton icon="arrow-down" label="Mover imagen después" disabled={busy || index === gallery.length-1} onClick={() => void move(index,1)} /></> : null}
      </div> : null}
    </article>;
  }
  return <div className="flex flex-col gap-4 px-4 py-4 lg:px-8 lg:py-6">
    <div><h2 className="text-title">Portada y galería</h2><p className="mt-1 text-body text-muted-foreground">La portada aparece primero. Mantén presionada una imagen para cambiar el orden.</p></div>
    {error ? <p role="alert" className="text-body text-destructive">{error}</p> : null}
    {cover || gallery.length ? <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active, over}) => {
      if(!over || active.id === over.id || busy) return;
      const ids = [...(cover ? [cover.id] : []), ...galleryIds], from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
      if(from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to); void act(() => selection(next[0], next.slice(1)), "Orden guardado");
    }}><SortableContext items={[...(cover ? [cover.id] : []), ...galleryIds]} strategy={rectSortingStrategy}><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cover ? tile(cover) : null}{gallery.map((o,i) => tile(o,i))}</div></SortableContext></DndContext> : <EmptyState icon="image" title="Sin imágenes elegidas" body="Elige una foto guardada o agrega una desde tu equipo. Con una portada puedes publicar." />}
    {other.length ? <section><h3 className="mb-3 text-heading">Otras imágenes guardadas</h3><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{other.map(o => tile(o))}</div></section> : null}
    {library.length ? <details className="rounded-lg border p-4"><summary className="min-h-touch cursor-pointer text-label">Imágenes guardadas en el chat</summary><div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">{library.map(asset => <article key={asset.id} className="flex min-w-0 flex-col gap-2"><img src={asset.file!.url} alt="Imagen guardada en el chat" className="aspect-square w-full rounded-md object-contain" /><div className="text-caption text-muted-foreground">{imageUses.get(asset.id)?.length ? <><p>Asignada a:</p><ul role="list">{imageUses.get(asset.id)!.map(use => <li key={use} className="tabular-nums">{use}</li>)}</ul></> : <p>Sin asignar</p>}</div><label className="text-label">Usar en<select className="mt-2 min-h-touch w-full rounded-md border bg-background px-3 text-small" value={destinations[asset.id] ?? ""} disabled={busy} onChange={e=>setDestinations({...destinations,[asset.id]:e.target.value})}><option value="">Elige un lugar</option>{workbench?.targets.filter(t=>t.target.type==="gallery_shot" || t.target.type==="landing_section" || t.target.type==="landing_component").map(t=><option key={t.key} value={t.key}>{imageTargetLabel(t.target)}</option>)}</select></label><Button size="sm" disabled={busy || !destinations[asset.id]} onClick={()=>void act(()=>bind(asset.id,destinations[asset.id]),"Imagen elegida")}>Usar imagen</Button></article>)}</div></details> : null}
    {workbench && workbench.asset_offset + VISUAL_LIMITS.pageSize < workbench.asset_total ? <Button disabled={busy} onClick={() => void moreImages()}>Ver más imágenes guardadas</Button> : null}
    <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => upload.current?.click()} icon="upload">Agregar foto</Button><Button href={productHref(data.product.id,"textos")} icon="edit">Cambiar imágenes de las secciones</Button></div>
    <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Agregar foto de galería" onChange={e => { const file = e.target.files?.[0]; e.target.value=""; if(file) void act(() => uploadPageImage(data.product.id, "gallery", file, () => {}).done,"Foto guardada. Elígela para usarla."); }} />
    {state.references.length ? <details className="rounded-lg border p-4"><summary className="min-h-touch cursor-pointer text-label">Usar una foto de referencia</summary><div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">{state.references.map(r => <article key={r.id}><img src={r.src} alt={r.alt || "Referencia del producto"} className="aspect-square w-full rounded-md object-contain" /><Button className="mt-2" disabled={busy} onClick={() => void act(async () => { const response=await fetch(`/api/products/${data.product.id}/page-images/references`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slot:"gallery",referenceId:r.id,select:false})}); if(!response.ok) throw new Error("No pudimos agregar esa foto. Actualiza e intenta de nuevo."); },"Foto agregada a las opciones")}>Agregar a las opciones</Button></article>)}</div></details> : null}
    {state.slots.some(s => s.shots.length) ? <details className="rounded-lg border p-4"><summary className="min-h-touch cursor-pointer text-label">Crear imágenes del plan guardado</summary><div className="mt-3 flex flex-col gap-3">{state.cannotGenerate ? <Notice title="Conecta tu proveedor de imágenes" body={state.cannotGenerate} /> : null}{state.slots.flatMap(s => s.shots.map(sh => <div key={sh.id} className="flex items-center justify-between gap-3"><p className="text-body">{sh.name}</p><Button disabled={busy || Boolean(state.cannotGenerate)} onClick={() => void act(() => productsApi.renderShot(data.product.id, sh.id),"Creando imagen")}>Crear · {money(state.imageCostUsd,"USD")}</Button></div>))}</div></details> : null}
  </div>;
}
