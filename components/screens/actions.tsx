"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Icon, notify, type NativeButtonProps } from "@/components/df";
import { buttonVariants } from "@/components/ui/button";
import { productsApi } from "@/lib/products/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Lo que cuesta dinero (subir o apagar una campaña) pide un segundo toque; lo demás no.
 * El primer toque cambia el texto a “Confirmar: …” durante 4 s.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  done,
  ...props
}: Omit<NativeButtonProps, "onClick"> & { confirmLabel: string; done: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...props}
      aria-live="polite"
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        notify(done);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Acciones de una campaña según su veredicto. */
export function CampaignActions({
  verdict,
  nextBudget,
  detailHref,
  name,
}: {
  verdict: "subir" | "seguir" | "vigilar" | "apagar" | "aprendiendo";
  nextBudget?: string;
  detailHref?: string;
  name: string;
}) {
  if (verdict === "subir") {
    return [
      detailHref ? (
        <Button key="a" href={detailHref}>
          Ver detalle
        </Button>
      ) : (
        <Button key="a" onClick={() => notify("Presupuesto sin cambios")}>
          Mantener
        </Button>
      ),
      <ConfirmButton key="b" variant="primary" icon="arrow-up" confirmLabel={`Confirmar: ${nextBudget}`} done={`Presupuesto de “${name}” subido a ${nextBudget}`}>
        Subir a {nextBudget}
      </ConfirmButton>,
    ];
  }
  if (verdict === "apagar") {
    return [
      <Button key="a" onClick={() => notify(`“${name}” sigue activa`)}>
        Mantener
      </Button>,
      <ConfirmButton key="b" variant="destructive" icon="power" confirmLabel="Confirmar: apagar" done={`“${name}” apagada`}>
        Apagar
      </ConfirmButton>,
    ];
  }
  return null;
}

/** Nuevo producto (círculo primary). La importación aún no existe en esta versión. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Trae los productos activos de Shopify y borra, con todo lo suyo, los que se eliminaron allá. */
export function SyncProductsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      icon="refresh"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const { created, deleted, pending } = await productsApi.sync();
          const parts = [
            created && plural(created, "producto nuevo", "productos nuevos"),
            deleted && `${plural(deleted, "eliminado", "eliminados")} porque ya no están en Shopify`,
          ].filter(Boolean);
          notify(
            (parts.length ? `Sincronizado: ${parts.join(", ")}.` : "Todo al día con Shopify.") +
              (pending ? ` Faltan ${pending}: sincroniza otra vez para traerlos.` : ""),
          );
          router.refresh();
        } catch (e) {
          notify(e instanceof Error ? e.message : "No pudimos sincronizar con Shopify. Intenta de nuevo.");
        } finally {
          setLoading(false);
        }
      }}
    >
      Sincronizar
    </Button>
  );
}

/** Reintentar una publicación con error. */
export function RetryPublishButton(props: Omit<NativeButtonProps, "onClick">) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...props}
      loading={loading}
      onClick={() => {
        setLoading(true);
        window.setTimeout(() => {
          setLoading(false);
          notify("Reintento enviado. Te avisamos en Hoy cuando quede publicado.");
        }, 800);
      }}
    />
  );
}

/** “Más opciones” de una campaña. */
export function CampaignMenu({ name, href, paused }: { name: string; href: string; paused?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Más opciones de ${name}`} title="Más opciones" className={buttonVariants({ variant: "ghost", size: "icon" })}>
        <Icon name="more" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-focus="within" className="min-w-48 rounded-md p-1">
        <DropdownMenuItem asChild className="min-h-touch gap-3 rounded-sm text-body">
          <Link href={href}>
            <Icon name="chevron-right" size="sm" />
            Ver detalle
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-touch gap-3 rounded-sm text-body"
          onSelect={() => notify(paused ? `“${name}” reanudada` : `“${name}” pausada`)}
        >
          <Icon name="pause" size="sm" />
          {paused ? "Reanudar campaña" : "Pausar campaña"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
