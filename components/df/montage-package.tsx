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

/** Material para el montaje local con Python/FFmpeg (.df-montage). */
export function MontagePackage({ clips, href, file, disabled }: MontagePackageProps) {
  return (
    <section aria-label="Paquete de montaje" className="flex flex-col gap-3 rounded-lg border bg-card p-3.5">
      <div className="flex items-center gap-2.5">
        <Icon name="box" className="text-muted-foreground" />
        <div className="flex flex-col text-label font-normal text-muted-foreground">
          <b className="text-body font-semibold text-foreground">Paquete de montaje</b>
          {`${clips} ${clips === 1 ? "clip" : "clips"} · video y voz`}
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
        <p className="text-caption text-muted-foreground">Abre el JSON en una tarea local de ChatGPT Work o Codex y pide unir los clips hablados y de apoyo en un solo video con la voz original.</p>
        <span className="text-caption text-muted-foreground">El montaje no añade subtítulos, textos, música ni efectos. Sube el MP4 aquí para revisarlo.</span>
      </div>
    </section>
  );
}
