import { Button, EmptyState } from "@/components/df";

// «Conecta Anthropic»: lo que muestra una pantalla en vez de la acción que arranca la IA cuando el
// comerciante no conectó su clave de Anthropic (Product.aiConnected === false). Igual que «Conecta
// Higgsfield» en Creativos: un EmptyState con «Ir a Ajustes», donde se conecta una vez para todos los
// productos. Lo ya generado se sigue viendo; solo se pide la clave para generar.

export const AI_SETTINGS_HREF = "/settings#ia";

/** La línea de la barra de acción cuando falta la clave (Información base y pies de pantalla). */
export const CONNECT_AI_NOTE = "Conecta Anthropic para usar la IA: se conecta una vez en Ajustes y sirve para todos tus productos.";

export function ConnectAnthropic({ what, className }: { what: string; className?: string }) {
  return (
    <EmptyState
      icon="text"
      title="Conecta Anthropic"
      body={`La IA ${what} con tu cuenta de Anthropic (Claude). Se conecta una vez en Ajustes y sirve para todos tus productos.`}
      action={
        <Button variant="primary" icon="settings" href={AI_SETTINGS_HREF}>
          Ir a Ajustes
        </Button>
      }
      className={className}
    />
  );
}
