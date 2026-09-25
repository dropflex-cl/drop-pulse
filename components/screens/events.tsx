"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Icon, Notice, notify, SegmentedControl, StateChip, Switch } from "@/components/df";
import { EventLayerPreview } from "@/components/store-preview/event-layer";
import { StoreFrame } from "@/components/store-preview/store-frame";
import { ACCENT_PALETTE, accentCheck } from "@/lib/copy/accent";
import { ANNOUNCEMENT_MAX, BADGE_MAX, INTENSITY_LABEL, INTENSITY_LAYERS } from "@/lib/events/catalog";
import { eventsApi, type ActivationPatch } from "@/lib/events/client";
import { EVENT_COPY_FIELDS } from "@/lib/events/copy";
import { ProductApiClientError } from "@/lib/products/client";
import type { EventActivationView, EventDetail, EventIntensityUi, EventProductView, EventView } from "@/lib/types";
import { cn } from "@/lib/utils";

// Eventos (docs/spec-eventos.md › UX): cómo se ve el evento, activarlo en toda la tienda o por
// producto, adaptar los textos con IA y publicarlo. Guardar no cambia la tienda: «Publicar en la
// tienda» es un paso aparte (cambia la tienda real).

const errorText = (e: unknown, fallback: string) => (e instanceof ProductApiClientError ? e.message : fallback);

const INTENSITY_OPTIONS = (["subtle", "medium", "full"] as const).map((v) => ({ value: v, label: INTENSITY_LABEL[v].name }));

/** Lo que falta hasta el inicio o el término, para la vista previa («3 días 04:12:00»). */
function remaining(event: EventView): { label: string; time: string } | null {
  if (event.phase === "ended") return null;
  const label = event.phase === "live" ? event.look.countdownDuring : event.look.countdownBefore;
  return { label, time: event.phase === "live" ? "1 día 08:15:42" : "3 días 12:00:00" };
}

// ---------------------------------------------------------------- Vista previa

