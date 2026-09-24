import type { Metadata } from "next";
import { Suspense } from "react";
import { Connections } from "@/components/onboarding/connections";
import { SetupSlot } from "@/components/onboarding/setup-slot";
import { Skeleton } from "@/components/shell/skeletons";
import { LogoutButton } from "@/components/logout-button";
import { AssumptionsForm } from "@/components/screens/assumptions-form";
import { PageHeader } from "@/components/shell/page-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getAdSettings, getAssumptions, getHiggsfieldSettings, getMarketSettings } from "@/lib/data/settings";
import { HiggsfieldSettings } from "@/components/screens/higgsfield-settings";
import { AdSettings } from "@/components/screens/ad-settings";
import { MarketSettings } from "@/components/screens/market-settings";

export const metadata: Metadata = { title: "Ajustes" };

function Section({ id, title, children, description }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-4">
      <h2 id={id} className="text-heading">{title}</h2>
      {description ? <p className="mt-0.5 text-label font-normal text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AjustesPage() {
  const [assumptions, market, ads, higgsfield] = await Promise.all([getAssumptions(), getMarketSettings(), getAdSettings(), getHiggsfieldSettings()]);
  return (
    <>
      <PageHeader large title="Ajustes" subtitle="Supuestos, tienda y cuenta" back="Hoy" backHref="/today" />
      <div className="flex flex-col gap-4 px-4 pb-6 lg:max-w-content lg:px-8 lg:py-6">
        <Section
          id="supuestos"
          title="Supuestos"
          description="Hacen honestas las cifras de ganancia y los veredictos de campañas."
        >
          <AssumptionsForm initial={assumptions} />
        </Section>
        {market ? (
          <Section id="mercado" title="Dónde vendes" description="La IA escribe en este idioma y calcula en esta moneda, con pago contra entrega.">
            <MarketSettings initial={market.value} confirmed={market.confirmed} />
          </Section>
        ) : null}
        <Section id="conexiones" title="Conexiones" description="Tu tienda Shopify y tu cuenta de Meta Ads.">
          <Suspense fallback={<Skeleton className="h-40" />}>
            <div className="flex flex-col gap-3">
              <SetupSlot where="ajustes" />
              <Connections />
            </div>
          </Suspense>
        </Section>
        {higgsfield ? (
          <Section id="creativos" title="Anuncios con IA" description="Tu cuenta de Higgsfield: genera tus anuncios de imagen con tu clave y tus créditos.">
            <HiggsfieldSettings keyHint={higgsfield.keyHint} status={higgsfield.status} error={higgsfield.error} />
          </Section>
        ) : null}
        {ads ? (
          <Section id="campanas" title="Campañas" description="El tope que ninguna campaña supera y tus plantillas propias.">
            <AdSettings spendCap={ads.spendCap} currency={ads.currency} templates={ads.templates} />
          </Section>
        ) : null}
        <Section id="apariencia" title="Apariencia" description="Claro, oscuro o el mismo del teléfono.">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body">Tema</span>
            <ThemeSwitcher />
          </div>
        </Section>
        <Section id="cuenta" title="Cuenta">
          <LogoutButton />
        </Section>
      </div>
    </>
  );
}
