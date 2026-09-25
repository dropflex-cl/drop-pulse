import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventPreview, ProductEvents, PublishEvents, StoreActivation } from "@/components/screens/events";
import { PageHeader } from "@/components/shell/page-header";
import { getEventDetail } from "@/lib/data/events";

export const metadata: Metadata = { title: "Evento" };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getEventDetail(slug);
  if (!data) notFound();
  const { event } = data;
  return (
    <>
      <PageHeader title={event.name} subtitle={`${event.eventLabel} · ${event.phaseLabel}`} back="Eventos" backHref="/events" />
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6 lg:max-w-content lg:px-8 lg:py-6">
        <PublishEvents data={data} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
          <div className="flex flex-col gap-4">
            <StoreActivation slug={slug} event={event} />
            <ProductEvents slug={slug} event={event} products={data.products} />
          </div>
          <div className="lg:sticky lg:top-6">
            <EventPreview event={event} products={data.products} />
          </div>
        </div>
      </div>
    </>
  );
}
