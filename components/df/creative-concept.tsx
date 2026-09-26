import { useId } from "react";
import { CharCount } from "./char-count";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

export interface ConceptText {
  /** Nombre del rol en español: «Titular», «Bajada», «Sello». */
  role: string;
  value: string;
  /** Máximo de caracteres para ese rol (el mismo que valida el servidor). */
  limit?: number;
}

export interface CreativeConceptProps {
  /** Número del concepto dentro de su ángulo (1–3). */
  slot?: number;
  title: string;
  /** La familia: «Problema → solución», «Chat de WhatsApp». */
  family: string;
  /** El estilo (preset) o, sin preset, «Edición directa». */
  style?: string;
  /** `plain`: la etiqueta va tal cual («Captura 9:16»). */
  styleKind?: "preset" | "direct" | "plain";
  why?: string;
  look?: string;
  texts?: ConceptText[];
  /** Filas de CreativePiece. */
  pieces?: React.ReactNode;
  editing?: boolean;
  onTextChange?: (index: number, value: string) => void;
  /** Hay una pieza generándose: Editar se deshabilita y dice por qué. */
  locked?: boolean;
  onEdit?: () => void;
  /** Solo cabecera y piezas (la lista); el título abre el detalle. */
  compact?: boolean;
  onOpen?: () => void;
  /** El concepto está elegido (panel derecho en escritorio). */
  selected?: boolean;
  /** Reemplaza el bloque de textos (la vista previa del chat). */
  body?: React.ReactNode;
  /**
   * El peso en la lista según lo que pide decidir: `review` (borde de aviso, «Decide»), `normal`
   * (sobre el fondo) o `done` (compacto: una fila plegada con check y miniaturas).
   */
  emphasis?: "review" | "normal" | "done";
  /** `done` compacto: las miniaturas de lo aprobado. */
  thumbs?: { src?: string; ratio: "1:1" | "9:16" }[];
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Un concepto de anuncio propuesto por Claude, para revisar antes de pagar la imagen (.df-concept):
 * familia, estilo, por qué, cómo se verá y los textos que irán dentro de la imagen.
 */
export function CreativeConcept(p: CreativeConceptProps) {
  const id = useId();
  const busyId = `${id}-busy`;
  const texts = p.texts ?? [];
  const emphasis = p.emphasis ?? "normal";
  const meta = [p.family, p.styleKind === "direct" ? "Edición directa" : p.style].filter(Boolean).join(" · ");

  // Aprobado, en la lista: una fila plegada que abre el detalle.
  if (p.compact && emphasis === "done") {
    const n = p.thumbs?.length ?? 0;
    return (
      <article aria-labelledby={`${id}-t`} className={cn("flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5", p.selected && "border-primary inset-ring inset-ring-primary", p.className)}>
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <Icon name="check" size="sm" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" id={`${id}-t`} onClick={p.onOpen} aria-current={p.selected || undefined} className="cursor-pointer rounded-sm text-left text-small font-medium hover:underline">
            {p.title}
          </button>
          <p className="text-label font-normal text-muted-foreground">{`${n} ${n === 1 ? "pieza" : "piezas"} en Anuncios`}</p>
        </div>
        <div className="flex items-center gap-1">
          {p.thumbs?.map((t, i) =>
            t.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, sin optimizador
              <img key={i} src={t.src} alt="" className={cn("rounded-kbd bg-muted object-cover", t.ratio === "9:16" ? "h-9 w-5" : "size-8")} />
            ) : null,
          )}
        </div>
        <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
      </article>
    );
  }

