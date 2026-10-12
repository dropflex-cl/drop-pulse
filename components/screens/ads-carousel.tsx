"use client";

/* eslint-disable @next/next/no-img-element -- Las URLs firmadas ya apuntan a imágenes optimizadas. */

import { useId, useRef, useState } from "react";
import { Button, Field, SegmentedControl, notify } from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { adsApi, uploadCreative } from "@/lib/ads/client";
import { activeCarouselCards, carouselContentSchema, type CarouselCard, type CarouselContent } from "@/lib/ads/carousel";
import type { AdMedia } from "@/lib/types";

function TextField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
  const id = useId();
  return <div className="flex flex-col gap-1.5"><label htmlFor={id} className="text-label">{label}</label><textarea id={id} value={value} maxLength={maxLength} rows={3} onChange={e => onChange(e.target.value)} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-body" /></div>;
}
const blankCard = (): CarouselCard => ({ key: `card_${crypto.randomUUID().slice(0, 8)}`, headline: "", description: "", link: null, scene: "Fotografía del producto con luz natural.", image_texts: [] });
const blank = (): CarouselContent => ({ name: "Nuevo carrusel", ratio: "4:5", primary_text: "", cta: "SHOP_NOW", strategy_id: null, angle_id: null, landing_angle_id: null, landing_hook_id: null,
  art: { palette: "Paleta del producto", typography: "Sans serif clara", lighting: "Luz natural", photography_style: "Fotografía de producto", consistency_notes: "Conservar la identidad del producto en todas las tarjetas" }, cards: [blankCard(), blankCard()] });

export function CarouselPreview({ media }: { media: AdMedia }) {
  const cards = activeCarouselCards(media.carousel?.cards ?? []);
  return <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-md" role="region" tabIndex={0} aria-label={`Tarjetas de ${media.name}`}>
    {cards.map((c, i) => <figure key={c.key} className="m-0 w-full shrink-0 snap-start">
      {c.url ? <img src={c.url} alt={c.headline || `Tarjeta ${i + 1}`} className={`w-full rounded-md object-contain ${media.ratio === "4:5" ? "aspect-portrait-ad" : "aspect-square"}`} /> : <p className="rounded-md bg-muted p-4 text-caption">Falta asignar la imagen</p>}
      <figcaption className="py-2 text-caption"><span className="tabular-nums">{i + 1}/{cards.length}</span> · {c.headline}</figcaption>
    </figure>)}
  </div>;
}

