"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Icon, Notice, StatusBadge } from "@/components/df";
import { StickyActions } from "@/components/shell/sticky-actions";
import { type LandingSelection } from "@/lib/copy/variants";
import { effectivePage, pageSelections } from "@/lib/products/effective-page";
import { money } from "@/lib/format";
import { productHref } from "@/lib/routes";
import type { ProductOverview } from "@/lib/types";
import { EffectivePagePreview } from "./page/effective-page-preview";
import { LandingVariantPicker } from "./page/landing-variant-picker";

export function ProductOverviewScreen({ data }: { data: ProductOverview }) {
  const { product, page, publication, context, strategy } = data;
  const router = useRouter();
  const variants = pageSelections(page.input);
  const [selection, setSelection] = useState<LandingSelection>(variants[0] ?? {});
  const resolved = effectivePage(page.input, selection);
  const hasPage = Boolean(resolved.listing.short_description);
  useEffect(() => {
    if (publication?.status !== "publishing") return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [publication?.status, router]);
  return <div className="@container">
    <div className="grid gap-6 px-4 py-4 lg:px-8 lg:py-6 @4xl:grid-cols-2">
      <div className="contents @4xl:order-1 @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-4">
        <section aria-labelledby="product-situation" className="order-1 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="product-situation" className="text-heading">{product.contentState === "updated" ? "Cambios sin publicar" : product.summary}</h2>
            {product.status ? <StatusBadge status={product.status} label={product.contentState === "ready" ? "Listo" : undefined} /> : null}
          </div>
          {publication?.publishedAt ? <p className="mt-2 text-caption text-muted-foreground">Última publicación: {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(publication.publishedAt))}</p> : null}
          {product.contentState === "updated" ? <p className="mt-2 text-body">{product.publicationChanges?.join(" · ")}. Publica para llevar estos cambios a tu tienda.</p> : null}
          {publication?.productUrl ? <Button className="mt-3" size="sm" href={publication.productUrl} iconEnd="external">Ver en mi tienda</Button> : null}
          {page.missing.length && product.hasContent ? <details className="mt-3">
            <summary className="flex min-h-touch cursor-pointer items-center gap-2 text-label"><Icon name="alert" size="sm" />Ver qué falta para publicar</summary>
            <ul className="flex flex-col gap-2 text-small text-muted-foreground">{page.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            <Button className="mt-3" href={productHref(product.id, "publicar")} size="sm">Resolver requisitos</Button>
          </details> : null}
        </section>
        <section aria-labelledby="saved-content" className="order-3 rounded-lg border bg-card p-4">
          <h2 id="saved-content" className="text-heading">Lo que tienes guardado</h2>
          {context.description ? <p className="mt-2 text-body text-muted-foreground">{context.description}</p> : null}
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div><dt className="text-caption text-muted-foreground">Página</dt><dd className="text-row tabular-nums">{hasPage ? `${resolved.components.length + 1} secciones en uso` : "Sin página guardada"}</dd></div>
            <div><dt className="text-caption text-muted-foreground">Imágenes en la tienda</dt><dd className="text-row tabular-nums">{page.input.gallery.length}</dd></div>
            {page.input.packs.length ? <div><dt className="text-caption text-muted-foreground">Precio de 1 unidad</dt><dd className="text-row tabular-nums">{money(page.input.packs.find(p => p.units === 1)?.price ?? page.facts.price, page.facts.currency)}</dd></div> : null}
            {variants.length > 1 ? <div><dt className="text-caption text-muted-foreground">Variantes de página</dt><dd className="text-row tabular-nums">{variants.length}</dd></div> : null}
          </dl>
          {page.input.packs.length > 1 ? <details className="mt-3"><summary className="min-h-touch cursor-pointer py-3 text-label">Ver oferta y packs</summary>
            <ul className="flex flex-col gap-2">{page.input.packs.map(pack => <li key={pack.units} className="flex justify-between gap-3 text-body"><span>{pack.label ?? `${pack.units} unidades`}</span><span className="tabular-nums">{money(pack.price, page.facts.currency)}</span></li>)}</ul>
          </details> : null}
          <div className="mt-4 flex flex-wrap gap-2"><Button href={productHref(product.id, "importado")} icon="edit">Ajustar información y oferta</Button>
            <Button href={productHref(product.id, "imagenes")} icon="image">Cambiar imágenes</Button></div>
        </section>
        {strategy ? <details className="order-4 rounded-lg border bg-card p-4"><summary className="min-h-touch cursor-pointer text-label">Ver estrategia guardada</summary>
          <ul className="mt-3 flex flex-col gap-3">{strategy.snapshot.angles.map(angle => <li key={angle.id}><p className="text-row font-medium">{angle.name}</p><p className="text-body text-muted-foreground">{angle.hook}</p></li>)}</ul>
        </details> : null}
        <details className="order-4 rounded-lg border bg-card p-4"><summary className="min-h-touch cursor-pointer text-label">Herramientas de venta</summary>
          <div className="mt-3 flex flex-wrap gap-2"><Button href={productHref(product.id, "creativos")} icon="image">Ver creativos{data.creatives ? ` (${data.creatives})` : ""}</Button>
            <Button href={productHref(product.id, "anuncios")} icon="megaphone">Abrir anuncios</Button><Button href={productHref(product.id, "mensajes")} icon="chat">Usar mensajes de WhatsApp</Button><Button href={productHref(product.id, "resenas")} icon="star">Gestionar reseñas</Button></div>
        </details>
      </div>
      <section aria-labelledby="product-preview" className="order-2 min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="product-preview" className="text-heading">Tu página en la tienda</h2><Button size="sm" href={productHref(product.id, "textos")} icon="edit">Editar página</Button></div>
        {hasPage ? <>
          {variants.length > 1 ? <div className="mb-3"><LandingVariantPicker variants={variants} selection={selection} onChange={setSelection} /></div> : null}
          <div className="overflow-hidden rounded-lg border"><EffectivePagePreview page={page} selection={selection} /></div>
          <p className="mt-2 text-caption text-muted-foreground">Vista del contenido guardado. Los packs disponibles dependen de la oferta configurada en tu checkout.</p>
        </> : <EmptyState icon="text" title="Prepara tu página desde el chat" body="Lo que guardes aparecerá aquí listo para usar. Puedes completar solo lo que necesites y volver cuando quieras." />}
        {product.contentState === "error" ? <Notice className="mt-3" title="La publicación no terminó" body="El contenido guardado sigue disponible. Abre Publicación para ver el motivo y reintentar." /> : null}
      </section>
    </div>
    <StickyActions variant="bar" className="lg:px-8"><Button variant="primary" size="lg" block href={productHref(product.id, "publicar")} iconEnd="chevron-right">
      {product.contentState === "updated" ? "Publicar cambios" : product.contentState === "published" ? "Ver publicación" : product.contentState === "ready" ? "Publicar en mi tienda" : "Ver publicación y requisitos"}
    </Button></StickyActions>
  </div>;
}
