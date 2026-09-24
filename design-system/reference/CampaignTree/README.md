# CampaignTree

Vista previa en vivo de lo que se creará en Meta: campaña → conjuntos → anuncios, con el presupuesto donde vive.

- **Qué provees:** `name`, `structure` (`abo` | `cbo`), `budget` (CBO), `adsets` (`{ name, audience, budget, ads: [{ name, type }] }`), `note`.
- El presupuesto se marca en `primary-soft` en el nivel que corresponde (conjunto en ABO, campaña en CBO): es la diferencia clave entre las dos estructuras, y se ve.
- En escritorio vive fijo a la derecha del configurador; en móvil aparece en "Revisar y lanzar".
