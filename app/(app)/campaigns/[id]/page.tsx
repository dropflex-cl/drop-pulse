import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { CampaignScreen } from "@/components/screens/campaign";
import { getCampaignDetail } from "@/lib/data/campaigns";
import { money } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const campaign = await getCampaignDetail((await params).id);
  return { title: campaign?.name ?? "Campaña" };
}

/**
 * Una campaña creada desde la etapa Anuncios (PantallasAnuncios2 y AnunciosEscritorio2): lo que decidió
 * el motor por conjunto o anuncio, sus cifras y gráficos, sus reglas y el historial de cambios.
 */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCampaignDetail(id);
  if (!c) notFound();
  const units = c.structure === "abo" ? `${c.units.length} ${c.units.length === 1 ? "conjunto" : "conjuntos"}` : `${c.units.length} ${c.units.length === 1 ? "anuncio" : "anuncios"}`;
  const day = c.publishedAt ? `día ${Math.max(1, Math.ceil((Date.now() - Date.parse(c.publishedAt)) / 86_400_000))}` : "sin publicar";
  const mode = c.engine.mode === "auto" ? "automático" : "solo recomendar";
  const subtitle = `${c.structure.toUpperCase()} · ${units} · ${day} · ${mode}`;
  return (
    <>
      <PageHeader
        back="Campañas"
        backHref="/campaigns"
        title={c.name}
        subtitle={subtitle}
        desktopSubtitle={`${subtitle} · gasto ${money(c.totals.spend, c.currency)} · ${c.totals.purchases === 1 ? "1 venta" : `${c.totals.purchases} ventas`}`}
      />
      <CampaignScreen data={c} />
    </>
  );
}
