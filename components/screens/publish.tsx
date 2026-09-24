"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, EmptyState, Icon, Notice, StatusBadge, TopBar, notify } from "@/components/df";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { AiCostButton } from "@/components/shell/ai-cost-provider";
import { StickyActions } from "@/components/shell/sticky-actions";
import { useDesktop } from "@/components/shell/use-desktop";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi, themeApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { Product, PublishState, StageKey } from "@/lib/types";
import { cn } from "@/lib/utils";

// Etapa Publicar (docs/spec-publicar.md): dos pasos independientes. El tema de DropFlex se instala
// una vez por tienda, sin publicar (el comerciante lo revisa en la vista previa y lo publica con un
// segundo toque). El producto se publica cuantas veces haga falta: cambia en la tienda al instante.

const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

/** La etapa donde se completa lo que falta (las frases vienen de lib/pipeline/publish.ts › preparePublish). */
function missingStage(text: string): StageKey {
  if (text.includes("Imágenes")) return "imagenes";
  if (text.includes("Información base")) return "importado";
  return "textos";
}

const DATE = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Section({ step, title, hint, children, className }: { step: number; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`publish-${step}`} className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-6 flex-none place-items-center rounded-full bg-muted text-label">{step}</span>
        <div className="min-w-0">
          <h2 id={`publish-${step}`} className="text-heading">{title}</h2>
          {hint ? <p className="text-label font-normal text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 pl-9">{children}</div>
    </section>
  );
}

