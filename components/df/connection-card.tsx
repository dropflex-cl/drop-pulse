import { Icon, type IconName } from "./icon";
import { StateChip } from "./state-chip";
import { cn } from "@/lib/utils";

export type Provider = "shopify" | "meta" | "higgsfield";

// ProviderMark es genérico: en producción se reemplaza por el logo oficial de cada proveedor,
// según sus guías de marca. Este sistema no dibuja marcas de terceros.
const PROVIDERS: Record<Provider, { name: string; icon: IconName; what: string }> = {
  shopify: { name: "Shopify", icon: "store", what: "Tu tienda" },
  meta: { name: "Meta Ads", icon: "megaphone", what: "Tus anuncios" },
  higgsfield: { name: "Higgsfield", icon: "image", what: "Tus anuncios de imagen con IA" },
};

export function ProviderMark({ provider, size }: { provider: Provider; size?: "lg" }) {
  return (
    <span
      aria-hidden
      data-provider={provider}
      className={cn(
        "grid shrink-0 place-items-center rounded-md bg-muted text-foreground inset-ring inset-ring-border",
        size === "lg" ? "size-14" : "size-10",
      )}
    >
      <Icon name={PROVIDERS[provider].icon} />
    </span>
  );
}

export type ConnectionState = "idle" | "connecting" | "importing" | "connected" | "action" | "error" | "later";

const CHIP: Record<ConnectionState, Parameters<typeof StateChip>[0] | null> = {
  idle: null,
  connecting: { label: "Conectando", icon: "loader", tone: "progress", spin: true },
  importing: { label: "Importando", icon: "loader", tone: "progress", spin: true },
  connected: { label: "Conectada", icon: "check-circle", tone: "success" },
  action: { label: "Falta un paso", icon: "clock", tone: "warning" },
  error: { label: "Sin conexión", icon: "alert", tone: "danger" },
  later: { label: "Pendiente", icon: "minus", tone: "quiet" },
};

export interface ConnectionCardProps {
  provider: Provider;
  state?: ConnectionState;
  account?: string;
  /** Qué pasa (y, en error, qué pasó). */
  detail?: string;
  /** 0 a 1, mientras importa. */
  progress?: number;
  facts?: [string, string][];
  actions?: React.ReactNode;
  className?: string;
}

/** Estado de una integración (Shopify o Meta Ads) con lo que pasa y qué hacer. */
export function ConnectionCard({ provider, state = "idle", account, detail, progress, facts, actions, className }: ConnectionCardProps) {
  const p = PROVIDERS[provider];
  const chip = CHIP[state];
  return (
    <section
      aria-label={p.name}
      className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground", state === "error" && "border-destructive", className)}
    >
      <div className="flex items-center gap-3">
        <ProviderMark provider={provider} />
        <div className="min-w-0 flex-1">
          <p className="text-row font-semibold">{p.name}</p>
          <p className="truncate text-label font-normal text-muted-foreground">{account ?? p.what}</p>
        </div>
        {chip ? <StateChip {...chip} /> : null}
      </div>
      {progress != null ? (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label={`Importando productos de ${p.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted inset-ring inset-ring-border"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-slow ease-standard"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          {detail ? <p className="text-label font-normal text-muted-foreground">{detail}</p> : null}
        </div>
      ) : detail ? (
        <p
          className={cn(
            "text-label font-normal",
            state === "error" ? "text-destructive" : state === "action" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {detail}
        </p>
      ) : null}
      {facts?.length ? (
        <dl className="grid grid-cols-2 gap-2">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-sm bg-muted px-2 py-1.5">
              <dt className="text-micro text-muted-foreground">{k}</dt>
              <dd className="text-small font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
