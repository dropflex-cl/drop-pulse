// Landing de DropFlex (design-system/landing.md): AIDA con piezas reales de la app como prueba.
// Pantallas de referencia: PantallasLandingEscritorio1/2 y PantallasLandingMovil del design system.
// Las demos son datos de ejemplo del Corrector de postura: ilustran, no prometen resultados.
import { AiCostCard } from "@/components/df/ai-cost-card";
import { AngleCard } from "@/components/df/angle-card";
import { AttentionItem } from "@/components/df/attention-item";
import { Button } from "@/components/df/button";
import { ConnectionCard } from "@/components/df/connection-card";
import { DecisionRow } from "@/components/df/decision-row";
import { Icon, type IconName } from "@/components/df/icon";
import { PriceBreakdown } from "@/components/df/price-breakdown";
import { ReviewCard } from "@/components/df/review-card";
import { RuleGroup } from "@/components/df/rule-group";
import { RuleRow } from "@/components/df/rule-row";
import { StatusBadge, type ContentStatus } from "@/components/df/status-badge";
import { TopBar } from "@/components/df/top-bar";
import { productImage } from "@/lib/mock/images";
import { cn } from "@/lib/utils";
import {
  Brand,
  Eyebrow,
  Lead,
  LpCta,
  LpFaq,
  LpFeature,
  LpNav,
  LpPain,
  LpSection,
  LpSectionHead,
  LpStep,
  SIGNUP_HREF,
  gutter,
} from "./parts";

const PAINS: { icon: IconName; title: string; text: string }[] = [
  { icon: "text", title: "Textos del proveedor", text: "Títulos eternos y descripciones traducidas a medias." },
  { icon: "image", title: "Fotos que no venden", text: "Imágenes con texto en chino y ninguna del producto en uso." },
  { icon: "tag", title: "Precio a ojo", text: "Sin contar envío, anuncios ni pedidos que no se entregan." },
  { icon: "megaphone", title: "Anuncios que queman plata", text: "Apagas tarde lo que pierde y escalas tarde lo que gana." },
];

const FAQ = [
  {
    q: "¿Necesito saber de diseño o de copywriting?",
    a: "No. La IA propone textos, imágenes y anuncios; tú aceptas, editas o descartas cada uno con un toque.",
    open: true,
  },
  {
    q: "¿La IA inventa reseñas, expertos o garantías?",
    a: "No. Si no hay reseñas reales o un experto real, no los inventa: baja el puntaje del ángulo que los necesita y te dice qué falta.",
  },
  {
    q: "¿Qué pasa con mis productos actuales en Shopify?",
    a: "Nada cambia en tu tienda hasta que apruebes. Si descartas una propuesta, se mantiene lo que ya tenías.",
  },
  {
    q: "¿Sirve si todavía no anuncio en Meta?",
    a: "Sí. Solo Shopify es obligatorio; Meta Ads lo conectas cuando quieras lanzar campañas.",
  },
  {
    q: "¿Funciona con pago contra entrega?",
    a: "Está hecho para eso: calcula tu ganancia con la tasa de entrega real y cada página incluye “Paga al recibir”.",
  },
  {
    q: "¿Cuánto gasto en IA por producto?",
    a: "Lo ves en cada producto, por etapa y antes de regenerar, con un tope que tú defines.",
  },
];

const TRUST = ["Nada se publica sin tu OK", "Shopify y Meta Ads", "Pensado para LATAM"];
const BADGES: ContentStatus[] = ["generado", "revision", "aprobado", "publicado"];

