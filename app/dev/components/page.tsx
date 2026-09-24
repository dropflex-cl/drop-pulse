import type { Metadata } from "next";
import {
  AiCostCard,
  AiCostChip,
  AiRunList,
  AssistantSheet,
  AttentionItem,
  Button,
  CampaignCard,
  Icon,
  IconButton,
  ImageTile,
  MetricGrid,
  Navigation,
  OfferPreview,
  PriceBreakdown,
  ProductRow,
  ReviewCard,
  StageList,
  StageMeter,
  StatusBadge,
  Toast,
  TopBar,
  type ContentStatus,
  type IconName,
  type MeterStage,
} from "@/components/df";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { productImage } from "@/lib/mock/images";
import { FieldDemo, InteractiveDemo, SegmentedDemo } from "./demos";
import { OnboardingDemos } from "./onboarding";
import { Section } from "./section";

export const metadata: Metadata = { title: "Componentes" };

// Cifras de design-system/reference/bundle.js › Pantallas: costo de IA.
const AI_COST = {
  total: 387,
  totalUsd: 0.41,
  generations: 9,
  cap: 1500,
  stages: [
    { label: "Información base", cost: 127, runs: 3 },
    { label: "Ángulos", cost: 142, runs: 3 },
    { label: "Página del producto", cost: 118, runs: 3, retries: 1 },
    { label: "Creativos", cost: 0, note: "Necesita los 2 desarrollos aprobados" },
  ],
  context: "Equivale al 4,5% de lo que ganas en una venta ($8.590).",
};

const STATUSES: ContentStatus[] = ["generado", "revision", "aprobado", "rechazado", "publicando", "publicado", "error"];
const ICONS: IconName[] = [
  "sparkle", "eye", "check", "x", "loader", "check-circle", "alert", "inbox", "box", "megaphone", "chat", "lock",
  "image", "tag", "text", "store", "send", "arrow-up", "power", "undo", "edit", "search", "clock", "truck", "trend",
  "settings", "plus", "more", "chevron-right", "chevron-left",
];
const st = (s: string) => s.split(",") as MeterStage[];
const COSTS = [
  { label: "Costo del producto", value: 6900 },
  { label: "Envío", value: 3500 },
  { label: "Publicidad por venta", value: 6000 },
];

const group = "overflow-hidden rounded-lg border bg-card";

