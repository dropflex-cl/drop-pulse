"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Notice, Switch, notify } from "@/components/df";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { componentName } from "@/lib/copy/page-ui";
import { contentVariants, selectVariant, landingSelections, type LandingSelection } from "@/lib/copy/variants";
import { isEmptyContent } from "@/lib/copy/page-schema";
import { effectivePage, effectiveVariant, pageSelections } from "@/lib/products/effective-page";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { ImagePick, ProductCopy } from "@/lib/types";
import { PageAccent } from "./page-accent";
import { ComponentEditor } from "./page/component-editor";
import { EffectivePagePreview } from "./page/effective-page-preview";
import { LandingVariantPicker } from "./page/landing-variant-picker";
import { PersuasionWorkbench } from "./page/persuasion-workbench";

export function CopyScreen({ data }: { data: ProductCopy }) {
  const router = useRouter(), desktop = useDesktop();
  const variants = data.page ? pageSelections(data.page.input) : landingSelections(data.components.map(c => c.content));
  const [selection, setSelection] = useState<LandingSelection>(variants[0] ?? {});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [accent, setAccent] = useState(data.accent);
  const editingView = data.components.find(c => c.component === editing);
  const resolved = data.page ? effectivePage(data.page.input, selection) : null;
  const effectiveIds = resolved?.components.map(c => c.id) ?? [];
  const rows = [...data.components.filter(c => c.component === "listing"),
    ...effectiveIds.flatMap(id => data.components.filter(c => c.component === id)),
    ...data.components.filter(c => c.component !== "listing" && !effectiveIds.includes(c.component))].filter(c => contentVariants(c.content).some(v => !isEmptyContent(v.content)));
  async function update(component: string, patch: { content?: unknown; images?: ImagePick[]; enabled?: boolean; expected_id?: string; expected_updated_at?: string }) {
    setBusy(component); setError(undefined);
    const row = data.components.find(c => c.component === component);
    try {
      await productsApi.updateComponent(data.product.id, component, { expected_id: row?.id, expected_updated_at: row?.updatedAt, ...patch });
      notify(patch.enabled === false ? "Sección oculta" : "Cambio guardado");
      setEditing(null); router.refresh();
    } catch (e) { setError(e instanceof ProductApiClientError ? e.message : "No pudimos guardar. Intenta de nuevo."); }
    finally { setBusy(null); }
  }
  return <div className="@container">
    <div className="grid gap-6 px-4 py-4 lg:px-8 lg:py-6 @4xl:grid-cols-2">
      <section aria-labelledby="saved-page" className="flex min-w-0 flex-col gap-4">
        <div><h2 id="saved-page" className="text-title">Página del producto</h2><p className="mt-1 text-body text-muted-foreground">Ajusta el contenido guardado. Publica cuando quieras mostrar los cambios en tu tienda.</p></div>
        {variants.length > 1 ? <LandingVariantPicker variants={variants} selection={selection} onChange={setSelection} /> : null}
        {rows.length ? <div className="flex flex-col gap-3">{rows.map(row => {
          const selected = data.page ? effectiveVariant(data.page.input, row.component, row.content, selection) : selectVariant(row.content, selection);
          return <article key={row.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-heading">{componentName(row.component)}</h3><Button size="sm" variant="ghost" icon="edit" onClick={() => { setError(undefined); setEditing(row.component); }}>Editar</Button></div>
            {row.component === "listing" ? <p className="mt-2 text-body">{(selected.content as { title?: string; short_description?: string })?.title}</p> : null}
            <p className="mt-1 text-caption text-muted-foreground">{row.edited ? "Última versión editada por ti" : "Contenido guardado"}{row.enabled ? effectiveIds.includes(row.component) || row.component === "listing" ? " · En esta versión" : " · Fuera de esta versión" : " · Oculto"}</p>
            {row.component !== "listing" ? <Switch className="mt-3" label="Mostrar en la página" hint="Se aplica a todas las versiones. Ocultar conserva el contenido." checked={row.enabled} disabled={Boolean(busy)} onChange={enabled => update(row.component, { enabled })} /> : null}
            {row.edited && row.chatContent ? <Button className="mt-3" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => void update(row.component, { content: row.chatContent })}>Usar el texto del chat</Button> : null}
          </article>;
        })}</div> : <EmptyState icon="text" title="Sin página guardada" body="Prepara los textos en el chat. Aparecerán aquí cuando los guardes." />}
        {data.pdp?.experiences.length ? <details className="rounded-lg border bg-card p-4"><summary className="min-h-touch cursor-pointer text-label">Ajustar versiones y orden de la página</summary><PersuasionWorkbench initial={data.pdp} data={data} /></details> : null}
        <details className="rounded-lg border bg-card p-4"><summary className="min-h-touch cursor-pointer text-label">Cambiar color de la página</summary><PageAccent productId={data.product.id} initial={data.accent} onSaved={value => { setAccent(value); router.refresh(); }} /></details>
        <Button href={productHref(data.product.id, "imagenes")} icon="image">Cambiar portada y galería</Button>
      </section>
      <section aria-labelledby="page-preview" className="min-w-0">
        <h2 id="page-preview" className="mb-3 text-heading">Vista previa</h2>
        {data.page && data.components.some(c => c.component === "listing") ? <div className="overflow-hidden rounded-lg border"><EffectivePagePreview page={data.page} selection={selection} accent={accent} /></div> : <Notice tone="info" icon="text" title="La página aparecerá aquí" body="Puedes guardar el contenido por partes desde el chat." />}
      </section>
    </div>
    {error && !editingView ? <p role="alert" className="px-4 pb-4 text-body text-destructive">{error}</p> : null}
    <StickyActions variant="bar" className="lg:px-8"><Button variant="primary" size="lg" block href={productHref(data.product.id, "publicar")} iconEnd="chevron-right">Ver publicación</Button></StickyActions>
    <Drawer open={Boolean(editingView)} onOpenChange={open => !open && setEditing(null)} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
      <DrawerContent className="h-[92svh] lg:h-auto lg:w-[min(--spacing(160),100vw)] lg:max-w-none">
        {editingView ? <ComponentEditor key={`${editingView.id}:${selection.angle_id}:${selection.hook_id}`} selection={data.page ? effectiveVariant(data.page.input, editingView.component, editingView.content, selection) : selection} view={editingView} facts={data.page?.facts ?? data.facts} accent={accent} catalog={data.images} videos={data.videos}
          imagesHref={productHref(data.product.id, "imagenes")} saving={busy === editingView.component} error={error} onCancel={() => setEditing(null)} onSave={patch => update(editingView.component, patch)} /> : null}
      </DrawerContent>
    </Drawer>
  </div>;
}
