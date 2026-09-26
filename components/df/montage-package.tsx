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

/** El paquete JSON para montar el video en el computador con scripts/ugc-montage.py (.df-montage). */
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
        <pre className="m-0 overflow-auto rounded-md bg-muted px-3 py-2.5 font-mono text-label font-normal whitespace-pre text-foreground">{`python3 scripts/ugc-montage.py \\\n  ~/Downloads/${file} \\\n  --music musica.mp3`}</pre>
        <span className="text-caption text-muted-foreground">--music es opcional; usa una pista con licencia comercial. Sale un MP4 9:16 de ~30 s.</span>
      </div>
    </section>
  );
}
