"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AssistantButton as DfAssistantButton, AssistantSheet, IconButton, notify, type AssistantMessage } from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { ASSISTANT_THREADS, DEFAULT_SUGGESTIONS, OFFLINE_REPLY } from "@/lib/mock/assistant";
import { useDesktop } from "./use-desktop";

/** Sobre qué responde el asistente: el producto y la etapa de la pantalla actual. */
export interface AssistantScopeValue {
  productId: string;
  product: string;
  /** “Precio”, “Textos”… */
  stage?: string;
  stageKey?: string;
  image?: string;
}

interface AssistantState {
  open: boolean;
  scope: AssistantScopeValue | null;
  openAssistant: () => void;
  closeAssistant: () => void;
  setScope: (scope: AssistantScopeValue | null) => void;
}

const Ctx = createContext<AssistantState | null>(null);

export function useAssistant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant fuera de AssistantProvider");
  return ctx;
}

/**
 * El asistente no es una ruta: es una capa global con el contexto de la pantalla actual.
 * Móvil: hoja inferior al 60% sobre la pantalla (que sigue montada). Escritorio: panel derecho (lo dibuja AppShell).
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<AssistantScopeValue | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const openAssistant = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const closeAssistant = useCallback(() => {
    setOpen(false);
    // Devuelve el foco a quien lo abrió.
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  const value = useMemo(() => ({ open, scope, openAssistant, closeAssistant, setScope }), [open, scope, openAssistant, closeAssistant]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <AssistantSheetLayer />
    </Ctx.Provider>
  );
}

/** Declara el contexto del asistente para la pantalla actual. Cambia solo al navegar. */
export function AssistantScope(props: AssistantScopeValue) {
  const { setScope } = useAssistant();
  const { productId, product, stage, stageKey, image } = props;
  useEffect(() => {
    setScope({ productId, product, stage, stageKey, image });
    return () => setScope(null);
  }, [setScope, productId, product, stage, stageKey, image]);
  return null;
}

/** El destello de la barra superior: mismo lugar, mismo ícono en cada pantalla de producto. */
export function AssistantButton({ scope, label }: { scope?: string; label?: string } = {}) {
  const { openAssistant } = useAssistant();
  // Con alcance (etapas rediseñadas, design-system/creativos.md): el botón del asistente de la etapa.
  if (scope || label) return <DfAssistantButton scope={scope} label={label} onClick={openAssistant} />;
  return <IconButton icon="sparkle" label="Abrir asistente" onClick={openAssistant} />;
}

function useThread(scope: AssistantScopeValue | null) {
  const key = scope ? `${scope.productId}:${scope.stageKey ?? ""}` : "general";
  const [threads, setThreads] = useState<Record<string, AssistantMessage[]>>({});
  const seed = ASSISTANT_THREADS[key];
  const messages = threads[key] ?? seed?.messages ?? [];
  const send = (text: string) =>
    setThreads((t) => ({ ...t, [key]: [...(t[key] ?? seed?.messages ?? []), { from: "user", text }, { from: "ai", text: OFFLINE_REPLY }] }));
  return { messages, suggestions: seed?.suggestions ?? DEFAULT_SUGGESTIONS, send };
}

/** Panel del asistente (escritorio o dentro de la hoja). */
export function AssistantPanel({ variant }: { variant: "sheet" | "panel" }) {
  const { scope, closeAssistant } = useAssistant();
  const { messages, suggestions, send } = useThread(scope);
  const context = scope ? [scope.product, scope.stage].filter(Boolean).join(" · ") : undefined;
  return (
    <AssistantSheet
      variant={variant}
      grab={false}
      autoFocus
      context={context}
      contextImage={scope?.image}
      messages={messages}
      suggestions={suggestions}
      placeholder={scope ? "Pregunta sobre este producto" : "Pregunta lo que necesites"}
      onClose={closeAssistant}
      onSend={send}
      // Lo que propone el asistente entra al ciclo como `generado`; nunca se aplica directo.
      onApply={(m) => notify(`Propuesta creada: “${m.apply}”. Revísala antes de publicarla.`)}
      renderTitle={
        variant === "sheet"
          ? (title) => (
              <>
                <DrawerTitle asChild>{title}</DrawerTitle>
                <DrawerDescription className="sr-only">Responde sobre {context ?? "tus productos"}.</DrawerDescription>
              </>
            )
          : undefined
      }
      className={variant === "sheet" ? "min-h-0 flex-1 rounded-none bg-transparent shadow-none" : undefined}
    />
  );
}

function AssistantSheetLayer() {
  const { open, closeAssistant } = useAssistant();
  const desktop = useDesktop();
  if (desktop) return null;
  return (
    <Drawer open={open} onOpenChange={(o) => (o ? null : closeAssistant())} repositionInputs={false}>
      <DrawerContent className="h-3/5 max-h-none duration-slow ease-enter data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none">
        <AssistantPanel variant="sheet" />
      </DrawerContent>
    </Drawer>
  );
}
