# Activación de PDP por ángulo en producción

Autorizada expresamente por el comerciante el 2026-10-07: commit, push a `main` y activación de la feature.

Commit funcional: `cb0583ba78bbc67e1774b0eb860cad5423537a95`. Git confirmó ese SHA en `origin/main`. El estado Vercel del commit terminó en `success` / «Deployment has completed»: [despliegue](https://vercel.com/dropflex-cl/drop-pulse/AgdMRvJJXqj4gg3u5LkL5S38WcSc).

## Configuración y base

`vercel.json` establece `PDP_PERSUASION_ENABLED=true` para las funciones del despliegue y conserva la región `gru1`. Es un flag no secreto, versionado para esta activación. La migración `20261123000000` habilita productos actuales y cambia el valor por defecto a `true` para futuras sincronizaciones. El switch por producto permite excluirlos individualmente.

Proyecto Supabase vinculado: `oukcswnfrzroxgwqmujf`. Se preparó un directorio temporal con las migraciones existentes de producción y únicamente estas cuatro migraciones nuevas. `supabase db push --linked --dry-run` confirmó esa selección; `supabase db push --linked --yes` las aplicó correctamente:

- `20261120000000_pdp_persuasion.sql`
- `20261121000000_pdp_content_bindings.sql`
- `20261122000000_pdp_learning_refs.sql`
- `20261123000000_enable_pdp_persuasion.sql`

Las migraciones independientes `20261118000000` (limpieza destructiva de análisis legacy) y `20261119000000` (crons de recuperación) permanecen pendientes. No se marcaron como aplicadas ni se ejecutaron. Antes de cualquier `db push` futuro, revisar esa divergencia explícitamente; no aplicar la limpieza como parte de PDP.

## Comprobaciones y límites

La [evidencia SQL agregada](production-pdp-migrations-2026-10-07.json) confirma las cuatro versiones, default `true`, RLS en las tres tablas nuevas, ausencia de SELECT para anon/authenticated y RPC de escritura/lectura limitadas a service_role. Helpers y writers internos legacy no tienen EXECUTE de service_role. Las tablas nuevas están vacías; no se crearon fixtures en producción.

La base tenía cero productos antes y después. Por tanto, la activación aplica a productos futuros; no existen experiencias reales publicadas para probar routing por ángulo en una tienda. No se aprobaron planes, publicaron productos ni modificaron temas de comerciantes.

Product Intelligence volvió a pasar sus 335 tests locales con el flag de entorno encendido y el nuevo default aplicado. Las comprobaciones previas de build, tipos, contratos, kit y browser están registradas en el [runbook](pdp-persuasion-runbook.md). El despliegue público se comprobó después del estado Vercel exitoso: landing y discovery OAuth responden 200, la ruta PDP sin sesión responde 401 JSON y discovery conserva `gru1::gru1`. No se verificó un `tools/list` con una sesión OAuth de comerciante.

Para publicar una experiencia real, el comerciante debe aprobar plan, contenido y assets, activar la experiencia, actualizar el kit Shopify y publicar. El flag no sustituye esas decisiones. Rollback: cambiar el flag versionado a `false` y desplegar; también se puede deshabilitar un producto. Un manifest ya publicado requiere retirarlo o republicar con la feature apagada; conservar tablas e historia.
