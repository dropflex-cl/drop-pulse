// Piezas de la landing de DropFlex (design-system/landing.md, reference/Lp*/README.md).
// Medidas de design-system/reference/landing.css: móvil primero, escritorio desde `lg`.
import { Button } from "@/components/df/button";
import { Icon, type IconName } from "@/components/df/icon";
import { cn } from "@/lib/utils";

/** La única acción de la landing: crear la cuenta y conectar la tienda (onboarding O1). */
export const SIGNUP_HREF = "/auth/create-account";
export const LOGIN_HREF = "/auth/login";

const SECTIONS = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#beneficios", label: "Beneficios" },
  { href: "#preguntas", label: "Preguntas" },
];

/** Margen lateral de la landing: 16px en móvil, 80px en escritorio. */
export const gutter = "px-4 lg:px-20";

export function Brand() {
  return (
    <span className="flex items-center gap-2 text-heading tracking-brand">
      <span aria-hidden className="grid size-5.5 place-items-center rounded-sm bg-foreground text-caption font-bold text-background">
        D
      </span>
      DropFlex
    </span>
  );
}

/** LpNav: marca, secciones y la acción principal. En móvil, solo marca y "Empezar". */
export function LpNav() {
  return (
    <header className={cn("flex h-16 items-center gap-6 border-b border-border bg-background lg:h-18", gutter)}>
      <Brand />
      <nav aria-label="Secciones" className="flex flex-1 gap-6 max-lg:hidden">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href} className="text-small font-medium text-muted-foreground hover:text-foreground">
            {s.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <a href={LOGIN_HREF} className="text-small font-medium text-muted-foreground hover:text-foreground max-lg:hidden">
          Iniciar sesión
        </a>
        <Button href={SIGNUP_HREF} variant="primary" size="sm" className="lg:hidden">
          Empezar
        </Button>
        <Button href={SIGNUP_HREF} variant="primary" size="sm" className="max-lg:hidden">
          Conectar mi tienda
        </Button>
      </div>
    </header>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-label font-semibold text-primary">{children}</span>;
}

export function Lead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("m-0 max-w-[60ch] text-lead-sm text-pretty text-muted-foreground lg:text-lead", className)}>{children}</p>;
}

const h2 = "m-0 text-section-sm text-balance lg:text-section";

/** LpSectionHead: etiqueta en `primary`, título y bajada. */
export function LpSectionHead({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-content flex-col gap-3">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className={h2}>{title}</h2>
      {lead ? <Lead>{lead}</Lead> : null}
    </div>
  );
}

/** Sección de la landing: alterna `background` y `muted` para separar etapas sin líneas. */
export function LpSection({ id, muted, children }: { id?: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-4", muted && "bg-muted")}>
      <div className={cn("mx-auto flex max-w-landing flex-col gap-8 py-12 lg:py-24", gutter)}>{children}</div>
    </section>
  );
}

/** LpPain: un dolor en palabras del dropshipper. */
export function LpPain({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border border-border bg-card p-4">
      <span className="grid size-8 place-items-center rounded-sm bg-destructive-soft text-destructive">
        <Icon name={icon} size="sm" strokeWidth={2} />
      </span>
      <span>
        <b className="block text-row font-semibold">{title}</b>
        <small className="mt-0.5 block text-small text-muted-foreground">{text}</small>
      </span>
    </li>
  );
}

/** Pieza de la app con datos de ejemplo: ilustra, no se usa (`aria-hidden` e `inert`). */
export function LpDemo({ children, onMuted }: { children: React.ReactNode; onMuted?: boolean }) {
  return (
    <div aria-hidden inert className={cn("pointer-events-none min-w-0 rounded-lg p-4", onMuted ? "bg-background" : "bg-muted")}>
      {children}
    </div>
  );
}

/** LpStep: un paso de "Cómo funciona", con una pieza real de la app como prueba. */
export function LpStep({ n, title, text, children }: { n: number; title: string; text: string; children?: React.ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-foreground text-small font-semibold text-background">{n}</span>
        <div>
          <h3 className="m-0 text-metric">{title}</h3>
          <p className="mt-1 mb-0 text-body text-muted-foreground">{text}</p>
        </div>
      </div>
      {children ? <LpDemo>{children}</LpDemo> : null}
    </article>
  );
}

/** LpFeature: un beneficio con su prueba (una pieza de la app, nunca una cifra inventada). */
export function LpFeature({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <span className="mb-1 grid size-8 place-items-center rounded-sm bg-primary-soft text-primary">
          <Icon name={icon} size="sm" strokeWidth={2} />
        </span>
        <h3 className="m-0 text-metric">{title}</h3>
        <p className="m-0 text-body text-muted-foreground">{text}</p>
      </div>
      {children ? (
        <div className="mt-auto">
          <LpDemo onMuted>{children}</LpDemo>
        </div>
      ) : null}
    </article>
  );
}

/** LpFaq: pregunta desplegable con `details`/`summary` nativos (funciona sin JavaScript). */
export function LpFaq({ q, a, open }: { q: string; a: string; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-border">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 text-heading font-medium [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <Icon
          name="plus"
          size="sm"
          className="shrink-0 text-muted-foreground transition-transform duration-fast ease-standard group-open:rotate-45"
        />
      </summary>
      <p className="mt-0 mb-4 max-w-[65ch] text-body text-muted-foreground">{a}</p>
    </details>
  );
}

/** LpCta: cierre sobre `foreground`, una sola acción y la garantía de control. */
export function LpCta({ title, lead, cta, fine }: { title: string; lead?: string; cta: string; fine?: string }) {
  return (
    <section className="bg-foreground text-background">
      <div className={cn("mx-auto flex max-w-landing flex-col items-center gap-4 py-12 text-center lg:py-24", gutter)}>
        <h2 className={cn(h2, "max-w-[20ch]")}>{title}</h2>
        {lead ? <p className="m-0 max-w-[60ch] text-lead-sm text-pretty opacity-80 lg:text-lead">{lead}</p> : null}
        <div className="flex w-full justify-center">
          <Button href={SIGNUP_HREF} variant="primary" size="lg" iconEnd="chevron-right" className="max-lg:w-full">
            {cta}
          </Button>
        </div>
        {fine ? <p className="m-0 text-label font-normal opacity-75">{fine}</p> : null}
      </div>
    </section>
  );
}
