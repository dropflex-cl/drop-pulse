import { Button } from "./button";
import { SOFT } from "./creative-piece";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export type ChatModuleState = "new" | "created" | "working" | "review" | "approved";

export interface ChatModuleProps {
  state: ChatModuleState;
  onAction?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const SUB: Record<ChatModuleState, string> = {
  new: "Captura 9:16 · conversación armada, requiere aviso",
  created: "Chat creado · falta generar la captura 9:16",
  working: "Generando la captura 9:16",
  review: "Captura lista para revisar",
  approved: "Captura en Anuncios",
};

/**
 * El chat de WhatsApp de un ángulo (.df-chatmod): otro formato, fuera de la grilla de conceptos. Va al
 * pie de cada AngleGroup, con borde punteado. Crearlo abre la hoja con ChatConsent.
 */
export function ChatModule({ state, onAction, disabled, loading }: ChatModuleProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border-(length:--stroke-strong) p-3", state === "approved" ? "border-border" : "border-dashed border-input bg-muted")}>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-foreground inset-ring inset-ring-border">
        <Icon name="chat" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="text-small font-semibold">Chat de WhatsApp</b>
        <span className="text-caption text-muted-foreground">{SUB[state]}</span>
      </div>
      {state === "approved" ? (
        <>
          <StatusBadge size="sm" status="aprobado" label="En Anuncios" />
          {onAction ? (
            <Button variant="ghost" size="sm" onClick={onAction} aria-label="Abrir el chat de WhatsApp">
              Abrir
            </Button>
          ) : null}
        </>
      ) : (
        <Button
          variant={state === "review" ? "secondary" : "ghost"}
          size="sm"
          icon={state === "new" ? "plus" : undefined}
          className={state === "review" ? SOFT : undefined}
          disabled={disabled}
          loading={loading}
          onClick={onAction}
        >
          {state === "new" ? "Crear chat" : state === "review" ? "Revisar" : "Abrir"}
        </Button>
      )}
    </div>
  );
}
