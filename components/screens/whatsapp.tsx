"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Icon, Notice, SegmentedControl, StageMeter, TopBar, notify } from "@/components/df";
import { AiCostButton, useStepCost } from "@/components/shell/ai-cost-provider";
import { AssistantButton, AssistantScope } from "@/components/shell/assistant-provider";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { productHref } from "@/lib/routes";
import type { ProductMessages } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EMPTY_ORDER, MESSAGE_GROUPS, MESSAGES, TIP_MESSAGE, areaLabel, missingPolicies, orderTotal, renderMessage, type MessageTemplate, type OrderFields, type RenderedMessage } from "@/lib/whatsapp/messages";

// Etapa WhatsApp: los mensajes para confirmar y seguir los pedidos, con los datos del producto y de
// Ajustes › Envíos y políticas. Los datos del cliente se escriben arriba (no se guardan) y cada mensaje
// se copia con el formato de WhatsApp (*negrita*, saltos de línea, emojis), listo para pegar.

/** Cuánto dura «Copiado» en el botón. */
const COPIED_MS = 2000;

/** Copia al portapapeles; con http en la red local (sin Clipboard API), con un textarea seleccionado. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Sigue con el respaldo.
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  el.remove();
  return ok;
}

/** «a», «a y b», «a, b y c». */
const listText = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

/** Un tramo del mensaje: los «[…]» que faltan se marcan para completarlos en WhatsApp. */
function Placeholders({ text }: { text: string }) {
  return text.split(/(\[[^\]\n]+\])/).map((part, i) =>
    /^\[[^\]\n]+\]$/.test(part) ? (
      <mark key={i} className="rounded-sm bg-warning-soft px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** El mensaje como se verá en WhatsApp: *negrita* en negrita, saltos de línea y emojis tal cual. */
function MessageBubble({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="ml-6 rounded-md bg-success-soft px-3 py-2 text-body break-words whitespace-pre-wrap text-foreground shadow-sm">
        {text.split(/(\*[^*\n]+\*)/).map((part, i) =>
          /^\*[^*\n]+\*$/.test(part) ? (
            <strong key={i} className="font-semibold">
              <Placeholders text={part.slice(1, -1)} />
            </strong>
          ) : (
            <Placeholders key={i} text={part} />
          ),
        )}
      </p>
    </div>
  );
}

function MessageCard({ template, message, onCopy, copied, children }: { template: MessageTemplate; message: RenderedMessage; onCopy: () => void; copied: boolean; children?: React.ReactNode }) {
  const titleId = `mensaje-${template.id}`;
  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-row">
            {template.title}
          </h3>
          <p className="text-caption text-muted-foreground">{template.when}</p>
        </div>
        <Button size="sm" icon={copied ? "check" : "copy"} onClick={onCopy} aria-label={copied ? `«${template.title}» copiado` : `Copiar «${template.title}»`}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <MessageBubble text={message.text} />
      {children}
    </article>
  );
}

