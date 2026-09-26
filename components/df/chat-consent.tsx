import { useId } from "react";
import { Button } from "./button";
import { Icon } from "./icon";

export interface ChatConsentProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onCreate: () => void;
  loading?: boolean;
  /** El costo de escribir el chat, ya formateado: «≈ $15». */
  cost?: string;
}

/**
 * Aviso obligatorio antes de crear un chat de WhatsApp armado (.df-consent). «Crear chat» queda
 * deshabilitado hasta marcar la casilla; el servidor exige `acknowledged` igual.
 */
export function ChatConsent({ checked, onCheckedChange, onCreate, loading, cost }: ChatConsentProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-3 rounded-md bg-warning-soft p-3">
        <Icon name="shield" className="text-warning" />
        <div>
          <b className="text-body font-semibold">Es una conversación armada</b>
          <p className="mt-0.5 text-small">No es de un cliente real. Meta puede rechazar un anuncio que presente un testimonio inventado, y tu cuenta puede recibir una advertencia.</p>
        </div>
      </div>
      <label htmlFor={id} className="flex min-h-touch cursor-pointer items-start gap-2.5 text-body">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className="mt-px size-5 shrink-0 accent-primary" />
        <span>Entiendo que es una conversación armada y me hago responsable de cómo la uso.</span>
      </label>
      <Button variant="primary" size="lg" block icon="chat" disabled={!checked} loading={loading} onClick={onCreate}>
        {cost ? `Crear chat · ${cost}` : "Crear chat"}
      </Button>
    </div>
  );
}