function Row({ icon, children }: { icon: React.ComponentProps<typeof Icon>["name"]; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-body">
      <Icon name={icon} size="sm" className="mt-0.5 flex-none text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function PublishScreen({ product, initial }: { product: Product; initial: PublishState }) {
  const router = useRouter();
  const desktop = useDesktop();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [confirmTheme, setConfirmTheme] = useState(false);

  const { theme, publication, plan } = state;
  const installing = theme.status === "installing";
  const publishing = publication?.status === "publishing";
  const working = installing || publishing;

  // Sondeo mientras Shopify procesa el tema o se publica el producto.
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(async () => {
      try {
        const next = await productsApi.publishState(product.id);
        setState(next);
        if (next.publication?.status !== "publishing" && publishing) {
          router.refresh();
          if (next.publication?.status === "published") notify("Producto publicado en tu tienda");
        }
      } catch {
        // Un sondeo fallido se reintenta en el siguiente.
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [working, publishing, product.id, router]);

  async function act(key: string, fn: () => Promise<unknown>, fallback: string, done?: string) {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      setState(await productsApi.publishState(product.id));
      router.refresh();
      if (done) notify(done);
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  const install = () => act("install", () => themeApi.act("install"), "No pudimos instalar el tema. Intenta de nuevo.");
  const update = () => act("update", () => themeApi.act("update"), "No pudimos actualizar el tema. Intenta de nuevo.", "Tema actualizado");
  const publishTheme = () => {
    if (!confirmTheme) {
      setConfirmTheme(true);
      return;
    }
    setConfirmTheme(false);
    void act("theme", () => themeApi.act("publish"), "No pudimos publicar el tema. Intenta de nuevo.", "Tema publicado: tu tienda ya muestra la página nueva");
  };
  const publish = () => act("publish", () => productsApi.publish(product.id), "No pudimos empezar a publicar. Intenta de nuevo.");
  async function permissions() {
    if (!state.shop) return;
    setBusy("permissions");
    setError(undefined);
    try {
      const { authorizeUrl } = await themeApi.permissions(state.shop);
      window.location.assign(authorizeUrl);
    } catch (e) {
      setError(errorText(e, "No pudimos abrir Shopify. Intenta de nuevo."));
      setBusy(null);
    }
  }

  const blocked = Boolean(state.connection) || state.missing.length > 0;
  const published = publication?.status === "published";
  const subtitle = publishing
    ? "Publicando en tu tienda"
    : published
      ? publication?.stale
        ? "Hay cambios sin publicar"
        : "Publicado en tu tienda"
      : state.missing.length
        ? "Falta completar"
        : "Listo para publicar";

  // ---------------------------------------------------------------- Conexión
  const connection = state.connection ? (
    <Notice
      title={state.needsPermissions ? "Faltan permisos de Shopify" : state.connection}
      body={state.needsPermissions ? "Para instalar el tema, subir las imágenes y vender sin stock en Shopify. Tus productos no cambian." : undefined}
      action={
        state.needsPermissions ? (
          <Button size="sm" variant="primary" loading={busy === "permissions"} onClick={permissions}>
            Dar permisos
          </Button>
        ) : (
          <Button size="sm" href="/settings#conexiones">
            Ir a Ajustes
          </Button>
        )
      }
    />
  ) : null;

  // ---------------------------------------------------------------- Tema
  let themeBody: React.ReactNode;
  if (theme.status === "none") {
    themeBody = (
      <>
        <p className="text-body text-muted-foreground">La página del producto que armaste necesita el tema de DropFlex. Se instala sin publicar: la revisas en la vista previa y decides cuándo mostrarla.</p>
        <div>
          <Button variant="primary" icon="store" loading={busy === "install"} disabled={Boolean(state.connection)} onClick={install}>
            Instalar tema
          </Button>
        </div>
      </>
    );
  } else if (installing) {
    themeBody = (
      <p role="status" className="flex items-center gap-2 text-body">
        <Icon name="loader" size="sm" className="animate-spin text-muted-foreground" />
        Instalando el tema en Shopify. Puede tardar unos minutos; puedes salir de esta pantalla.
      </p>
    );
  } else if (theme.status === "failed") {
    themeBody = (
      <>
        <p role="alert" className="text-body text-destructive">{theme.error ?? "No se pudo instalar el tema."}</p>
        <div>
          <Button variant="primary" icon="refresh" loading={busy === "install"} disabled={Boolean(state.connection)} onClick={install}>
            Instalar de nuevo
          </Button>
        </div>
      </>
    );
  } else {
    themeBody = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={theme.status === "published" ? "publicado" : "aprobado"} label={theme.status === "published" ? "Publicado" : "Instalado, sin publicar"} />
          {theme.name ? <span className="text-label font-normal text-muted-foreground">{theme.name}</span> : null}
        </div>
        {theme.status === "preview" ? (
          <p className="text-body text-muted-foreground">Tus compradores siguen viendo tu tema actual. Revisa la vista previa y publícalo cuando esté listo.</p>
        ) : (
          <p className="text-body text-muted-foreground">Tu tienda muestra solo la página del producto: la home y las colecciones llevan al último producto visitado.</p>
        )}
        {theme.outdated ? <Notice tone="info" icon="refresh" title="Hay una versión nueva del tema" body="Se actualiza solo el código; tus cambios en el editor de Shopify se mantienen." /> : null}
        <div className="flex flex-wrap gap-2">
          {theme.previewUrl ? (
            <Button href={theme.previewUrl} target="_blank" rel="noopener noreferrer" icon="eye">
              Ver vista previa
            </Button>
          ) : null}
          {theme.outdated ? (
            <Button icon="refresh" loading={busy === "update"} disabled={Boolean(state.connection)} onClick={update}>
              Actualizar tema
            </Button>
          ) : null}
          {theme.status === "preview" ? (
            <Button variant={confirmTheme ? "primary" : "secondary"} icon="send" loading={busy === "theme"} disabled={Boolean(state.connection)} onClick={publishTheme} onBlur={() => setConfirmTheme(false)}>
              {confirmTheme ? "Toca otra vez para publicar" : "Publicar tema"}
            </Button>
          ) : null}
        </div>
        {confirmTheme ? <p className="text-label font-normal text-warning">Tus compradores verán el tema nuevo en toda la tienda.</p> : null}
      </>
    );
  }

  // ---------------------------------------------------------------- Lo que se publica
  const missing = state.missing.length ? (
    <Notice
      title="Falta completar antes de publicar"
      body={
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
          {state.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      }
    />
  ) : null;

  const content = (
    <ul className="flex flex-col gap-2">
      <Row icon="text">
        <span className="font-medium">{plan.title}</span> · título, descripción y SEO de la ficha aprobada
      </Row>
      <Row icon="image">{plan.images === 1 ? "1 imagen en la galería" : `${plan.images} imágenes en la galería`}, en el orden que elegiste</Row>
      {plan.packs.length ? (
        <Row icon="tag">
          {plan.packs.length} packs como variantes:{" "}
          <span className="tabular-nums">{plan.packs.map((p) => `${p.units} × ${money(p.price, state.currency)}`).join(" · ")}</span>
        </Row>
      ) : (
        <Row icon="tag">Una sola variante, al precio de 1 unidad</Row>
      )}
      <Row icon="box">{plan.components.length ? `${plan.components.length} componentes: ${plan.components.join(", ")}` : "Sin componentes de conversión en uso"}</Row>
      <Row icon="star">{plan.reviews ? `${plan.reviews} reseñas aprobadas, con la fuente visible` : "Sin reseñas aprobadas"}</Row>
      <Row icon="shield">
        {plan.policies.join(" · ")}.{" "}
        <a href="/settings#envios" className="text-primary underline underline-offset-2">
          Editar envíos y políticas
        </a>
      </Row>
    </ul>
  );

  const result = publication ? (
    publication.status === "error" ? (
      <p role="alert" className="text-body text-destructive">{publication.error ?? "No se pudo publicar."}</p>
    ) : publication.status === "publishing" ? (
      <p role="status" className="flex items-center gap-2 text-body">
        <Icon name="loader" size="sm" className="animate-spin text-muted-foreground" />
        Subiendo imágenes y actualizando el producto en Shopify.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="publicado" />
          {publication.publishedAt ? <span className="text-label font-normal text-muted-foreground">{DATE.format(new Date(publication.publishedAt))}</span> : null}
        </div>
        {publication.stale ? <Notice title="Cambiaste la página desde la última publicación" body="Publica los cambios para que tu tienda los muestre." /> : null}
        {publication.productUrl ? (
          <div>
            <Button href={publication.productUrl} target="_blank" rel="noopener noreferrer" icon="link">
              Ver en tu tienda
            </Button>
          </div>
        ) : null}
      </div>
    )
  ) : null;

  const body =
    state.missing.length && !publication ? (
      <div className="flex flex-col gap-4">
        {connection}
        <EmptyState
          icon="lock"
          title="Todavía no se puede publicar"
          body={state.missing.map((m) => (
            <span key={m} className="block">
              {m}
            </span>
          ))}
          action={
            <Button variant="primary" iconEnd="chevron-right" href={productHref(product.id, missingStage(state.missing[0]))}>
              Completar
            </Button>
          }
        />
      </div>
    ) : (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {connection}
          {missing}
        </div>
        <Section step={1} title="El tema de tu tienda" hint="Una vez por tienda.">
          {themeBody}
        </Section>
        <Section step={2} title="Tu producto" hint="Cambia en tu tienda al instante: título, precios, packs y fotos.">
          {content}
          {result}
        </Section>
      </div>
    );

  const primaryLabel = publishing ? "Publicando" : published ? (publication?.stale ? "Publicar cambios" : "Publicar de nuevo") : "Publicar en mi tienda";
  const actionClass = "max-lg:w-full lg:h-control lg:text-row";

  return (
    <div className="@container flex flex-col lg:min-h-svh">
      <AssistantScope productId={product.id} product={product.name} stage="Publicar en tu tienda" stageKey="publicar" image={product.image} />
      <TopBar
        back={product.name}
        backHref={`/products/${product.id}`}
        title="Publicar"
        subtitle={subtitle}
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-4 lg:px-8 lg:pt-6">
        <p className="hidden text-body text-muted-foreground lg:block">Publicar en tu tienda · {subtitle}</p>
        {body}
        {error ? (
          <p role="alert" className="text-label font-normal text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <StickyActions
        variant="bar"
        summary={
          <span className="max-lg:hidden">
            {theme.status === "published" ? "Tu tienda muestra el tema de DropFlex." : "Puedes publicar el producto antes que el tema: se verá con el tema nuevo cuando lo publiques."}
          </span>
        }
        className="lg:px-8"
      >
        {published && !publishing ? (
          <Button href={productHref(product.id, "anuncios")} size="lg" iconEnd="chevron-right" className={actionClass}>
            {desktop ? "Continuar: Anuncios" : "Anuncios"}
          </Button>
        ) : null}
        <Button variant="primary" size="lg" icon="send" loading={busy === "publish" || publishing} disabled={blocked || publishing || (published && !publication?.stale && busy !== null)} onClick={publish} className={actionClass}>
          {primaryLabel}
        </Button>
      </StickyActions>
    </div>
  );
}
