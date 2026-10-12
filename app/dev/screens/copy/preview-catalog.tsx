"use client";

import { useState } from "react";
import { Button, Field, SegmentedControl } from "@/components/df";
import { PREVIEWS } from "@/components/store-preview/registry";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { componentSummary } from "@/lib/copy/page-ui";
import type { StoreFacts } from "@/lib/store-preview/facts";
import { cn } from "@/lib/utils";
import type { CatalogPreviewEntry, CatalogPreviewGroup } from "./catalog-data";

function PreviewCard({ entry, facts, accent, wide }: { entry: CatalogPreviewEntry; facts: StoreFacts; accent: string | null; wide: boolean }) {
  const [index, setIndex] = useState(0);
  const example = entry.examples[index];
  const Preview = PREVIEWS[entry.id];
  return <article id={`preview-${entry.id}`} aria-labelledby={`preview-title-${entry.id}`} className="min-w-0 scroll-mt-6 overflow-hidden rounded-lg border bg-card">
    <header className="flex flex-col gap-3 border-b p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`preview-title-${entry.id}`} className="text-heading">{entry.name}</h3>
          <p className="mt-1 text-caption text-muted-foreground">{entry.description}</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-caption text-muted-foreground">{entry.kind === "block" ? "Bloque" : entry.kind === "section" ? "Sección" : "Ficha"}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-caption text-muted-foreground">{entry.id}</span>
        {entry.examples.length > 1 ? <SegmentedControl label={`Ejemplo de ${entry.name}`} options={entry.examples.map((_, i) => ({ value: String(i), label: `Ejemplo ${i + 1}` }))} value={String(index)} onChange={v => setIndex(Number(v))} /> : null}
      </div>
    </header>
    <p className="sr-only">{componentSummary(example.content)}</p>
    <div className="overflow-x-auto bg-muted p-3">
      <StoreFrame accent={accent} className={cn("mx-auto w-full overflow-hidden rounded-md border", !wide && "max-w-96")}>
        <div className={entry.kind === "block" ? "p-4" : undefined}>
          <Preview key={index} content={example.content} facts={facts} images={example.images} />
        </div>
      </StoreFrame>
    </div>
  </article>;
}

export function PreviewCatalog({ entries, groups: catalogGroups, facts, accent }: { entries: CatalogPreviewEntry[]; groups: readonly CatalogPreviewGroup[]; facts: StoreFacts; accent: string | null }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [layout, setLayout] = useState("grid");
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const term = normalize(query.trim());
  const visible = entries.filter(entry => (kind === "all" || entry.kind === kind) && normalize(`${entry.name} ${entry.id} ${entry.description}`).includes(term));
  const groups = catalogGroups.map(group => ({ ...group, entries: visible.filter(entry => entry.group === group.id) })).filter(group => group.entries.length);
  const blocks = entries.filter(entry => entry.kind === "block").length;
  const sections = entries.filter(entry => entry.kind === "section").length;
  const wide = layout === "wide";

  return <div className="mx-auto flex max-w-360 flex-col gap-6 px-4 py-6 lg:px-8">
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption text-muted-foreground">Catálogo del tema Shopify</p>
          <h1 className="mt-1 text-title lg:text-display">Componentes de la tienda</h1>
        </div>
        <Button href="/dev/screens/copy?state=done&view=screen" variant="ghost" icon="edit">Ver pantalla de edición</Button>
      </div>
      <p className="text-body text-muted-foreground">Todos los previews desplegados, con su altura completa. Textos, cifras y medios de ejemplo; el diseño usa los componentes y estilos de la tienda.</p>
      <p className="text-caption text-muted-foreground"><span className="tabular-nums">{blocks + sections}</span> componentes · <span className="tabular-nums">{blocks}</span> bloques · <span className="tabular-nums">{sections}</span> secciones · 1 ficha</p>
    </header>

    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-end">
      <Field label="Buscar componente" type="search" placeholder="Nombre o descripción" value={query} onValueChange={setQuery} className="min-w-0 flex-1" />
      <div className="flex flex-col gap-2">
        <span className="text-label">Tipo</span>
        <SegmentedControl label="Filtrar componentes por tipo" value={kind} onChange={setKind} options={[{ value: "all", label: "Todos" }, { value: "block", label: "Bloques", count: blocks }, { value: "section", label: "Secciones", count: sections }]} block />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label">Vista</span>
        <SegmentedControl label="Ancho de los previews" value={layout} onChange={setLayout} options={[{ value: "grid", label: "Cuadrícula" }, { value: "wide", label: "Ancho completo" }]} block />
      </div>
    </div>

    {groups.length ? <nav aria-label="Categorías de componentes" className="flex flex-wrap gap-2">
      {groups.map(group => <a key={group.id} href={`#catalog-${group.id}`} className="inline-flex min-h-touch items-center gap-2 rounded-md border px-3 py-2 text-label text-primary hover:bg-primary-soft">
        {group.title}<span className="tabular-nums text-caption text-muted-foreground">{group.entries.length}</span>
      </a>)}
    </nav> : null}

    <p role="status" className="text-caption text-muted-foreground">{visible.length} de {entries.length} previews visibles</p>
    {groups.map(group => <section id={`catalog-${group.id}`} key={group.id} aria-labelledby={`catalog-title-${group.id}`} className="scroll-mt-6">
      <header className="mb-4">
        <div className="flex items-center gap-2"><h2 id={`catalog-title-${group.id}`} className="text-title">{group.title}</h2><span className="tabular-nums text-caption text-muted-foreground">{group.entries.length}</span></div>
        <p className="mt-1 text-body text-muted-foreground">{group.description}</p>
      </header>
      <div className={cn("grid items-start gap-4", !wide && group.id !== "listing" && "lg:grid-cols-2")}>
        {group.entries.map(entry => <PreviewCard key={entry.id} entry={entry} facts={facts} accent={accent} wide={wide} />)}
      </div>
    </section>)}
    {!visible.length ? <div className="rounded-lg border bg-card p-6"><h2 className="text-heading">No hay componentes con esa búsqueda</h2><p className="mt-1 text-body text-muted-foreground">Prueba otro nombre o elige Todos.</p><Button className="mt-4" onClick={() => { setQuery(""); setKind("all"); }}>Mostrar todos</Button></div> : null}
  </div>;
}
