import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, IconButton, StateChip } from "@/components/df";
import { PublishEvents } from "@/components/screens/events";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { getEventsOverview } from "@/lib/data/events";
import { INTENSITY_LABEL } from "@/lib/events/catalog";
import type { EventView } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Eventos" };

function Status({ event }: { event: EventView }) {
  if (event.phase === "ended") return <StateChip label="Terminado" icon="check" tone="quiet" size="sm" />;
  if (event.store?.enabled) return <StateChip label={`Activado · ${INTENSITY_LABEL[event.store.intensity].name}`} icon="check" tone="success" size="sm" />;
  if (event.productOverrides) return <StateChip label={`En ${event.productOverrides} ${event.productOverrides === 1 ? "producto" : "productos"}`} icon="check" tone="success" size="sm" />;
  return <StateChip label="Sin activar" icon="minus" tone="quiet" size="sm" />;
}

function EventCard({ event }: { event: EventView }) {
  return (
    <li>
      <Link href={`/events/${event.slug}`} className={cn("flex h-full flex-col overflow-hidden rounded-lg border bg-card hover:bg-accent", event.phase === "ended" && "opacity-70")}>
        {/* Los colores del evento son datos (lib/events/catalog.ts): van por style. */}
        <div aria-hidden className="flex min-h-10 items-center justify-center px-4 py-2 text-caption font-semibold" style={{ backgroundColor: event.look.surface, color: event.look.onSurface }}>
          <span className="truncate">{event.look.announcement}</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-heading">{event.name}</h2>
            <span aria-hidden className="rounded-sm px-2 py-0.5 text-micro font-bold tracking-label" style={{ backgroundColor: event.look.accent, color: event.look.onAccent }}>
              {event.look.badge}
            </span>
          </div>
          <p className="text-small tabular-nums">{event.eventLabel}</p>
          <p className="text-caption text-muted-foreground">{event.phaseLabel}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Status event={event} />
            <Icon name="chevron-right" className="text-muted-foreground" />
          </div>
        </div>
      </Link>
    </li>
  );
}

export default async function EventsPage() {
  const data = await getEventsOverview();
  if (!data) notFound();
  const upcoming = data.events.filter((e) => e.phase !== "ended");
  const ended = data.events.filter((e) => e.phase === "ended");
  return (
    <>
      <PageHeader large title="Eventos" subtitle={`Calendario de ${data.countryName}`} back="Hoy" backHref="/today" actions={<IconButton icon="settings" label="Ajustes" href="/settings" />} desktopActions={null} />
      <div className="flex flex-col gap-4 px-4 pb-6 lg:max-w-content lg:px-8 lg:py-6">
        <p className="text-small text-muted-foreground">
          Un evento cambia colores, etiqueta, barra de aviso y cuenta regresiva de tu página en sus fechas, y se apaga solo. Tu página no cambia: al terminar vuelve tal cual.
        </p>
        <PublishEvents data={data} />
        {upcoming.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {upcoming.map((e) => (
              <EventCard key={e.slug} event={e} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Icon name="clock" />} title="No hay eventos próximos">
            Por ahora el calendario de eventos es de Chile. Te avisamos cuando haya uno para tu país.
          </EmptyState>
        )}
        {ended.length ? (
          <section aria-labelledby="terminados" className="flex flex-col gap-2">
            <h2 id="terminados" className="text-label text-muted-foreground">
              Terminados
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {ended.map((e) => (
                <EventCard key={e.slug} event={e} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
