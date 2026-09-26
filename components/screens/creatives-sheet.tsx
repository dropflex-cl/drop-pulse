"use client";

import { IconButton } from "@/components/df";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useDesktop } from "@/components/shell/use-desktop";

/**
 * Hoja de Creativos (.df-sheet): abajo en móvil, a la derecha en escritorio. Título, cerrar, el
 * contenido y, si hay, las acciones fijas abajo.
 */
export function CreativesSheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Para lectores de pantalla, si el título no basta. */
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const desktop = useDesktop();
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} direction={desktop ? "right" : "bottom"} repositionInputs={false}>
      <DrawerContent className="max-h-[88svh] bg-popover lg:max-h-none lg:w-[min(--spacing(120),100vw)] lg:max-w-none">
        <div className="flex items-center gap-2 py-2 pr-2 pl-4">
          <DrawerTitle className="flex-1 text-heading">{title}</DrawerTitle>
          <IconButton icon="x" label="Cerrar" onClick={onClose} />
        </div>
        <DrawerDescription className="sr-only">{description ?? title}</DrawerDescription>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pb-4">{children}</div>
        {actions ? <div className="flex gap-2 border-t px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] [&>*]:flex-1">{actions}</div> : null}
      </DrawerContent>
    </Drawer>
  );
}
