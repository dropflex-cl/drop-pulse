import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconButton, Thumb } from "@/components/df";
import { AssistantButton } from "@/components/shell/assistant-provider";
import { ProductNavigation } from "@/components/screens/product-navigation";
import { AiCostButton, AiCostProvider } from "@/components/shell/ai-cost-provider";
import { getProductAiCost } from "@/lib/data/ai-costs";
import { getProduct } from "@/lib/data/products";

export default async function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const product = await getProduct((await params).id);
  if (!product) notFound();
  const cost = getProductAiCost(product.id).catch(() => null);
  return <AiCostProvider cost={cost}>
    <header className="flex items-center gap-3 border-b px-4 py-3 lg:px-8">
      <IconButton icon="chevron-left" label="Volver a Productos" href="/products" />
      {product.image ? <Thumb src={product.image} /> : null}
      <div className="min-w-0 flex-1"><h1 className="truncate text-heading lg:text-display">{product.name}</h1></div>
      <AiCostButton /><AssistantButton />
    </header>
    <Suspense fallback={<div className="h-control border-b" />}><ProductNavigation id={product.id} /></Suspense>
    {children}
  </AiCostProvider>;
}
