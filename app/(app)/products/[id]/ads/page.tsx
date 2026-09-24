import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdsScreen } from "@/components/screens/ads";
import { getProductAds } from "@/lib/data/ads";

export const metadata: Metadata = { title: "Anuncios" };

/**
 * Etapa Anuncios (PantallasAnuncios1 y PantallasAnunciosEscritorio1, docs/spec-anuncios.md §7): con la
 * página del producto lista y Meta conectado, el configurador arma una campaña ABO o CBO desde una
 * plantilla editable y la crea en pausa.
 */
export default async function AdsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ads = await getProductAds(id);
  if (!ads) notFound();
  return <AdsScreen data={ads} />;
}
