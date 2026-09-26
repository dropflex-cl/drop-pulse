import type { Metadata } from "next";
import { Icon, ProductRow } from "@/components/df";
import { UpsellItem } from "@/components/screens/upsell-item";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { getUpsellProducts } from "@/lib/data/products";
import { productHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Upsell del checkout" };

/** Los productos que se venden como extra en el checkout: fuera de Productos y de Hoy, sin ruta. */
export default async function UpsellPage() {
  const products = await getUpsellProducts();
  return (
    <>
      <PageHeader
        title="Upsell del checkout"
        subtitle={`${products.length} ${products.length === 1 ? "producto" : "productos"}`}
        back="Productos"
        backHref="/products"
      />
      <div className="pb-6 lg:max-w-content lg:px-8 lg:py-6">
        {products.length === 0 ? (
          <EmptyState icon={<Icon name="tag" />} title="Sin productos de upsell">
            Si vendes un producto como extra en el checkout, márcalo en Productos con Más opciones › Mover a Upsell. Deja de aparecer en tus listas y en Hoy.
          </EmptyState>
        ) : (
          <>
            <p className="px-4 pt-2 pb-3 text-caption text-muted-foreground lg:px-0 lg:pt-0">
              Los vendes como extra en el checkout: no se optimizan ni aparecen en Hoy.
            </p>
            <ul aria-label="Productos de upsell" className="mx-4 grid grid-cols-1 overflow-hidden rounded-lg border bg-card md:grid-cols-2 lg:mx-0 lg:grid-cols-1">
              {products.map((p) => (
                <UpsellItem key={p.id} id={p.id} name={p.name} upsell className="border-t first:border-t-0 md:max-lg:nth-2:border-t-0 md:max-lg:odd:border-r">
                  <ProductRow name={p.name} image={p.image} href={productHref(p.id)} end={<span aria-hidden className="block w-6" />} />
                </UpsellItem>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