export default function ComponentesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 lg:px-6">
      <header className="flex items-center justify-between py-6">
        <div>
          <h1 className="text-display">Componentes</h1>
          <p className="text-body text-muted-foreground">components/df en todos sus estados. Referencia: design-system/screenshots/componentes.</p>
        </div>
        <ThemeSwitcher />
      </header>

      <Section id="button" title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon="check">Aceptar</Button>
          <Button>Editar</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive" icon="power">Apagar</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" iconEnd="chevron-right">Continuar: Imágenes</Button>
          <Button variant="primary" loading>Publicando</Button>
          <Button variant="primary" disabled>Publicar</Button>
          <Button size="sm" icon="sparkle">Generar más</Button>
          <Button icon="check" kbd="A">Con atajo</Button>
        </div>
      </Section>

      <Section id="icon-button" title="IconButton">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton icon="chevron-left" label="Volver" />
          <IconButton icon="search" label="Buscar" />
          <IconButton icon="sparkle" label="Abrir asistente" />
          <IconButton icon="more" label="Más opciones" />
          <IconButton icon="plus" label="Nuevo producto" variant="primary" />
        </div>
      </Section>

      <Section id="icon" title="Icon">
        <div className="flex flex-wrap gap-4.5">
          {ICONS.map((n) => (
            <span key={n} title={n} className="inline-flex">
              <Icon name={n} label={n} />
            </span>
          ))}
        </div>
      </Section>

      <Section id="status-badge" title="StatusBadge">
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
        </div>
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((s) => <StatusBadge key={s} status={s} size="sm" />)}
        </div>
      </Section>

      <Section id="stage-meter" title="StageMeter">
        <div className="flex max-w-80 flex-col gap-3">
          {[
            ["done,done,done,done,done,optional", "Listo para publicar"],
            ["done,current,locked,locked,locked,optional", "Avanza"],
            ["done,done,done,stuck,locked,optional", "Detenido"],
            ["done,done,done,done,error,optional", "Con error"],
          ].map(([s, label]) => (
            <div key={label} className="grid grid-cols-2 items-center gap-3 text-caption text-muted-foreground">
              {label}
              <StageMeter stages={st(s)} />
            </div>
          ))}
        </div>
      </Section>

      <Section id="product-row" title="ProductRow">
        <div className={`${group} max-w-md`}>
          <ProductRow name="Lámpara lunar 3D" image={productImage(2)} stages={st("done,done,done,done,error,optional")} tone="danger" reason="Error al publicar · 2 imágenes" href="#" />
          <ProductRow name="Corrector de postura" image={productImage(1)} stages={st("done,current,locked,locked,locked,optional")} tone="warning" reason="Espera tu revisión · 8 textos" href="#" />
          <ProductRow name="Botella térmica 1L" image={productImage(0)} stages={st("done,done,done,stuck,locked,optional")} tone="warning" reason="Detenido: falta el precio · 3 días" href="#" />
          <ProductRow name="Masajeador de cuello" image={productImage(4)} stages={st("done,done,done,done,done,done")} tone="success" reason="Publicado · 2 campañas activas" href="#" />
        </div>
      </Section>

      <Section id="attention-item" title="AttentionItem">
        <div className={`${group} max-w-md`}>
          <AttentionItem kind="error" title="No se pudo publicar en tu tienda" product="Lámpara lunar 3D" detail="Shopify rechazó 2 imágenes por tamaño." actions={<><Button size="sm" variant="primary">Reintentar</Button><Button size="sm" variant="ghost">Ver detalle</Button></>} />
          <AttentionItem kind="review" title="8 propuestas nuevas" product="Corrector de postura" actions={<Button size="sm" iconEnd="chevron-right">Revisar ahora</Button>} />
          <AttentionItem kind="ads-up" title="Sube “Corrector · Video UGC”" product="Campaña · 3 días" detail="CPA $4.100, 32% bajo tu límite." />
          <AttentionItem kind="stuck" title="Falta definir el precio" product="Botella térmica 1L · detenido hace 3 días" />
        </div>
      </Section>

      <Section id="stage-list" title="StageList">
        <div className="max-w-md pt-2">
          <StageList
            stages={[
              { title: "Producto importado", state: "done", desc: "Proveedor · costo $6.900", href: "#" },
              { title: "Textos", state: "review", desc: "8 propuestas esperan tu revisión", href: "#" },
              { title: "Imágenes", state: "current", desc: "Elige y ordena 4 a 6", href: "#" },
              { title: "Precio y oferta", state: "available", desc: "Calcula cuánto ganas", href: "#" },
              { title: "Publicar en tu tienda", state: "error", desc: "Shopify rechazó 2 imágenes", href: "#" },
              { title: "Anuncios", state: "locked", optional: true, desc: "Se habilita al publicar" },
              { title: "Video corto", state: "available", optional: true, desc: "Genera un video de 15 s", href: "#" },
            ]}
          />
        </div>
      </Section>

      <Section id="review-card" title="ReviewCard">
        <div className="grid gap-6 md:grid-cols-2">
          <ReviewCard field="Título del producto" index={4} total={8} original="Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única" proposal="Corrector de postura ajustable: espalda recta en 15 minutos al día" />
          <ReviewCard field="Beneficio 1" index={5} total={8} state="editing" original="Material transpirable" proposalText="Tela transpirable que puedes usar bajo la ropa todo el día" />
          <ReviewCard field="Descripción corta" index={3} total={8} state="accepted" proposal="Alivia la tensión de espalda y hombros. Ajuste con velcro, talla única." hideActions />
          <ReviewCard field="Garantía" index={6} total={8} state="discarded" proposal="Garantía de por vida o te devolvemos tu dinero." hideActions />
        </div>
      </Section>

      <Section id="image-tile" title="ImageTile">
        <div className="grid max-w-160 grid-cols-6 gap-2">
          <ImageTile state="selected" order={1} src={productImage(1, 1)} alt="Opción 1" />
          <ImageTile state="selected" order={2} src={productImage(3, 1)} alt="Opción 2" />
          <ImageTile state="idle" src={productImage(0, 1)} alt="Opción 3" />
          <ImageTile state="discarded" src={productImage(5, 1)} alt="Opción 4" />
          <ImageTile state="generating" />
          <ImageTile state="error" alt="Opción 6" />
        </div>
      </Section>

      <Section id="segmented-control" title="SegmentedControl">
        <SegmentedDemo />
      </Section>

      <Section id="field" title="Field">
        <FieldDemo />
      </Section>

      <Section id="price-breakdown" title="PriceBreakdown">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4"><PriceBreakdown price={24990} parts={COSTS} /></div>
          <div className="rounded-lg border bg-card p-4"><PriceBreakdown price={14990} parts={COSTS} note="A este precio pierdes en cada venta." /></div>
        </div>
      </Section>

      <Section id="offer-preview" title="OfferPreview">
        <div className="max-w-85">
          <OfferPreview title="Corrector de postura ajustable" price={24990} compareAt={39990} image={productImage(1)} />
        </div>
      </Section>

      <Section id="metric" title="Metric">
        <MetricGrid
          className="max-w-130 grid-cols-4"
          metrics={[
            { label: "Costo por venta", value: "$4.100", target: "Límite $6.000", trend: "good" },
            { label: "Costo por venta", value: "$9.800", target: "Límite $6.000", trend: "bad" },
            { label: "Confirmadas", value: "61%", target: "Meta 75%", trend: "warn" },
            { label: "Gasto", value: "$38.200" },
          ]}
        />
      </Section>

      <Section id="campaign-card" title="CampaignCard">
        <div className="grid gap-4 md:grid-cols-2">
          <CampaignCard headingLevel="h3" name="Corrector · Video UGC" image={productImage(1)} verdict="subir" reason="CPA $4.100 por 3 días, 32% bajo tu límite de $6.000." metrics={[{ label: "Costo por venta", value: "$4.100", target: "Límite $6.000", trend: "good" }, { label: "Ventas confirmadas", value: "23", target: "82% confirma", trend: "good" }]} />
          <CampaignCard headingLevel="h3" name="Masajeador · Video 2" image={productImage(4)} verdict="apagar" reason="CPA $9.800 por 4 días; cada venta te deja −$1.200." metrics={[{ label: "Costo por venta", value: "$9.800", target: "Límite $6.000", trend: "bad" }, { label: "Ventas confirmadas", value: "6", target: "61% confirma", trend: "warn" }]} />
          <CampaignCard headingLevel="h3" name="Botella térmica · Imagen" image={productImage(0)} verdict="vigilar" reason="CPA $5.700, cerca del límite y subiendo 3 días seguidos." />
          <CampaignCard headingLevel="h3" name="Lámpara lunar · Carrusel" image={productImage(2)} verdict="aprendiendo" reason="14 h activa. Espera 48 h o 10 ventas antes de decidir." />
        </div>
      </Section>

      <Section id="navigation" title="Navigation">
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-full max-w-97.5 overflow-hidden rounded-xl border">
            <Navigation active="hoy" badges={{ hoy: 6 }} />
          </div>
          <div className="h-65 overflow-hidden rounded-xl border">
            <Navigation variant="rail" active="productos" badges={{ hoy: 6 }} />
          </div>
        </div>
      </Section>

      <Section id="top-bar" title="TopBar">
        <div className="flex max-w-97.5 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border">
            <TopBar title="Productos" subtitle="24 productos" large actions={<><IconButton icon="search" label="Buscar" /><IconButton icon="plus" label="Nuevo producto" variant="primary" /></>} />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <TopBar back="Productos" backHref="#" title="Corrector de postura" subtitle="2 de 5 etapas · editado hace 2 h" actions={<IconButton icon="sparkle" label="Abrir asistente" />} />
          </div>
        </div>
      </Section>

      <Section id="toast" title="Toast">
        <div className="max-w-97.5">
          <Toast message="Imagen descartada" action="Deshacer" />
        </div>
      </Section>

      <Section id="assistant-sheet" title="AssistantSheet">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex h-125 w-full max-w-97.5 flex-col justify-end bg-muted p-4">
            <AssistantSheet
              className="h-117.5"
              context="Corrector de postura · Precio"
              contextImage={productImage(1)}
              messages={[
                { from: "user", text: "¿Me conviene bajar a $19.990?" },
                { from: "ai", text: ["Con $19.990 ganarías $3.590 por venta (18%). Si tu CPA sube a $7.000, pierdes dinero.", "Mejor: mantén $24.990 y ofrece 2 unidades por $39.990."], apply: "Crear oferta 2×$39.990" },
              ]}
              suggestions={["¿Qué precio usa la competencia?", "Escribe una garantía"]}
            />
          </div>
          <div className="h-125 w-85">
            <AssistantSheet
              variant="panel"
              context="Corrector de postura · Textos"
              contextImage={productImage(1)}
              messages={[
                { from: "user", text: "¿El título suena exagerado?" },
                { from: "ai", text: "“15 minutos al día” es concreto y creíble. Evita “cura” o “elimina el dolor”: Meta puede rechazar el anuncio." },
              ]}
              suggestions={["Más corto", "Tono más cercano"]}
            />
          </div>
        </div>
      </Section>

      <Section id="costo-ia" title="Costo de IA (AiCostChip, AiCostCard, AiRunList)">
        <div className="flex flex-wrap items-center gap-2">
          <AiCostChip total={387} cap={1500} />
          <AiCostChip total={1290} cap={1500} />
          <AiCostChip total={1620} cap={1500} />
          <AiCostChip total={412} running />
          <AiCostChip total={387} />
        </div>
        <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
          <AiCostCard {...AI_COST} />
          <div className="flex flex-col gap-4">
            <AiCostCard compact total={1290} totalUsd={1.37} generations={21} cap={1500} />
            <AiCostCard compact total={1620} totalUsd={1.72} generations={26} cap={1500} />
          </div>
          <AiCostCard {...AI_COST} audience="admin" context={null} stages={AI_COST.stages.map((st, i) => ({ ...st, tokens: ["18,2k tok", "27,4k tok", "22,9k tok", ""][i] }))} />
          <AiRunList
            audience="admin"
            runs={[
              { kind: "retry", what: "Página del producto", stage: "Página del producto", when: "hoy 10:42", cost: 38, model: "opus-5", tokens: "7,3k tok" },
              { kind: "fail", what: "Página del producto (no cumplía las reglas)", stage: "Página del producto", when: "hoy 10:41", cost: 41, model: "opus-5", tokens: "7,9k tok" },
              { kind: "gen", what: "Ranking de ángulos", stage: "Ángulos", when: "ayer 18:02", cost: 51, model: "opus-5", tokens: "10,0k tok" },
              { kind: "regen", what: "Cliente ideal", stage: "Información base", when: "ayer 17:40", cost: 49, model: "opus-5", tokens: "9,3k tok" },
            ]}
          />
        </div>
      </Section>

      <OnboardingDemos />

      <Section id="interaccion" title="Interacción (revisión, imágenes, precio en vivo, toast)">
        <InteractiveDemo />
      </Section>
    </main>
  );
}
