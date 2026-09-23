"use client";

import { usePathname } from "next/navigation";
import { Suspense, use, useEffect } from "react";
import { Navigation, type NavId } from "@/components/df";
import { AssistantPanel, useAssistant } from "./assistant-provider";
import { useDesktop } from "./use-desktop";

// Las pantallas de etapa (información base, revisión, imágenes, precio) ocupan el alto completo con su propia barra
// de acción, sin barra de pestañas (design-system/reference/bundle.js → ScreenRevision/Imagenes/Precio).
const STAGE_SCREEN = /^\/products\/[^/]+\/(base|angles|copy|images|price)$/;

type Badges = Partial<Record<NavId, number>>;

/**
 * La navegación depende de la ruta (pestaña activa) y de los números de Hoy, que se calculan con
 * Supabase. Va en Suspense: en rutas con parámetros que solo se conocen al pedirlas
 * (/products/[id]), la ruta no existe al prerenderizar y el resto de la página no la espera.
 */
function Nav({ variant, badges }: { variant?: "rail"; badges?: Promise<Badges> }) {
  const fallback = variant === "rail" ? <div aria-hidden className="h-svh w-rail border-r bg-sidebar" /> : <div aria-hidden className="h-tabbar border-t bg-background" />;
  return (
    <Suspense fallback={fallback}>
      <NavWithBadges variant={variant} badges={badges} />
    </Suspense>
  );
}

function NavWithBadges({ variant, badges }: { variant?: "rail"; badges?: Promise<Badges> }) {
  return <Navigation variant={variant} badges={badges ? use(badges) : undefined} />;
}

/** Barra de pestañas (móvil). Se oculta en las pantallas de etapa, que traen su propia barra de acción. */
function Tabbar({ badges }: { badges?: Promise<Badges> }) {
  const pathname = usePathname();
  const desktop = useDesktop();
  const showTabbar = !desktop && !STAGE_SCREEN.test(pathname);

  // La barra fija de acción y el toast se apoyan sobre la barra de pestañas cuando está visible.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--df-tabbar-h", showTabbar ? "calc(var(--size-tabbar) + env(safe-area-inset-bottom))" : "0px");
    root.setProperty("--df-sticky-safe", showTabbar ? "0px" : "env(safe-area-inset-bottom)");
    return () => {
      root.removeProperty("--df-tabbar-h");
      root.removeProperty("--df-sticky-safe");
    };
  }, [showTabbar]);

  return showTabbar ? (
    <div className="fixed inset-x-0 bottom-0 z-nav lg:hidden">
      <Nav badges={badges} />
    </div>
  ) : null;
}

/**
 * Móvil (<1024px): contenido + barra de 3 pestañas abajo. Escritorio: riel de 232px a la izquierda
 * y, si está abierto, el asistente como panel derecho de 340px, sin tapar el trabajo.
 */
export function AppShell({ children, badges }: { children: React.ReactNode; badges?: Promise<Badges> }) {
  const desktop = useDesktop();
  const { open } = useAssistant();

  return (
    <>
      <a
        href="#contenido"
        className="sr-only z-toast rounded-md bg-background px-4 py-3 text-body focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <div className="lg:flex">
        <div className="sticky top-0 hidden h-svh shrink-0 lg:block">
          <Nav variant="rail" badges={badges} />
        </div>
        <main id="contenido" className="min-h-svh min-w-0 flex-1 pb-[var(--df-tabbar-h,0px)] lg:pb-0">
          {children}
        </main>
        {desktop && open ? (
          <div className="sticky top-0 h-svh w-85 shrink-0">
            <AssistantPanel variant="panel" />
          </div>
        ) : null}
      </div>
      <Suspense fallback={null}>
        <Tabbar badges={badges} />
      </Suspense>
    </>
  );
}
