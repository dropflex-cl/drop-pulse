import type { Metadata } from "next";
import { Suspense } from "react";
import { Button, CampaignCard, Icon, IconButton } from "@/components/df";
import { UrlFilter } from "@/components/screens/filters";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/shell/skeletons";
import { getCampaignSummary, getCampaigns, type CampaignPeriod } from "@/lib/data/campaigns";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Campañas" };

const PERIODS = [
  { value: "today", label: "Hoy" },
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
];

async function Period({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = "7" } = await searchParams;
  return <UrlFilter param="period" value={period} options={PERIODS} label="Periodo" />;
}

const toPeriod = (p?: string): CampaignPeriod => (p === "today" || p === "30" ? p : "7");

async function CampaignList({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = toPeriod((await searchParams).period);
  const campaigns = await getCampaigns(period);
  if (!campaigns.length) {
    return (
      <EmptyState icon={<Icon name="megaphone" />} title="Aún no tienes campañas">
        Con la página del producto lista, lánzala desde la etapa Anuncios del producto.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 px-4 md:grid-cols-2 lg:gap-4 lg:px-0">
      {campaigns.map((c) => (
        <li key={c.id}>
          <CampaignCard
            name={c.name}
            image={c.image}
            verdict={c.verdict}
            reason={c.reason}
            meta={c.meta}
            paused={c.paused}
            metrics={c.metrics}
            wide
            href={`/campaigns/${c.id}`}
            menu={<IconButton icon="chevron-right" label={`Ver ${c.name}`} href={`/campaigns/${c.id}`} />}
            actions={
              c.verdict === "subir" || c.verdict === "apagar"
                ? [
                    <Button key="a" href={`/campaigns/${c.id}`}>
                      Ver detalle
                    </Button>,
                    // La decisión se aplica en el detalle, con la regla y la cifra a la vista.
                    <Button key="b" variant={c.verdict === "subir" ? "primary" : "destructive"} icon={c.verdict === "subir" ? "arrow-up" : "pause"} href={`/campaigns/${c.id}`}>
                      {c.verdict === "subir" ? `Subir a ${c.nextBudget}` : "Pausar"}
                    </Button>,
                  ]
                : null
            }
            className="h-full"
          />
        </li>
      ))}
    </ul>
  );
}

const PERIOD_LABEL: Record<CampaignPeriod, string> = { today: "Hoy", "7": "Últimos 7 días", "30": "Últimos 30 días" };

async function Header({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = toPeriod((await searchParams).period);
  const summary = await getCampaignSummary(period);
  const subtitle = `${PERIOD_LABEL[period]} · gasto ${money(summary.spend, summary.currency)}`;
  return (
    <PageHeader
      large
      title="Campañas"
      subtitle={subtitle}
      desktopSubtitle={`${subtitle} · ${summary.confirmedSales === 1 ? "1 venta" : `${summary.confirmedSales} ventas`}`}
      desktopActions={
        <Suspense fallback={<Skeleton className="h-9.5 w-60" />}>
          <Period searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

export default function CampanasPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  return (
    <>
      <Suspense fallback={<PageHeader large title="Campañas" />}>
        <Header searchParams={searchParams} />
      </Suspense>
      <div className="pb-6 lg:px-8 lg:py-6">
        <Suspense
          fallback={
            <div className="grid gap-3 px-4 md:grid-cols-2 lg:px-0">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          }
        >
          <CampaignList searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
