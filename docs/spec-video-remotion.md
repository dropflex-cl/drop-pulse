# Remotion retirado

Remotion y su worker se retiraron a favor de [montaje local con Python/FFmpeg](spec-video-montage.md). No desplegar el Dockerfile ni ejecutar los comandos antiguos de worker.

Se retiraron el Player, la dirección creativa de pago en el servidor, sus rutas, scripts y dependencias. El paquete UGC, la generación en Higgsfield y la subida/revisión del video final continúan.

La migración `20261210000000_video_montage.sql` permanece como historial aplicado. `20261213000000_deprecate_video_montage.sql` cancela trabajos y revoca escritura/ejecución del worker anterior, sin borrar los planes históricos ni los videos finales. No requiere un worker de render en Vercel ni en otro host.
