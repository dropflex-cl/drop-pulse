#!/usr/bin/env bash
# Busca valores de diseño sueltos (hex, rgb()/rgba(), px arbitrarios) en components/ y app/.
# Excepciones documentadas: components/df/offer-preview.tsx y components/store-preview/ (la vista
# previa de la tienda: sus valores salen del CSS del tema, docs/spec-pagina-componentes.md › 5).
# Ignora comentarios, respaldos `var(--x, 0px)`, media queries y el atributo `sizes` de next/image.
set -u
cd "$(dirname "$0")/.."
hits=$(grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|[^a-z-][0-9.]+px' app components --include='*.tsx' --include='*.ts' \
  | grep -v 'components/df/offer-preview.tsx' \
  | grep -v 'components/store-preview/' \
  | grep -vE ':[0-9]+:\s*(//|/?\*|\{/\*)' \
  | grep -vE '(, ?0px\)|"0px"|: "0px")' \
  | grep -vE 'min-width: 1024px|matchMedia|sizes=' \
  | grep -vE '\$\{el\.offsetHeight\}px' \
  | grep -vE '/dev/tokens/page.tsx:.*value: "[0-9]+px"')
if [ -n "$hits" ]; then
  echo "$hits"
  echo "Valores sueltos encontrados" >&2
  exit 1
fi
echo "Sin valores sueltos"
