import { Button } from "./button";
import { Icon } from "./icon";

export interface MontagePackageProps {
  clips: number;
  /** El JSON con los clips firmados. Sin él (clips sin terminar), el botón queda deshabilitado. */
  href?: string;
  /** Nombre del archivo que se descarga. */
  file: string;
  disabled?: boolean;
}

/** Material para la skill local de edición en CapCut (.df-montage). */
export function MontagePackage({ clips, href, file, disabled }: MontagePackageProps) {
  return (
    <section aria-label="Paquete de montaje" className="flex flex-col gap-3 rounded-lg border bg-card p-3.5">
      <div className="flex items-center gap-2.5">
        <Icon name="box" className="text-muted-foreground" />
        <div className="flex flex-col text-label font-normal text-muted-foreground">
          <b className="text-body font-semibold text-foreground">Paquete de montaje</b>
          {`${clips} ${clips === 1 ? "clip" : "clips"} · textos en pantalla · cierre`}
        </div>
      </div>
      <p className="flex items-start gap-1 text-caption text-muted-foreground">
        <Icon name="clock" size="sm" />
        Los enlaces del paquete duran 24 h desde que lo descargas. Si vencen, descárgalo de nuevo: los clips no se vuelven a crear.
      </p>
      {href && !disabled ? (
        <Button variant="primary" icon="download" block href={href} download={file} prefetch={false}>
          Descargar paquete JSON
        </Button>
      ) : (
        <Button variant="primary" icon="download" block disabled>
          Descargar paquete JSON
        </Button>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-label">En tu computador</span>
        <p className="text-caption text-muted-foreground">Abre el JSON en una tarea local de ChatGPT Work con la skill dropflex-capcut. La skill prepara los clips y guía la edición en CapCut: cortes, títulos, subtítulos y sonido.</p>
        <span className="text-caption text-muted-foreground">Exporta el MP4 vertical y súbelo aquí para revisarlo. Usa música y efectos con licencia para anuncios.</span>
      </div>
    </section>
  );
}
