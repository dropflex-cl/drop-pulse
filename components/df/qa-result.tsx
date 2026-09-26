import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export interface QaResultProps {
  /** Lo que encontró el QA; vacía = sin detalles. */
  issues?: string[];
  /** Por defecto «Texto y producto revisados»; en imágenes clave, «Manos, cara y producto OK». */
  okLabel?: string;
  className?: string;
}

/**
 * Lo que revisó Claude con visión sobre una pieza (.df-qa). Nunca bloquea aprobar: el comerciante decide.
 * Con detalles no depende solo del color: ícono y «Revisa: N detalles».
 */
export function QaResult({ issues = [], okLabel = "Texto y producto revisados", className }: QaResultProps) {
  if (!issues.length) {
    return (
      <div className={cn("flex items-center gap-1.5 rounded-md bg-success-soft px-2.5 py-2 text-label text-success", className)}>
        <Icon name="check-circle" size="sm" strokeWidth={2} />
        {okLabel}
      </div>
    );
  }
  return (
    <div role="status" className={cn("flex flex-col gap-1 rounded-md bg-warning-soft px-2.5 py-2 text-label text-foreground", className)}>
      <div className="flex items-center gap-1.5 font-semibold text-warning">
        <Icon name="alert" size="sm" strokeWidth={2} />
        {`Revisa: ${detailCount(issues.length)}`}
      </div>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 font-normal">
        {issues.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export const detailCount = (n: number) => (n === 1 ? "1 detalle" : `${n} detalles`);
