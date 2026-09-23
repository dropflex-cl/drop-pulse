import { cn } from "@/lib/utils";

export type SummaryTag = "edited" | "kept" | "omitted" | "missing";

export interface CopySummaryProps {
  sections: { title: string; items: { id?: string; label: string; text?: string; tag?: SummaryTag }[] }[];
  className?: string;
}

const TAG: Record<SummaryTag, string> = { edited: "Tu versión", kept: "Se mantiene Shopify", omitted: "No va en la página", missing: "Falta aprobar" };

/** Lo aprobado de la página, por sección, al terminar la revisión (.df-csum). */
export function CopySummary({ sections, className }: CopySummaryProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h3 className="text-micro font-semibold tracking-label text-muted-foreground uppercase">{s.title}</h3>
          <ul className="overflow-hidden rounded-lg border bg-card">
            {s.items.map((it, i) => (
              <li key={it.id ?? i} className={cn("flex flex-col gap-0.5 px-4 py-3 not-first:border-t", it.tag === "missing" && "bg-warning-soft")}>
                <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  {it.label}
                  {it.tag ? (
                    <span className={cn("inline-flex items-center rounded-sm px-1.5 py-px text-micro", it.tag === "missing" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
                      {TAG[it.tag]}
                    </span>
                  ) : null}
                </span>
                {it.text ? <span className={cn("text-small whitespace-pre-line", it.tag === "omitted" && "text-muted-foreground")}>{it.text}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