export function CarouselLibrary({ productId, media, selected, onMedia, onChoose }: { productId: string; media: AdMedia[]; selected: string[]; onMedia: (m: AdMedia) => void; onChoose: (id: string) => void }) {
  const [editing, setEditing] = useState<AdMedia | null | undefined>(undefined), [content, setContent] = useState<CarouselContent>(blank);
  const lastSave = useRef<{ body: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const open = (m: AdMedia | null) => { setEditing(m); setContent(m?.carousel?.content ?? blank()); setError(null); lastSave.current = null; };
  const patch = (key: string, change: Partial<CarouselCard>) => setContent(c => ({ ...c, cards: c.cards.map(v => v.key === key ? { ...v, ...change } : v) }));
  const move = (index: number, delta: number) => setContent(c => { const cards = [...c.cards], to = index + delta; [cards[index], cards[to]] = [cards[to], cards[index]]; return { ...c, cards }; });
  const save = async () => {
    const parsed = carouselContentSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Revisa las tarjetas."); return; }
    setBusy(true); setError(null);
    const body = JSON.stringify(parsed.data);
    if (lastSave.current?.body !== body) lastSave.current = { body, key: crypto.randomUUID() };
    try { const result = await adsApi.saveCarousel(productId, { carousel_id: editing?.id ?? null, idempotency_key: lastSave.current!.key, expected_etag: editing?.carousel?.etag, content: parsed.data }); onMedia(result.media); setEditing(undefined); notify("Carrusel guardado"); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo."); }
    finally { setBusy(false); }
  };
  const upload = async (card: CarouselCard, file: File) => {
    setUploading(card.key); setError(null);
    try { const m = await uploadCreative(productId, file, () => {}).done; onMedia(m); patch(card.key, { media_id: m.id, asset_id: null }); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos subir la imagen."); }
    finally { setUploading(null); }
  };
  return <div className="flex flex-col gap-3">
    <Button onClick={() => open(null)}>Crea un carrusel</Button>
    {media.filter(m => m.kind === "carousel").map(m => <section key={m.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="m-0 text-label">{m.name} · {activeCarouselCards(m.carousel?.cards ?? []).length} tarjetas</p>
      <CarouselPreview media={m} />
      {m.carousel?.problem ? <p className="m-0 text-caption text-muted-foreground">{m.carousel.problem}</p> : null}
      <div className="flex flex-wrap gap-2"><Button onClick={() => open(m)}>Edita las tarjetas</Button><Button onClick={() => onChoose(m.id)}>{selected.includes(m.id) ? "Quita del anuncio" : "Usa este carrusel"}</Button></div>
    </section>)}
    <Drawer open={editing !== undefined} onOpenChange={v => { if (!v && !busy && !uploading) setEditing(undefined); }}>
      <DrawerContent>
        <div inert={busy} aria-busy={busy} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <DrawerTitle>Edita el carrusel</DrawerTitle><DrawerDescription>Guarda tus tarjetas y elige después si las usas en un anuncio.</DrawerDescription>
          <Field label="Nombre" value={content.name} onValueChange={name => setContent(c => ({ ...c, name }))} maxLength={120} />
          <SegmentedControl label="Formato" value={content.ratio} onChange={ratio => setContent(c => ({ ...c, ratio: ratio as CarouselContent["ratio"] }))} options={[{ value: "1:1", label: "Cuadrado" }, { value: "4:5", label: "Vertical" }]} />
          <TextField label="Texto principal" value={content.primary_text} maxLength={500} onChange={primary_text => setContent(c => ({ ...c, primary_text }))} />
          <label className="flex flex-col gap-2 text-label">Botón<select className="min-h-touch rounded-md border border-input bg-background px-3 text-row" value={content.cta} onChange={e => setContent(c => ({ ...c, cta: e.target.value as CarouselContent["cta"] }))}><option value="SHOP_NOW">Comprar</option><option value="ORDER_NOW">Pedir ahora</option><option value="BUY_NOW">Comprar ya</option><option value="LEARN_MORE">Más información</option></select></label>
          <details className="rounded-md border border-border p-3"><summary className="min-h-touch cursor-pointer text-label">Dirección artística</summary><div className="flex flex-col gap-3">{([
            ["palette", "Paleta"], ["typography", "Tipografía"], ["lighting", "Iluminación"], ["photography_style", "Fotografía"], ["consistency_notes", "Continuidad entre tarjetas"],
          ] as const).map(([key, label]) => <TextField key={key} label={label} value={content.art[key]} maxLength={2000} onChange={value => setContent(c => ({ ...c, art: { ...c.art, [key]: value } }))} />)}</div></details>
          <Button onClick={() => setContent(c => ({ ...c, enabled: c.enabled === false }))}>{content.enabled === false ? "Recupera el carrusel" : "Deja el carrusel fuera de uso"}</Button>
          {content.cards.map((card, i) => <fieldset key={card.key} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="text-label">Tarjeta {i + 1}</legend>
            {(() => { const url = card.media_id ? media.find(m => m.id === card.media_id)?.url : editing?.carousel?.cards.find(c => c.asset_id === card.asset_id && c.key === card.key)?.url; return url ? <img src={url} alt={`Imagen de tarjeta ${i + 1}`} className="w-full rounded-md object-contain" /> : null; })()}
            <Field label="Título del anuncio" value={card.headline} maxLength={40} onValueChange={headline => patch(card.key, { headline })} />
            <Field label="Descripción" value={card.description} maxLength={30} onValueChange={description => patch(card.key, { description })} />
            <Field label="Enlace" hint="Vacío usa la página del producto." value={card.link ?? ""} onValueChange={link => patch(card.key, { link: link || null })} />
            <TextField label="Escena" value={card.scene} maxLength={4000} onChange={scene => patch(card.key, { scene })} />
            <details className="rounded-md border border-border p-3"><summary className="min-h-touch cursor-pointer text-label">Textos dentro de la imagen</summary><div className="flex flex-col gap-3">{card.image_texts.map((t, ti) => <div key={ti} className="flex flex-col gap-2"><Field label={`Texto ${ti + 1}`} value={t.text} maxLength={2000} onValueChange={text => patch(card.key, { image_texts: card.image_texts.map((v, vi) => vi === ti ? { ...v, text } : v) })} /><Field label={`Ubicación del texto ${ti + 1}`} value={t.placement} maxLength={2000} onValueChange={placement => patch(card.key, { image_texts: card.image_texts.map((v, vi) => vi === ti ? { ...v, placement } : v) })} /><Button onClick={() => patch(card.key, { image_texts: card.image_texts.filter((_, vi) => vi !== ti) })}>Quita este texto</Button></div>)}<Button disabled={card.image_texts.length >= 7} onClick={() => patch(card.key, { image_texts: [...card.image_texts, { text: "Nuevo texto", placement: "Encabezado" }] })}>Añade un texto</Button><p className="m-0 text-caption text-muted-foreground">Editar el texto guarda la instrucción para una próxima imagen.</p></div></details>
            <label className="flex flex-col gap-2 text-label">Imagen<select className="min-h-touch rounded-md border border-input bg-background px-3 text-row" value={card.media_id ?? ""} onChange={e => patch(card.key, { media_id: e.target.value || null, asset_id: null })}><option value="">{card.asset_id ? "Imagen guardada desde el chat" : "Elige una imagen"}</option>{media.filter(m => m.kind === "image").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <Button disabled={!card.asset_id && !card.media_id} onClick={() => patch(card.key, { asset_id: null, media_id: null })}>Quita la imagen</Button>
            <label className="flex min-h-touch cursor-pointer items-center rounded-md border border-input px-3 text-row">{uploading === card.key ? "Subiendo imagen…" : "Sube una imagen"}<input className="sr-only" type="file" accept="image/jpeg,image/png" disabled={Boolean(uploading) || busy} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(card, f); e.target.value = ""; }} /></label>
            <div className="flex flex-wrap gap-2"><Button disabled={i === 0} onClick={() => move(i, -1)}>Mueve antes</Button><Button disabled={i === content.cards.length - 1} onClick={() => move(i, 1)}>Mueve después</Button><Button onClick={() => patch(card.key, { enabled: card.enabled === false })}>{card.enabled === false ? "Recupera la tarjeta" : "Deja fuera de uso"}</Button></div>
          </fieldset>)}
          <Button disabled={content.cards.length >= 10} onClick={() => setContent(c => ({ ...c, cards: [...c.cards, blankCard()] }))}>Añade una tarjeta</Button>
          {error ? <p role="alert" className="m-0 text-caption text-destructive">{error}</p> : null}
        </div>
        <div className="shrink-0 border-t border-border pb-safe"><div className="flex flex-wrap gap-2 p-4">
          <Button disabled={busy || Boolean(uploading)} onClick={() => setEditing(undefined)}>Cancela la edición</Button>
          <Button variant="primary" disabled={busy || Boolean(uploading)} onClick={() => void save()}>{busy ? "Guardando…" : "Guarda el carrusel"}</Button>
        </div></div>
      </DrawerContent>
    </Drawer>
  </div>;
}