export function MessagesScreen({ data }: { data: ProductMessages }) {
  const { product } = data;
  const router = useRouter();
  const [order, setOrder] = useState<OrderFields>(EMPTY_ORDER);
  const [tip, setTip] = useState(data.tip);
  const [writing, setWriting] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipCost = useStepCost("usage_tip");

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const facts = useMemo(() => ({ ...data.facts, tip: tip?.text ?? null }), [data.facts, tip]);
  const area = areaLabel(facts.countryCode);
  const missing = missingPolicies(facts);
  const packs = facts.packs.length > 1 ? facts.packs : [];
  const total = orderTotal(facts, order.units);
  const filled = order.name || order.address || order.area || order.tracking || order.trackingUrl || order.units !== 1;
  const rendered = useMemo(() => new Map(MESSAGES.map((m) => [m.id, renderMessage(m, facts, order)])), [facts, order]);

  const set = <K extends keyof OrderFields>(key: K) => (value: OrderFields[K]) => setOrder((o) => ({ ...o, [key]: value }));

  async function copy(template: MessageTemplate) {
    const message = rendered.get(template.id)!;
    if (!(await copyText(message.text))) {
      notify("No pudimos copiar. Mantén presionado el mensaje para copiarlo.");
      return;
    }
    setCopied(template.id);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    notify(message.missing.length ? `Mensaje copiado. Completa en WhatsApp: ${listText(message.missing)}.` : "Mensaje copiado. Pégalo en el chat de tu cliente.");
  }

  async function writeTip() {
    setWriting(true);
    setTipError(null);
    try {
      const res = await productsApi.writeUsageTip(product.id);
      setTip(res.tip);
      notify(tip ? "Consejo nuevo listo en el mensaje «Entregado»." : "Consejo listo en el mensaje «Entregado».");
      // El costo de IA del producto (barra superior y ruta) sale del servidor.
      router.refresh();
    } catch (e) {
      setTipError(e instanceof ProductApiClientError ? e.message : "No pudimos escribir el consejo. Intenta de nuevo en un momento.");
    } finally {
      setWriting(false);
    }
  }

  const tipControls = (
    <div className="flex flex-col gap-2 border-t pt-3">
      {tip ? (
        <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
          <Icon name="sparkle" size="sm" className="mt-px flex-none" />
          <span>Consejo escrito por la IA · fuente: {tip.basis}</span>
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">{data.tipBlocked ?? "La IA escribe un consejo de uso con la información del producto y lo suma a este mensaje."}</p>
      )}
      {data.tipBlocked ? null : (
        <Button size="sm" icon={tip ? "refresh" : "sparkle"} loading={writing} onClick={writeTip} className="self-start">
          {tip ? "Otro consejo" : "Escribir consejo con IA"}
          {tipCost ? <span className="font-normal text-muted-foreground">{tipCost}</span> : null}
        </Button>
      )}
      {tipError ? (
        <p role="alert" className="text-caption text-destructive">
          {tipError}
        </p>
      ) : null}
    </div>
  );

  // En móvil los datos van plegados (los mensajes primero); en escritorio ancho, siempre a la vista.
  const summary = [order.name, [order.address, order.area].filter(Boolean).join(", "), order.tracking].filter(Boolean).join(" · ");
  const orderCard = (
    <section aria-labelledby="datos-pedido" className="flex flex-col gap-3 rounded-lg border bg-card p-4 @4xl:sticky @4xl:top-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="datos-pedido" className="text-heading">
            Datos del pedido
          </h2>
          <p className={cn("text-label font-normal text-muted-foreground", !open && "@max-4xl:hidden")}>Opcional. Se suman a los mensajes al copiarlos y no se guardan.</p>
          {!open ? <p className="truncate text-label font-normal text-muted-foreground @4xl:hidden">{summary || "Opcional: nombre, dirección y guía de tu cliente."}</p> : null}
        </div>
        <div className="flex flex-none gap-1">
          {filled ? (
            <Button size="sm" variant="ghost" icon="x" onClick={() => setOrder(EMPTY_ORDER)}>
              Borrar
            </Button>
          ) : null}
          <Button size="sm" icon={open ? undefined : "edit"} aria-expanded={open} aria-controls="campos-pedido" onClick={() => setOpen((v) => !v)} className="@4xl:hidden">
            {open ? "Listo" : filled ? "Editar" : "Completar"}
          </Button>
        </div>
      </div>
      <div id="campos-pedido" className={cn("flex-col gap-3", open ? "flex" : "hidden @4xl:flex")}>
        <Field label="Nombre del cliente" value={order.name} onValueChange={set("name")} autoComplete="off" />
        {packs.length ? (
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-label">
              Cantidad
            </span>
            <SegmentedControl
              label="Cantidad"
              block
              value={String(order.units)}
              onChange={(v) => set("units")(Number(v))}
              options={packs.map((p) => ({ value: String(p.units), label: p.units === 1 ? "1 unidad" : `${p.units} unidades` }))}
            />
            {total != null ? <span className="text-caption text-muted-foreground tabular-nums">Total al recibir: {money(total, facts.currency)}</span> : null}
          </div>
        ) : null}
        <Field label="Dirección" value={order.address} onValueChange={set("address")} autoComplete="off" />
        <Field label={area} value={order.area} onValueChange={set("area")} autoComplete="off" />
        <Field label="N.º de seguimiento" value={order.tracking} onValueChange={set("tracking")} autoComplete="off" hint="Lo da Dropi al generar la guía." />
        <Field label="Link de seguimiento" value={order.trackingUrl} onValueChange={set("trackingUrl")} type="url" inputMode="url" autoComplete="off" />
      </div>
    </section>
  );

  return (
    <div className="@container flex flex-col">
      <AssistantScope productId={product.id} product={product.name} stage="WhatsApp" stageKey="mensajes" image={product.image} />
      <TopBar
        back={product.name}
        backHref={productHref(product.id)}
        title="WhatsApp"
        subtitle="Mensajes para confirmar y seguir pedidos"
        actions={
          <>
            <AiCostButton />
            <AssistantButton />
          </>
        }
        className="sticky top-0 z-sticky lg:hidden"
      />
      <div className="px-4 pb-2 lg:hidden">
        <StageMeter stages={product.meter} />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-2 pb-6 lg:px-7 lg:pt-5">
        <div className="hidden lg:block">
          <h2 className="text-title">WhatsApp</h2>
          <p className="text-caption text-muted-foreground">Mensajes para confirmar y seguir tus pedidos. Copia, pega en el chat del cliente y envía.</p>
        </div>

        {/* Escritorio ancho: los mensajes al centro y los datos del pedido fijos a la derecha. */}
        <div className="flex flex-col gap-4 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_--spacing(85)] @4xl:items-start @4xl:gap-7">
          <div className="@4xl:col-start-2 @4xl:row-start-1">{orderCard}</div>

          <div className="flex min-w-0 flex-col gap-6 @4xl:col-start-1 @4xl:row-start-1">
            {missing.length ? (
              <Notice
                tone="info"
                icon="settings"
                title="Completa Envíos y políticas."
                body={`Mientras tanto, los mensajes no mencionan ${listText(missing)}.`}
                action={
                  <Button href="/settings#envios" size="sm">
                    Abrir Ajustes
                  </Button>
                }
              />
            ) : null}

            {MESSAGE_GROUPS.map((group) => (
              <section key={group.id} aria-labelledby={`grupo-${group.id}`} className="flex flex-col gap-3">
                <div>
                  <h2 id={`grupo-${group.id}`} className="text-heading">
                    {group.title}
                  </h2>
                  <p className="text-label font-normal text-muted-foreground">{group.desc}</p>
                </div>
                {MESSAGES.filter((m) => m.group === group.id).map((m) => (
                  <MessageCard key={m.id} template={m} message={rendered.get(m.id)!} copied={copied === m.id} onCopy={() => copy(m)}>
                    {m.id === TIP_MESSAGE ? tipControls : null}
                  </MessageCard>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
