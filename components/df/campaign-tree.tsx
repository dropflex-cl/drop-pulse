import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface TreeAd {
  name: string;
  type?: "image" | "video";
}

export interface TreeAdset {
  name: string;
  audience?: string;
  /** ABO: el presupuesto del conjunto («$5.000»). */
  budget?: string;
  ads?: TreeAd[];
}

export interface CampaignTreeProps {
  name: string;
  structure: "abo" | "cbo";
  /** CBO: el presupuesto de la campaña. */
  budget?: string;
  adsets: TreeAdset[];
  note?: string;
  className?: string;
}

const node = "grid grid-cols-[--spacing(4)_1fr_auto] items-center gap-2 rounded-sm bg-card px-2 py-1.5 my-1 inset-ring inset-ring-border";
const budgetTag = "rounded-sm bg-primary-soft px-1.5 py-px text-caption font-semibold whitespace-nowrap text-primary tabular-nums";

/** Lo que se creará en Meta: campaña → conjuntos → anuncios, con el presupuesto marcado donde vive. */
export function CampaignTree({ name, structure, budget, adsets, note, className }: CampaignTreeProps) {
  const abo = structure === "abo";
  return (
    <div className={cn("text-label font-normal", className)}>
      <ul role="tree" aria-label="Estructura de la campaña" className="m-0 list-none p-0">
        <li role="treeitem" aria-expanded aria-selected={false}>
          <div className={cn(node, "bg-muted inset-ring-0")}>
            <Icon name="megaphone" size="sm" className="text-muted-foreground" />
            <span className="min-w-0">
              <b className="block truncate font-medium">{name}</b>
              <small className="block text-micro text-muted-foreground">Campaña · Ventas · {abo ? "ABO" : "CBO"}</small>
            </span>
            {!abo && budget ? <span className={budgetTag}>{budget}/día</span> : <span />}
          </div>
          <ul role="group" className="m-0 ml-2.75 list-none border-l border-input p-0 pl-3">
            {adsets.map((a, i) => (
              <li key={i} role="treeitem" aria-expanded aria-selected={false}>
                <div className={node}>
                  <Icon name="box" size="sm" className="text-muted-foreground" />
                  <span className="min-w-0">
                    <b className="block truncate font-medium">{a.name}</b>
                    {a.audience ? <small className="block truncate text-micro text-muted-foreground">{a.audience}</small> : null}
                  </span>
                  {abo && a.budget ? <span className={budgetTag}>{a.budget}/día</span> : <span />}
                </div>
                {a.ads?.length ? (
                  <ul role="group" className="m-0 ml-2.75 list-none border-l border-input p-0 pl-3">
                    {a.ads.map((ad, j) => (
                      <li key={j} role="treeitem" aria-selected={false}>
                        <div className={node}>
                          <Icon name="image" size="sm" className="text-muted-foreground" />
                          <span className="min-w-0">
                            <b className="block truncate font-medium">{ad.name}</b>
                            <small className="block text-micro text-muted-foreground">{ad.type === "video" ? "Video" : ad.type === "image" ? "Imagen" : "Anuncio"}</small>
                          </span>
                          <span />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      </ul>
      {note ? <p className="mt-2 mb-0 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}