/** El teléfono del hero: la pantalla Hoy real con datos de ejemplo. */
function HeroPhone() {
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none mx-auto w-85 max-w-full overflow-hidden rounded-device border border-border bg-background pb-4 shadow-md lg:w-95 lg:-rotate-[1.5deg] motion-reduce:rotate-0"
    >
      <div className="flex justify-between px-5 pt-3 pb-1 text-label font-semibold">
        <span>9:41</span>
        <span>●●● 5G</span>
      </div>
      <TopBar title="Hoy" subtitle="3 decisiones pendientes" large />
      <div className="mx-4 overflow-hidden rounded-lg border border-border bg-card [&>*+*]:border-t [&>*+*]:border-border">
        <AttentionItem
          kind="review"
          title="8 propuestas nuevas"
          product="Corrector de postura"
          actions={
            <Button size="sm" variant="primary" iconEnd="chevron-right">
              Revisar ahora
            </Button>
          }
        />
        <AttentionItem kind="ads-up" title="Sube “Corrector · Video UGC”" product="CPA $4.100, bajo tu límite" />
        <AttentionItem kind="ads" title="Apaga “Masajeador · Video 2”" product="Gastó 1,5× tu límite sin ventas" />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section>
      <div
        className={cn(
          "mx-auto grid max-w-landing grid-cols-[minmax(0,1fr)] gap-8 pt-8 pb-12",
          "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-24",
          gutter,
        )}
      >
        <div className="flex min-w-0 flex-col gap-5">
          <Eyebrow>Para dropshipping con pago contra entrega</Eyebrow>
          <h1 className="m-0 text-hero-sm text-balance lg:text-hero">Tus productos listos para vender, sin pasar días preparándolos</h1>
          <Lead>
            Conecta tu Shopify: la IA prepara textos, imágenes y anuncios para cada producto, y tú decides qué se publica. Todo desde
            el teléfono.
          </Lead>
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
            <Button href={SIGNUP_HREF} variant="primary" size="lg" iconEnd="chevron-right" className="max-lg:w-full">
              Conectar mi tienda
            </Button>
            <Button href="#como-funciona" variant="ghost" size="lg" className="max-lg:w-full">
              Ver cómo funciona
            </Button>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
            {TRUST.map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5 text-label font-normal text-muted-foreground">
                <Icon name="check" size="sm" strokeWidth={2.25} className="text-success" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPhone />
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="text-foreground">
      <LpNav />
      <main>
        {/* Atención */}
        <Hero />

        {/* Interés: el problema */}
        <LpSection muted>
          <LpSectionHead
            eyebrow="El problema"
            title="El producto no es el problema. Es todo lo que falta antes de venderlo."
            lead="Cada producto nuevo te pide horas de trabajo que no tienes, y cada error lo pagas en anuncios."
          />
          <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0 lg:grid-cols-4 lg:gap-4">
            {PAINS.map((p) => (
              <LpPain key={p.title} {...p} />
            ))}
          </ul>
        </LpSection>

        {/* Interés: cómo funciona */}
        <LpSection id="como-funciona">
          <LpSectionHead
            eyebrow="Cómo funciona"
            title="De producto importado a campaña, en una sola ruta"
            lead="La IA hace el trabajo pesado. Tú revisas y decides."
          />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-8">
            <LpStep n={1} title="Conecta tu tienda" text="Traemos tus productos de Shopify y te recomendamos con cuáles empezar.">
              <ConnectionCard
                provider="shopify"
                state="importing"
                account="mitienda.myshopify.com"
                progress={0.67}
                detail="86 de 128 productos importados"
              />
            </LpStep>
            <LpStep n={2} title="La IA elige cómo venderlo" text="Evalúa 6 ángulos de venta con tu cliente ideal y te explica por qué.">
              <AngleCard
                rank={1}
                name="Problema → solución"
                score={84}
                role="principal"
                suggestedRole="principal"
                fit="Tu cliente ya siente el dolor de espalda al trabajar sentado."
                hideActions
              />
            </LpStep>
            <LpStep n={3} title="Tú apruebas cada texto e imagen" text="Aceptar, editar o descartar: un toque por propuesta.">
              <ReviewCard
                field="Título del producto"
                original="Corrector Postura Espalda Ajustable Unisex Talla Única"
                originalLabel="Hoy en Shopify"
                proposal="Corrector de postura ajustable para trabajar sentado sin dolor de espalda"
                angle="primary"
                hideActions
              />
            </LpStep>
            <LpStep n={4} title="Lanza y deja que el motor vigile" text="Te dice cuándo esperar, pausar o escalar, con la cifra que lo justifica.">
              <DecisionRow
                decision="escalar"
                name="Conjunto 1 · Video UGC"
                image={productImage(1)}
                metrics="Gasto $28.400 · 7 ventas"
                reason="CPA 32% bajo tu límite por 3 días."
              />
            </LpStep>
          </div>
        </LpSection>

        {/* Deseo: beneficios */}
        <LpSection id="beneficios" muted>
          <LpSectionHead eyebrow="Beneficios" title="Decides con números, no a ojo" lead="Cada pantalla te dice qué hacer y por qué." />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:gap-6">
            <LpFeature
              icon="tag"
              title="Sabes cuánto ganas antes de vender"
              text="Con tu envío, tu costo por venta y los pedidos que no se entregan."
            >
              <div className="rounded-lg border border-border bg-card p-4">
                <PriceBreakdown
                  price={24990}
                  parts={[
                    { label: "Costo del producto", value: 6900 },
                    { label: "Envío", value: 3500 },
                    { label: "Publicidad por venta", value: 6000 },
                  ]}
                />
              </div>
            </LpFeature>
            <LpFeature
              icon="trend"
              title="Anuncios que se cuidan solos"
              text="Reglas simples para esperar, pausar o escalar. Tú eliges si solo recomienda o actúa."
            >
              <RuleGroup kind="pause" level="Por conjunto">
                <RuleRow
                  enabled
                  sentence="Si gasta 1,5× el CPA límite sin ventas"
                  parts={[
                    "Si gasta ",
                    { kind: "select", label: "Multiplicador", value: "1.5", options: [{ value: "1.5", label: "1,5×" }] },
                    " el CPA límite ",
                    { kind: "select", label: "Condición", value: "none", options: [{ value: "none", label: "sin ventas" }] },
                  ]}
                />
              </RuleGroup>
            </LpFeature>
            <LpFeature
              icon="shield"
              title="Nada se publica sin tu OK"
              text="Cada texto, imagen y campaña pasa por ti. La IA no inventa reseñas ni expertos."
            >
              <div className="flex flex-wrap items-center gap-2">
                {BADGES.map((s) => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
            </LpFeature>
            <LpFeature icon="sparkle" title="El costo de IA, a la vista" text="Cuánto costó cada producto y un tope que tú defines.">
              <AiCostCard compact total={387} totalUsd={0.41} generations={9} cap={1500} />
            </LpFeature>
          </div>
        </LpSection>

        {/* Deseo: preguntas */}
        <LpSection id="preguntas">
          <LpSectionHead eyebrow="Preguntas" title="Lo que nos preguntan antes de empezar" />
          <div className="flex max-w-faq flex-col border-t border-border">
            {FAQ.map((f) => (
              <LpFaq key={f.q} {...f} />
            ))}
          </div>
        </LpSection>

        {/* Móvil: la acción acompaña el recorrido y se queda antes del cierre, que repite la misma. */}
        <div className="sticky bottom-0 z-sticky border-t border-border bg-background px-4 py-3 shadow-md lg:hidden">
          <div className="pb-safe">
            <Button href={SIGNUP_HREF} variant="primary" size="lg" block>
              Conectar mi tienda
            </Button>
          </div>
        </div>

        {/* Acción */}
        <LpCta
          title="Conecta tu tienda y revisa tu primer producto mejorado hoy"
          lead="Tarda unos 5 minutos. Empiezas con los productos que ya tienes en Shopify."
          cta="Conectar mi tienda"
          fine="Nada se publica en tu tienda ni en Meta sin tu aprobación."
        />
      </main>
      <footer
        className={cn(
          "mx-auto flex max-w-landing flex-wrap items-center justify-between gap-4 py-6 text-label font-normal text-muted-foreground lg:py-8",
          gutter,
        )}
      >
        <Brand />
        <span>Términos · Privacidad · Contacto</span>
      </footer>
    </div>
  );
}
