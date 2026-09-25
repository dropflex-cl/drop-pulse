import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SetupSlot } from "@/components/onboarding/setup-slot";
import { AttentionItem, Button, Icon, IconButton } from "@/components/df";
import { EmptyState, Group, PageHeader, SectionTitle } from "@/components/shell/page-header";
import { getNextEvent } from "@/lib/data/events";
import { getTodayQueue, getTodaySummary } from "@/lib/data/today";
import { longDate } from "@/lib/format";
import type { AttentionEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hoy" };

function Summary({ value, label, dot }: { value: number; label: string; dot: string }) {
  return (
    <div className="flex-1 rounded-md border bg-card px-3 py-2">
      <div className="text-title tracking-normal">{value}</div>
      <div className="flex items-center gap-1 text-caption text-muted-foreground">
        <span aria-hidden className={cn("inline-block size-2 rounded-full", dot)} />
        {label}
      </div>
    </div>
  );
}

function Item({ entry }: { entry: AttentionEntry }) {
  return (
    <AttentionItem
      kind={entry.kind}
      title={entry.title}
      product={entry.product}
      detail={entry.detail}
      actions={
        entry.actions.length ? (
          <>
            {entry.actions.map((a) => (
              <Button key={a.label} href={a.href} size="sm" variant={a.variant} iconEnd={a.iconEnd}>
                {a.label}
              </Button>
            ))}
          </>
        ) : undefined
      }
    />
  );
}

/** El próximo evento del calendario (docs/spec-eventos.md › UX): un aviso con su color y el acceso a Eventos. */
async function NextEvent() {
  const event = await getNextEvent();
  if (!event) return null;
  const ready = event.store?.enabled || event.productOverrides > 0;
  return (
    <Link href={`/events/${event.slug}`} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent">
      {/* Los colores del evento son datos (lib/events/catalog.ts): van por style. */}
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-sm text-micro font-bold" style={{ backgroundColor: event.look.surface, color: event.look.onSurface }}>
        {event.look.badge.slice(0, 3)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-row">
          {event.name} · {event.eventLabel}
        </span>
        <span className="block truncate text-caption text-muted-foreground">{ready ? `Activado · ${event.phaseLabel}` : `${event.phaseLabel} · actívalo en tu tienda`}</span>
      </span>
      <Icon name="chevron-right" className="text-muted-foreground" />
    </Link>
  );
}

export default async function HoyPage() {
  const [queue, summary] = await Promise.all([getTodayQueue(), getTodaySummary()]);
  const first = queue.filter((e) => e.group === "primero");
  const review = queue.filter((e) => e.group === "revisar");

  return (
    <>
      <PageHeader
        large
        title="Hoy"
        subtitle={longDate(summary.date)}
        actions={<IconButton icon="settings" label="Ajustes" href="/settings" />}
        desktopActions={null}
      />
      <div className="pb-6 lg:max-w-content lg:px-8 lg:py-6 md:max-lg:px-4">
        <Suspense fallback={null}>
          <div className="px-4 pb-3 empty:hidden lg:px-0 md:max-lg:px-0">
            <SetupSlot where="hoy" />
          </div>
        </Suspense>
        <div className="flex gap-2 px-4 lg:px-0 md:max-lg:px-0">
          <Summary value={summary.pending} label="Por decidir" dot="bg-warning" />
          <Summary value={summary.errors} label="Con error" dot="bg-destructive" />
          <Summary value={summary.published} label="Publicados" dot="bg-success" />
        </div>
        <Suspense fallback={null}>
          <div className="px-4 pt-3 empty:hidden lg:px-0 md:max-lg:px-0">
            <NextEvent />
          </div>
        </Suspense>

        {queue.length === 0 ? (
          <EmptyState icon={<Icon name="check" />} title="No tienes nada por decidir">
            Todo avanza solo. Te avisamos aquí cuando algo necesite tu decisión.
          </EmptyState>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-x-4 lg:block">
            {first.length ? (
              <section aria-labelledby="primero">
                <SectionTitle className="md:max-lg:px-0">
                  <span id="primero">Primero esto</span>
                </SectionTitle>
                <Group className="md:max-lg:mx-0">
                  {first.map((e) => (
                    <Item key={e.id} entry={e} />
                  ))}
                </Group>
              </section>
            ) : null}
            {review.length ? (
              <section aria-labelledby="revisar">
                <SectionTitle className="md:max-lg:px-0">
                  <span id="revisar">Contenido por revisar</span>
                </SectionTitle>
                <Group className="md:max-lg:mx-0">
                  {review.map((e) => (
                    <Item key={e.id} entry={e} />
                  ))}
                </Group>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