  const review = emphasis === "review";
  return (
    <article
      aria-labelledby={`${id}-t`}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border px-3.5 pt-3 text-card-foreground",
        p.editing ? "pb-3.5" : "pb-1",
        p.compact && emphasis === "normal" ? "bg-background" : "bg-card",
        review && "border-warning shadow-sm inset-ring inset-ring-warning",
        p.selected && "border-primary inset-ring inset-ring-primary",
        p.className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {p.slot ? (
          <span
            aria-label={`Concepto ${p.slot}`}
            className={cn("grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold", p.compact && !review ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary")}
          >
            {p.slot}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {p.onOpen ? (
            <button type="button" id={`${id}-t`} onClick={p.onOpen} aria-current={p.selected || undefined} className={cn("cursor-pointer rounded-sm text-left font-semibold hover:underline", review ? "text-heading" : "text-body")}>
              {p.title}
            </button>
          ) : (
            <h3 id={`${id}-t`} className="text-body font-semibold">
              {p.title}
            </h3>
          )}
          {meta ? <p className="mt-0.5 text-label font-normal text-muted-foreground">{meta}</p> : null}
        </div>
        {review && p.compact ? <StatusBadge size="sm" status="revision" label="Decide" /> : null}
      </div>

      {p.compact ? null : (
        <>
          {p.why ? <ConceptField label="Por qué">{p.why}</ConceptField> : null}
          {p.look ? <ConceptField label="Cómo se verá">{p.look}</ConceptField> : null}
          {p.body ?? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-caption font-semibold text-muted-foreground">
                Textos dentro de la imagen
                {!p.editing && p.onEdit ? (
                  <button
                    type="button"
                    onClick={p.onEdit}
                    disabled={p.locked}
                    aria-describedby={p.locked ? busyId : undefined}
                    className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-small font-medium text-primary underline underline-offset-3 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    <Icon name="edit" size="sm" />
                    Editar
                  </button>
                ) : null}
              </div>
              {p.locked && !p.editing ? (
                <p id={busyId} className="text-caption text-muted-foreground">
                  No se puede editar mientras se genera una pieza.
                </p>
              ) : null}
              <dl className="m-0 flex flex-col gap-1.5">
                {texts.map((t, i) => {
                  const over = t.limit != null && t.value.length > t.limit;
                  const inputId = `${id}-x${i}`;
                  return (
                    <div key={i} className={cn("flex flex-col gap-0.5 rounded-md px-2.5 py-2", over ? "bg-destructive-soft" : "bg-muted")}>
                      <dt className="flex justify-between gap-2 text-caption font-medium text-muted-foreground">
                        {p.editing ? <label htmlFor={inputId}>{t.role}</label> : t.role}
                        <CharCount count={t.value.length} limit={t.limit} live={p.editing} />
                      </dt>
                      {p.editing ? (
                        <dd className="m-0">
                          <input
                            id={inputId}
                            value={t.value}
                            onChange={(e) => p.onTextChange?.(i, e.target.value)}
                            aria-invalid={over || undefined}
                            aria-describedby={over ? `${inputId}-e` : undefined}
                            className={cn(
                              "h-control w-full rounded-sm border bg-background px-2.5 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              over ? "border-destructive" : "border-input",
                            )}
                          />
                          {over ? (
                            <span id={`${inputId}-e`} className="mt-1 block text-label font-normal text-destructive">
                              {`Máximo ${t.limit} para un ${t.role.toLowerCase()}. Acórtalo para que se lea en la imagen.`}
                            </span>
                          ) : null}
                        </dd>
                      ) : (
                        <dd className="m-0 text-small font-medium">{t.value}</dd>
                      )}
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </>
      )}
      {p.pieces && !p.editing ? <div className="flex flex-col">{p.pieces}</div> : null}
      {p.footer}
    </article>
  );
}

function ConceptField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption font-semibold text-muted-foreground">{label}</span>
      <p className="text-small">{children}</p>
    </div>
  );
}

/** Etiqueta neutra (.df-tag): familia, estilo, tipo de toma. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-5.5 items-center rounded-full bg-muted px-2 text-caption font-medium whitespace-nowrap text-muted-foreground", className)}>{children}</span>;
}
