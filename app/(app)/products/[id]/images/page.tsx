import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Icon, TopBar } from "@/components/df";
import { ImagePicker } from "@/components/screens/image-picker";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { EmptyState } from "@/components/shell/page-header";
import { getProduct, getProductImages } from "@/lib/data/products";

export const metadata: Metadata = { title: "Imágenes" };

export default async function ImagenesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, images] = await Promise.all([getProduct(id), getProductImages(id)]);
  if (!product) notFound();
  const chosen = images.filter((i) => i.status === "selected").length;

  return (
    <>
      <AssistantScope productId={product.id} product={product.name} stage="Imágenes" stageKey="imagenes" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title="Imágenes"
        subtitle={chosen ? `${chosen} elegidas · la 1 es la portada` : "Elige y ordena 4 a 6"}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      {images.length ? (
        <div className="px-4 pb-4 lg:max-w-240 lg:px-8 lg:py-6">
          <ImagePicker images={images} />
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="image" />}
          title="La IA está generando las imágenes"
          action={<Button href={`/products/${product.id}`}>Volver a la ruta</Button>}
        >
          Te avisamos en Hoy cuando haya opciones para elegir.
        </EmptyState>
      )}
    </>
  );
}
