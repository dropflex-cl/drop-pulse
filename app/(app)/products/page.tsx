import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon, ProductRow, rowClasses } from "@/components/df";
import { SyncProductsButton } from "@/components/screens/actions";
import { UrlFilter } from "@/components/screens/filters";
import { UpsellItem } from "@/components/screens/upsell-item";
import { EmptyState, Group, PageHeader } from "@/components/shell/page-header";
import { RowsSkeleton } from "@/components/shell/skeletons";
import { getProductCounts, getProducts } from "@/lib/data/products";
import { FILTER_PARAM, filterFromParam, productHref } from "@/lib/routes";
import type { ProductFilter } from "@/lib/types";

export const metadata: Metadata = { title: "Productos" };

const FILTERS: ProductFilter[] = ["avanzan", "detenidos", "publicados"];
const LABEL: Record<ProductFilter, string> = { avanzan: "Guardados", detenidos: "Con error", publicados: "Publicados" };
const EMPTY: Record<ProductFilter, { title: string; text: string }> = {
  avanzan: { title: "Sin productos guardados", text: "Sincroniza tu tienda para ver tus productos. El contenido que prepares desde el chat aparecerá en su ficha." },
  detenidos: { title: "Sin errores de publicación", text: "Aquí aparecen los productos cuya publicación necesita atención." },
  publicados: { title: "Aún no publicas productos", text: "Abre un producto para ver su página guardada y publicarla en tu tienda." },
};

async function ProductList({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: param } = await searchParams;
  const filter: ProductFilter = filterFromParam(param) ?? "avanzan";
  const [products, counts] = await Promise.all([getProducts(filter), getProductCounts()]);

  return (
    <>
      <div className="px-4 pb-2 lg:px-0 lg:pb-4">
        <UrlFilter
          block
          param="filter"
          value={FILTER_PARAM[filter]}
          label="Filtrar productos"
          className="lg:inline-flex lg:w-auto"
          options={FILTERS.map((f) => ({ value: FILTER_PARAM[f], label: LABEL[f], count: counts[f] }))}
        />
      </div>
      {products.length === 0 ? (
        <EmptyState icon={<Icon name="box" />} title={EMPTY[filter].title}>
          {EMPTY[filter].text}
        </EmptyState>
      ) : (
        <ul
          aria-label={`Productos: ${LABEL[filter].toLowerCase()}`}
          className="mx-4 grid grid-cols-1 overflow-hidden rounded-lg border bg-card md:grid-cols-2 lg:mx-0 lg:grid-cols-1"
        >
          {products.map((p) => (
            <UpsellItem key={p.id} id={p.id} name={p.name} upsell={false} className="border-t first:border-t-0 md:max-lg:nth-2:border-t-0 md:max-lg:odd:border-r">
              <ProductRow
                name={p.name}
                image={p.image}
                tone={p.tone}
                reason={p.reason}
                href={productHref(p.id)}
                end={<span aria-hidden className="block w-6" />}
              />
            </UpsellItem>
          ))}
        </ul>
      )}
      {counts.upsell ? (
        <Group className="mt-4">
          <Link href="/products/upsell" className={rowClasses}>
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
              <Icon name="tag" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-row">Upsell del checkout</span>
              <span className="truncate text-caption text-muted-foreground">No se optimizan ni aparecen en Hoy</span>
            </span>
            <span className="text-label text-muted-foreground tabular-nums">{counts.upsell}</span>
            <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
          </Link>
        </Group>
      ) : null}
    </>
  );
}

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const counts = await getProductCounts();
  return (
    <>
      <PageHeader
        large
        title="Productos"
        subtitle={`${counts.total} productos`}
        actions={<SyncProductsButton />}
      />
      <div className="pb-6 lg:max-w-content lg:px-8 lg:py-6">
        <Suspense fallback={<RowsSkeleton rows={3} className="mt-12" />}>
          <ProductList searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
