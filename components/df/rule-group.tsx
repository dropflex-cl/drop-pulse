"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

export type RuleGroupKind = "wait" | "pause" | "scale";

export interface RuleGroupProps {
  kind: RuleGroupKind;
  desc?: string;
  /** «Por conjunto», «Por anuncio» o «Campaña». */
  level?: string;
  /** Condiciones que se pueden agregar («Agregar condición»); vacío la oculta. */
  add?: { label: string; onSelect: () => void }[];
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const RG: Record<RuleGroupKind, { title: string; desc: string; icon: IconName; tone: string }> = {
  wait: { title: "Esperar", desc: "No decidir mientras Meta aprende", icon: "clock", tone: "bg-muted text-foreground" },
  pause: { title: "Pausar", desc: "Cortar lo que pierde dinero", icon: "pause", tone: "bg-destructive-soft text-destructive" },
  scale: { title: "Escalar", desc: "Subir presupuesto a lo que gana", icon: "trend", tone: "bg-success-soft text-success" },
};

/** Grupo de reglas: Esperar (manda), Pausar y Escalar, en ese orden de evaluación. */
export function RuleGroup({ kind, desc, level, add, disabled, children, className }: RuleGroupProps) {
  const g = RG[kind];
  return (
    <section aria-label={g.title} className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="grid grid-cols-[--spacing(7)_1fr_auto] items-center gap-3 border-b px-4 py-3">
        <span className={cn("grid size-7 place-items-center rounded-sm", g.tone)}>
          <Icon name={g.icon} size="sm" strokeWidth={2} />
        </span>
        <span>
          <b className="block text-row font-semibold">{g.title}</b>
          <small className="block text-caption text-muted-foreground">{desc ?? g.desc}</small>
        </span>
        {level ? <span className="rounded-sm bg-muted px-1.5 py-px text-micro text-muted-foreground">{level}</span> : null}
      </div>
      <ul className="m-0 list-none p-0">{children}</ul>
      {add?.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button type="button" className="flex h-touch w-full cursor-pointer items-center gap-1.5 border-t px-4 text-label text-primary hover:bg-accent disabled:cursor-default disabled:opacity-60">
              <Icon name="plus" size="sm" />
              Agregar condición
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {add.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onSelect} className="min-h-touch">
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </section>
  );
}
