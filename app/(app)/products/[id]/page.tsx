import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductOverviewScreen } from "@/components/screens/product-overview";
import { getProduct, getProductOverview } from "@/lib/data/products";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const product = await getProduct((await params).id);
  return { title: product?.name ?? "Producto" };
}
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getProductOverview((await params).id);
  if (!data) notFound();
  return <ProductOverviewScreen data={data} />;
}