export function EventPreview({ event, products }: { event: EventView; products: EventProductView[] }) {
  const [on, setOn] = useState("on");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId) ?? products[0];
  const own = product?.override;
  const intensity: EventIntensityUi = (own ?? event.store)?.intensity ?? "medium";
  const layers = INTENSITY_LAYERS[intensity];
  const approved = product?.copy?.status === "approved" ? product.copy.text : null;
  const look = on === "on" ? { ...event.look, ...(layers.copy && approved ? { announcement: approved.announcement, badge: approved.badge_label } : {}) } : null;

  return (
    <section aria-labelledby="vista-evento" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="vista-evento" className="text-heading">
            Así se ve en tu tienda
          </h2>
          <p className="text-label font-normal text-muted-foreground">Intensidad {INTENSITY_LABEL[intensity].name.toLowerCase()}: {INTENSITY_LABEL[intensity].detail.toLowerCase()}.</p>
        </div>
        <SegmentedControl label="Vista previa" value={on} onChange={setOn} options={[{ value: "on", label: "Con evento" }, { value: "off", label: "Normal" }]} />
      </div>
      {products.length > 1 ? (
        <label className="flex flex-col gap-1 text-label">
          Producto
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-touch rounded-md border bg-background px-3 text-body">
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border">
        <StoreFrame scale={0.85}>
          <EventLayerPreview
            look={look}
            layers={layers}
            countdown={layers.countdown ? remaining(event) : null}
            product={{
              title: product?.preview.title ?? "Tu producto",
              subtitle: product?.preview.subtitle ?? "",
              eventSubtitle: layers.copy ? approved?.subtitle : null,
              price: product?.preview.price ?? null,
              compareAt: product?.preview.compareAt ?? null,
              currency: product?.preview.currency ?? "CLP",
              image: product?.image || undefined,
            }}
          />
        </StoreFrame>
      </div>
      <p className="text-caption text-muted-foreground">El % de la etiqueta sale de tu precio tachado real. Sin tachado, la etiqueta va sin %. La cuenta regresiva llega hasta la fecha real del evento.</p>
    </section>
  );
}

// ---------------------------------------------------------------- Ajustes (tienda o producto)

function ActivationForm({ slug, event, productId, initial, onSaved }: { slug: string; event: EventView; productId: string | null; initial: EventActivationView | null; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState(initial?.overrides.announcement ?? "");
  const [badge, setBadge] = useState(initial?.overrides.badge_label ?? "");
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const accent = initial?.overrides.accent ?? null;

  const save = async (patch: ActivationPatch, message?: string) => {
    setSaving(true);
    setErrors({});
    try {
      await eventsApi.saveActivation(slug, productId, patch);
      if (message) notify(message);
      onSaved();
    } catch (e) {
      const field = e instanceof ProductApiClientError ? e.field : undefined;
      const text = errorText(e, "No pudimos guardar el evento. Intenta de nuevo.");
      if (field) setErrors({ [field]: text });
      else notify(text);
    } finally {
      setSaving(false);
    }
  };

  const overrides = (next: Partial<EventActivationView["overrides"]>) => {
    const o = { ...(initial?.overrides ?? {}), ...next };
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  };

  return (
    <div className="flex flex-col gap-4">
      <Switch
        label={productId ? "Activar en este producto" : "Activar en toda la tienda"}
        hint={productId ? "Apagado, este producto queda sin evento aunque la tienda lo tenga." : "Todos tus productos publicados muestran el evento en sus fechas."}
        checked={initial?.enabled ?? false}
        disabled={saving}
        onChange={(enabled) => save({ enabled, intensity: initial?.intensity ?? "medium" }, enabled ? `${event.name} activado` : `${event.name} apagado`)}
      />
      {initial?.enabled ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-label">Intensidad</span>
            <SegmentedControl block label="Intensidad" value={initial.intensity} options={INTENSITY_OPTIONS} onChange={(v) => save({ intensity: v as EventIntensityUi }, `Intensidad ${INTENSITY_LABEL[v as EventIntensityUi].name.toLowerCase()}`)} />
            <p className="text-caption text-muted-foreground">{INTENSITY_LABEL[initial.intensity].detail}.</p>
          </div>

          {INTENSITY_LAYERS[initial.intensity].tokens ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-label" id={`color-${productId ?? "tienda"}`}>
                Color del evento
              </span>
              <div role="radiogroup" aria-labelledby={`color-${productId ?? "tienda"}`} className="grid grid-cols-[repeat(auto-fill,minmax(--spacing(11),1fr))] gap-2">
                {[{ hex: null as string | null, name: `El de ${event.name}` }, ...ACCENT_PALETTE].map((c) => {
                  const hex = c.hex ?? event.look.accent;
                  const selected = (accent ?? null) === c.hex;
                  return (
                    <button
                      key={c.hex ?? "evento"}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={c.hex ? `${c.name} (${c.hex})` : c.name}
                      title={c.name}
                      disabled={saving}
                      onClick={() => save({ overrides: overrides({ accent: c.hex ?? undefined }) }, "Color guardado")}
                      style={{ backgroundColor: hex, color: accentCheck(hex).onAccent }}
                      className={cn("grid aspect-square min-h-touch cursor-pointer place-items-center rounded-md inset-ring inset-ring-border", selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card")}
                    >
                      {selected ? <Icon name="check" strokeWidth={2.5} /> : c.hex ? null : <Icon name="sparkle" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <Field label="Barra de aviso" value={announcement} onValueChange={setAnnouncement} placeholder={event.look.announcement} maxLength={ANNOUNCEMENT_MAX} hint="Vacío: el texto del evento." error={errors.announcement} />
            <Field label="Etiqueta del precio" value={badge} onValueChange={(v) => setBadge(v.toUpperCase())} placeholder={event.look.badge} maxLength={BADGE_MAX} hint="Sin %: la tienda agrega el ahorro real." error={errors.badge_label} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Se ve desde" type="date" value={startsOn || event.defaultStartsOn} onValueChange={setStartsOn} error={errors.startsOn} />
              <Field label="Hasta" type="date" value={endsOn || event.defaultEndsOn} onValueChange={setEndsOn} error={errors.endsOn} hint="Se apaga solo a las 23:59." />
            </div>
          </div>
          <div>
            <Button
              loading={saving}
              onClick={() =>
                save(
                  {
                    overrides: overrides({ announcement: announcement.trim() || undefined, badge_label: badge.trim() || undefined }),
                    startsOn: startsOn && startsOn !== event.defaultStartsOn ? startsOn : null,
                    endsOn: endsOn && endsOn !== event.defaultEndsOn ? endsOn : null,
                  },
                  "Evento guardado",
                )
              }
            >
              Guardar textos y fechas
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function StoreActivation({ slug, event }: { slug: string; event: EventView }) {
  const router = useRouter();
  return (
    <section aria-labelledby="tu-tienda" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <h2 id="tu-tienda" className="text-heading">
          Tu tienda
        </h2>
        <p className="text-label font-normal text-muted-foreground">
          Se ve del {event.windowLabel} ({event.phaseLabel.toLowerCase()}). El evento es del {event.eventLabel}.
        </p>
      </div>
      <ActivationForm key={JSON.stringify(event.store)} slug={slug} event={event} productId={null} initial={event.store} onSaved={() => router.refresh()} />
    </section>
  );
}

// ---------------------------------------------------------------- Productos

function CopyEditor({ slug, product, onChange }: { slug: string; product: EventProductView; onChange: () => void }) {
  const copy = product.copy;
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(copy?.text ?? null);
  const [error, setError] = useState<{ field?: string; text: string }>();

  // Mientras se escribe, sondeo cada 3 s.
  useEffect(() => {
    if (copy?.status !== "generating") return;
    const id = setInterval(async () => {
      const res = await eventsApi.copy(slug, product.id).catch(() => null);
      if (res?.copy?.status !== "generating") onChange();
    }, 3000);
    return () => clearInterval(id);
  }, [copy?.status, slug, product.id, onChange]);

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      if (message) notify(message);
      onChange();
    } catch (e) {
      setError({ field: e instanceof ProductApiClientError ? e.field : undefined, text: errorText(e, "No pudimos guardar los textos. Intenta de nuevo.") });
    } finally {
      setBusy(false);
    }
  };

  if (product.copyLocked) return <p className="text-caption text-muted-foreground">{product.copyLocked}</p>;
  if (!copy || copy.status === "failed") {
    return (
      <div className="flex flex-col gap-2">
        {copy?.error ? <Notice title="No se escribieron los textos." body={copy.error} /> : null}
        {error ? <p className="text-caption text-destructive">{error.text}</p> : null}
        <div>
          <Button icon="sparkle" loading={busy} onClick={() => run(() => eventsApi.writeCopy(slug, product.id))}>
            {copy ? "Reintentar" : "Adaptar textos al evento"}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">La IA adapta la barra, la bajada y la etiqueta a este producto. Mantiene tu ángulo principal y no toca tu página: al terminar el evento vuelve sola.</p>
      </div>
    );
  }
  if (copy.status === "generating") return <StateChip label="Escribiendo los textos" icon="loader" tone="progress" spin />;

  const approved = copy.status === "approved";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {approved ? <StateChip label="Textos aprobados" icon="check" tone="success" size="sm" /> : <StateChip label="Por revisar" icon="eye" tone="warning" size="sm" />}
      </div>
      {draft
        ? (Object.keys(EVENT_COPY_FIELDS) as (keyof typeof EVENT_COPY_FIELDS)[]).map((k) => (
            <Field
              key={k}
              ai
              label={EVENT_COPY_FIELDS[k].label}
              value={draft[k]}
              maxLength={EVENT_COPY_FIELDS[k].max}
              onValueChange={(v) => setDraft({ ...draft, [k]: k === "badge_label" ? v.toUpperCase() : v })}
              error={error?.field === k ? error.text : undefined}
            />
          ))
        : null}
      {error && !error.field ? <p className="text-caption text-destructive">{error.text}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} icon="check" onClick={() => run(() => eventsApi.approveCopy(slug, product.id, draft ?? undefined), "Textos aprobados")}>
          {approved ? "Guardar cambios" : "Aprobar textos"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(() => eventsApi.writeCopy(slug, product.id))}>
          Proponer otros
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(() => eventsApi.discardCopy(slug, product.id), "Vuelven los textos del evento")}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

function ProductEvent({ slug, event, product }: { slug: string; event: EventView; product: EventProductView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const refresh = useMemo(() => () => router.refresh(), [router]);
  const eff = product.effective;
  const status = eff
    ? `${INTENSITY_LABEL[eff.intensity].name}${eff.scope === "product" ? " · propia" : " · la de la tienda"}`
    : product.override && !product.override.enabled
      ? "Apagado en este producto"
      : "Sin evento";
  const showCopy = eff && INTENSITY_LAYERS[eff.intensity].copy;

  return (
    <li className="border-t first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-touch w-full cursor-pointer items-center gap-3 py-3 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura firmada de Storage. */}
        {product.image ? <img src={product.image} alt="" className="size-10 rounded-sm object-cover" /> : <span aria-hidden className="size-10 rounded-sm bg-muted" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-row">{product.name}</span>
          <span className="block text-caption text-muted-foreground">
            {status}
            {product.published ? "" : " · aún no publicado"}
          </span>
        </span>
        <Icon name="chevron-right" className={cn("text-muted-foreground transition-transform duration-fast ease-standard", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 pb-4">
          {product.override ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => eventsApi.removeActivation(slug, product.id).then(refresh).catch((e) => notify(errorText(e, "No pudimos cambiarlo.")))}>
                Usar lo de la tienda
              </Button>
            </div>
          ) : null}
          <ActivationForm key={JSON.stringify(product.override)} slug={slug} event={event} productId={product.id} initial={product.override ?? (event.store ? { ...event.store, overrides: {} } : null)} onSaved={refresh} />
          {showCopy ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <h3 className="text-label font-semibold">Textos del evento</h3>
              <CopyEditor key={JSON.stringify(product.copy)} slug={slug} product={product} onChange={refresh} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ProductEvents({ slug, event, products }: { slug: string; event: EventView; products: EventProductView[] }) {
  return (
    <section aria-labelledby="por-producto" className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <h2 id="por-producto" className="text-heading">
        Por producto
      </h2>
      <p className="text-label font-normal text-muted-foreground">Cada producto usa lo de la tienda, salvo que le cambies algo aquí. Con intensidad total, adapta sus textos al evento.</p>
      {products.length ? (
        <ul className="mt-2">
          {products.map((p) => (
            <ProductEvent key={p.id} slug={slug} event={event} product={p} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption text-muted-foreground">Todavía no tienes productos. Elígelos en Productos.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Publicar

export function PublishEvents({ data }: { data: Pick<EventDetail, "connection" | "stale" | "publishedProducts"> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pending = data.stale.length;

  const publish = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      const r = await eventsApi.publish();
      notify(r.failed.length ? `Publicado en ${r.products - r.failed.length} de ${r.products} productos. Falló: ${r.failed.join(", ")}.` : `Eventos publicados en ${r.products} ${r.products === 1 ? "producto" : "productos"}`);
      router.refresh();
    } catch (e) {
      notify(errorText(e, "No pudimos publicar los eventos. Intenta de nuevo."));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (data.connection) return <Notice title="Para publicar, conecta tu tienda." body={data.connection} action={<Button size="sm" href="/settings#conexiones">Ir a Ajustes</Button>} />;
  if (!data.publishedProducts) return <Notice tone="info" title="Aún no publicas productos." body="El evento se publica con cada producto en su etapa Publicar." />;
  if (!pending) return <Notice tone="info" icon="check" title="Tu tienda está al día." body="Los cambios de eventos que hagas se publican con «Publicar en la tienda»." />;
  return (
    <Notice
      title={`${pending} ${pending === 1 ? "producto tiene" : "productos tienen"} cambios de eventos sin publicar.`}
      body={confirm ? "Cambia tu tienda real ahora. Toca otra vez para confirmar." : data.stale.map((s) => s.name).join(", ")}
      action={
        <Button variant="primary" size="sm" loading={busy} onClick={publish}>
          {confirm ? "Confirmar" : "Publicar en la tienda"}
        </Button>
      }
    />
  );
}
