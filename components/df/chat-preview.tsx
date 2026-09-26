import { cn } from "@/lib/utils";

export interface ChatMessage {
  /** Lo escribe el lector (derecha). */
  me?: boolean;
  text: string;
  time: string;
  /** La burbuja lleva la foto del producto; `text` es su pie. */
  photo?: boolean;
}

export interface ChatPreviewProps {
  contact: string;
  messages: ChatMessage[];
  /** La foto del producto que va en la burbuja con foto. */
  image?: string;
  className?: string;
}

/**
 * La conversación como se verá en la captura 9:16 (.df-wa). Colores neutros: no imita la marca ni la
 * interfaz de WhatsApp; el aspecto final lo define el render.
 */
export function ChatPreview({ contact, messages, image, className }: ChatPreviewProps) {
  return (
    <div role="img" aria-label={`Vista previa del chat con ${contact}: ${messages.length} mensajes`} className={cn("overflow-hidden rounded-lg border bg-muted", className)}>
      <div className="flex items-center gap-2.5 border-b bg-card px-3 py-2.5">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-chart-3 text-small font-semibold text-foreground">
          {Array.from(contact.trim())[0] ?? "C"}
        </span>
        <div className="flex flex-col text-caption text-muted-foreground">
          <b className="text-body font-semibold text-foreground">{contact}</b>
          en línea
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <span className="self-center rounded-sm bg-card px-2 py-0.5 text-micro text-muted-foreground">Hoy</span>
        {messages.map((m, i) => (
          <div key={i} className={cn("flex max-w-[78%] flex-col rounded-md px-2 pt-1.5 pb-1 text-small shadow-sm", m.me ? "self-end bg-success-soft" : "self-start bg-card")}>
            {m.photo ? (
              image ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
                <img src={image} alt="" className="mb-1 size-40 rounded-sm object-cover" />
              ) : (
                <span className="mb-1 grid size-40 place-items-center rounded-sm bg-muted text-caption text-muted-foreground">Foto del producto</span>
              )
            ) : null}
            <span>{m.text}</span>
            <small className="self-end text-micro text-muted-foreground tabular-nums">{m.time}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
