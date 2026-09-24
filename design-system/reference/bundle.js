/* @ds-bundle: {"format":4,"namespace":"DropFlex","components":[{"name":"Button"},{"name":"IconButton"},{"name":"StatusBadge"},{"name":"StageMeter"},{"name":"ProductRow"},{"name":"AttentionItem"},{"name":"StageList"},{"name":"ReviewCard"},{"name":"ImageTile"},{"name":"SegmentedControl"},{"name":"Field"},{"name":"PriceBreakdown"},{"name":"OfferPreview"},{"name":"Metric"},{"name":"CampaignCard"},{"name":"Navigation"},{"name":"TopBar"},{"name":"Toast"},{"name":"AssistantSheet"},{"name":"OnboardingHeader"},{"name":"ConnectionCard"},{"name":"PermissionList"},{"name":"OptionList"},{"name":"PickRow"},{"name":"GenerationProgress"},{"name":"SetupChecklist"},{"name":"ProductInfoInput"},{"name":"ReferenceImage"},{"name":"ImageUploader"},{"name":"ReviewImporter"},{"name":"ReviewItem"},{"name":"ReviewSummary"},{"name":"Stars"},{"name":"IcpSummary"},{"name":"AngleSuggestion"},{"name":"AngleCard"},{"name":"ScoreBar"},{"name":"RoleChip"},{"name":"AngleDevelopment"},{"name":"StructurePicker"},{"name":"PresetSelect"},{"name":"ConfigSection"},{"name":"CreativeSlot"},{"name":"ChipInput"},{"name":"RuleGroup"},{"name":"RuleRow"},{"name":"CampaignTree"},{"name":"DecisionRow"},{"name":"EmptyState"},{"name":"Notice"},{"name":"PageOutline"},{"name":"CopySummary"},{"name":"CharCount"},{"name":"AiCostChip"},{"name":"AiCostCard"},{"name":"AiRunList"},{"name":"Icon"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var Frag = React.Fragment;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  /* ---------- Icon: trazos de 1.75px, 24×24, currentColor ---------- */
  var P = {
    sparkle: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
    eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
    loader: 'M12 3.5a8.5 8.5 0 1 1-8.5 8.5',
    'check-circle': 'M12 3.25a8.75 8.75 0 1 0 0 17.5 8.75 8.75 0 0 0 0-17.5z M8.25 12.25l2.5 2.5 5-5',
    alert: 'M12 4L2.75 19.5h18.5z M12 10v4 M12 16.75v.5',
    'chevron-right': 'M9.5 5.5L16 12l-6.5 6.5',
    'chevron-left': 'M14.5 5.5L8 12l6.5 6.5',
    plus: 'M12 5v14 M5 12h14',
    inbox: 'M3.5 13.5l2.5-8h12l2.5 8v5h-17z M3.5 13.5h5l1 2.5h5l1-2.5h5',
    box: 'M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z M3.5 7.5L12 12l8.5-4.5 M12 12v9',
    megaphone: 'M4 10v4h3l7 4.5v-13L7 10z M17.5 9.5a3.5 3.5 0 0 1 0 5',
    chat: 'M4 5.5h16v10.5H9.5L5 19.5V16H4z',
    lock: 'M6.5 10.5h11v9.5h-11z M8.75 10.5V8a3.25 3.25 0 0 1 6.5 0v2.5',
    image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 2.5-2.5L20 17.5 M15 8.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z',
    tag: 'M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z M8 7.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
    text: 'M5 6h14 M5 10.5h14 M5 15h9 M5 19.5h6',
    store: 'M4 9.5L5.5 4.5h13L20 9.5 M4 9.5v10h16v-10 M4 9.5c0 1.5 1.2 2.5 2.7 2.5s2.6-1 2.6-2.5c0 1.5 1.2 2.5 2.7 2.5s2.7-1 2.7-2.5c0 1.5 1.1 2.5 2.6 2.5S20 11 20 9.5 M10 19.5v-4.5h4v4.5',
    send: 'M4.5 12L20 4.5 16 20l-4-6.5z M12 13.5l8-9',
    'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
    'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
    pause: 'M8 5.5v13 M16 5.5v13',
    power: 'M12 3.5v8 M7 6.5a7.5 7.5 0 1 0 10 0',
    more: 'M5.5 12h.01 M12 12h.01 M18.5 12h.01',
    undo: 'M9 5.5L4.5 10 9 14.5 M4.5 10H15a4.5 4.5 0 0 1 0 9h-3',
    edit: 'M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5z M13.5 7l3.5 3.5',
    search: 'M10.5 4.25a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5z M15 15l5 5',
    clock: 'M12 3.25a8.75 8.75 0 1 0 0 17.5 8.75 8.75 0 0 0 0-17.5z M12 7.5V12l3 2',
    minus: 'M5 12h14',
    truck: 'M3 6.5h11v10H3z M14 10h4l3 3.5v3h-7 M7 19a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 7 19z M17 19a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
    trend: 'M3.5 16.5l5.5-5.5 4 4 7.5-7.5 M15 7.5h5.5V13',
    grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
    star: 'M12 4l2.4 5 5.3.6-3.9 3.7 1 5.2L12 16l-4.8 2.5 1-5.2-3.9-3.7 5.3-.6z',
    upload: 'M12 15V4.5 M7.5 9L12 4.5 16.5 9 M4.5 15v4.5h15V15',
    link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.1 1.1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.1-1.1',
    shield: 'M12 3.25l7.25 2.75v5.5c0 4.5-3.1 8-7.25 9.25C7.85 19.5 4.75 16 4.75 11.5V6z M8.75 12l2.25 2.25 4.25-4.5',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'
  };
  function Icon(props) {
    var d = P[props.name] || P.more;
    return h('svg', { className: cx('df-ico', props.size === 'sm' && 'df-ico-sm', props.className), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: props.strokeWidth || 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': props.label ? undefined : 'true', role: props.label ? 'img' : undefined, 'aria-label': props.label },
      d.split(' M').map(function (seg, i) { return h('path', { key: i, d: (i ? 'M' : '') + seg }); }));
  }

  /* ---------- Button ---------- */
  function Button(props) {
    var variant = props.variant || 'secondary', size = props.size || 'md';
    var rest = Object.assign({}, props);
    ['variant', 'size', 'icon', 'iconEnd', 'loading', 'block', 'className', 'children', 'kbd'].forEach(function (k) { delete rest[k]; });
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('df-btn', 'df-btn-' + variant, size !== 'md' && 'df-btn-' + size, props.block && 'df-btn-block', props.className),
      disabled: props.disabled || props.loading, 'aria-busy': props.loading ? 'true' : undefined
    }),
      props.loading ? h(Icon, { name: 'loader', className: 'df-spin', size: 'sm' }) : props.icon ? h(Icon, { name: props.icon, size: size === 'sm' ? 'sm' : undefined }) : null,
      props.children,
      props.kbd ? h('span', { className: 'df-kbd', 'aria-hidden': 'true' }, props.kbd) : null,
      props.iconEnd ? h(Icon, { name: props.iconEnd, size: 'sm' }) : null);
  }
  function IconButton(props) {
    return h('button', { type: 'button', className: cx('df-iconbtn', props.variant === 'primary' && 'df-iconbtn-primary', props.className), 'aria-label': props.label, title: props.label, onClick: props.onClick },
      h(Icon, { name: props.icon }), props.badge ? h('span', { className: 'df-sr' }, props.badge) : null);
  }

  /* ---------- StatusBadge: ciclo de vida del contenido ---------- */
  var STATUS = {
    generado:   { label: 'Generado',     icon: 'sparkle',      tone: 'neutral' },
    revision:   { label: 'En revisión',  icon: 'eye',          tone: 'warning' },
    aprobado:   { label: 'Aprobado',     icon: 'check',        tone: 'success' },
    rechazado:  { label: 'Rechazado',    icon: 'x',            tone: 'quiet' },
    publicando: { label: 'Publicándose', icon: 'loader',       tone: 'progress' },
    publicado:  { label: 'Publicado',    icon: 'check-circle', tone: 'success-solid' },
    error:      { label: 'Con error',    icon: 'alert',        tone: 'danger' }
  };
  function StatusBadge(props) {
    var s = STATUS[props.status] || STATUS.generado;
    return h('span', { className: cx('df-status', 'df-status-' + s.tone, props.size === 'sm' && 'df-status-sm'), role: props.status === 'publicando' ? 'status' : undefined },
      h(Icon, { name: s.icon, className: props.status === 'publicando' ? 'df-spin' : undefined, strokeWidth: 2 }), props.label || s.label);
  }

  /* ---------- StageMeter: una rayita por etapa ---------- */
  function StageMeter(props) {
    var st = props.stages || [];
    var done = st.filter(function (s) { return s === 'done'; }).length;
    var req = st.filter(function (s) { return s !== 'optional'; }).length;
    return h('div', { className: 'df-meter', role: 'img', 'aria-label': done + ' de ' + req + ' etapas completas' },
      st.map(function (s, i) { return h('span', { key: i, className: 'is-' + s }); }));
  }

  /* ---------- Imágenes de ejemplo (contenido, no marca) ---------- */
  var PAL = [['#e9e4dc', '#b8a48a', '#6b5a45'], ['#dfe7ea', '#8fa9b3', '#3f5b66'], ['#ece6ef', '#b39cc0', '#5c4868'], ['#e5ebe0', '#9db38a', '#4d6340'], ['#f1e3dc', '#d19b86', '#7a4a3a'], ['#e6e6e6', '#a3a3a3', '#4a4a4a']];
  function productImage(i, shape) {
    var p = PAL[(i || 0) % PAL.length], s = shape == null ? (i || 0) % 4 : shape, body;
    if (s === 0) body = '<rect x="36" y="22" width="28" height="10" rx="3" fill="' + p[2] + '"/><rect x="30" y="30" width="40" height="52" rx="10" fill="' + p[1] + '"/><rect x="36" y="46" width="28" height="16" rx="3" fill="' + p[0] + '"/>';
    else if (s === 1) body = '<rect x="22" y="30" width="56" height="44" rx="6" fill="' + p[1] + '"/><path d="M22 42h56" stroke="' + p[2] + '" stroke-width="3"/><rect x="44" y="30" width="12" height="44" fill="' + p[2] + '" opacity=".5"/>';
    else if (s === 2) body = '<circle cx="50" cy="52" r="24" fill="' + p[1] + '"/><circle cx="50" cy="52" r="10" fill="' + p[0] + '"/><rect x="47" y="22" width="6" height="10" rx="2" fill="' + p[2] + '"/>';
    else body = '<path d="M30 78c0-22 8-40 20-50 12 10 20 28 20 50z" fill="' + p[1] + '"/><path d="M50 28v50" stroke="' + p[2] + '" stroke-width="3"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="' + p[0] + '"/><ellipse cx="50" cy="84" rx="26" ry="4" fill="' + p[2] + '" opacity=".18"/>' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- ProductRow ---------- */
  function ProductRow(props) {
    var tone = props.tone || 'muted';
    var whyIcon = { warning: 'clock', danger: 'alert', success: 'check-circle', primary: 'chevron-right', muted: 'minus' }[tone];
    return h('button', { type: 'button', className: 'df-prow', onClick: props.onClick },
      h('img', { className: 'df-thumb', src: props.image || productImage(props.imageIndex || 0), alt: '' }),
      h('span', { className: 'df-prow-body' },
        h('span', { className: 'df-prow-name' }, props.name),
        props.stages ? h(StageMeter, { stages: props.stages }) : null,
        props.reason ? h('span', { className: cx('df-prow-why', 't-' + tone) }, h(Icon, { name: whyIcon, size: 'sm', strokeWidth: 2 }), h('span', null, props.reason)) : null),
      h('span', { className: 'df-prow-end' }, props.end || h(Icon, { name: 'chevron-right', size: 'sm' })));
  }

  /* ---------- AttentionItem: una decisión pendiente en Hoy ---------- */
  var KIND = { review: 'sparkle', error: 'alert', ads: 'megaphone', 'ads-up': 'trend', stuck: 'clock' };
  function AttentionItem(props) {
    var k = props.kind || 'review';
    return h('div', { className: 'df-att' },
      h('span', { className: 'df-att-ico k-' + k }, h(Icon, { name: KIND[k] })),
      h('div', null,
        h('div', { className: 'df-att-title' }, props.title),
        props.product ? h('div', { className: 'df-att-meta' }, props.product) : null,
        props.detail ? h('div', { className: 'df-att-detail' }, props.detail) : null,
        props.actions ? h('div', { className: 'df-att-actions' }, props.actions) : null));
  }

  /* ---------- StageList: la ruta de un producto ---------- */
  var STAGE_ICON = { done: 'check', review: 'eye', error: 'alert', locked: 'lock' };
  function StageList(props) {
    return h('ol', { className: 'df-stages', 'aria-label': props.label || 'Etapas del producto' },
      (props.stages || []).map(function (s, i) {
        var locked = s.state === 'locked';
        return h('li', { key: i },
          h('button', { type: 'button', className: cx('df-stage', 's-' + s.state, s.optional && s.state === 'available' && 's-optional'), 'aria-disabled': locked ? 'true' : undefined, 'aria-current': s.state === 'current' ? 'step' : undefined },
            h('span', { className: 'df-stage-dot' }, STAGE_ICON[s.state] ? h(Icon, { name: STAGE_ICON[s.state], strokeWidth: 2.25 }) : String(i + 1)),
            h('span', null,
              h('span', { className: 'df-stage-title' }, s.title, s.optional ? h('span', { className: 'df-stage-opt' }, 'Opcional') : null),
              s.desc ? h('span', { className: 'df-stage-desc', style: { display: 'block' } }, s.desc) : null),
            h('span', { className: 'df-stage-end' }, s.end || (locked ? null : h(Icon, { name: 'chevron-right', size: 'sm' })))));
      }));
  }

  /* ---------- ReviewCard: original vs. propuesta ---------- */
  function CharCount(props) {
    var n = props.count || 0, over = props.limit && n > props.limit;
    return h('span', { className: cx('df-cc', over && 'is-over'), 'aria-live': props.live ? 'polite' : undefined },
      over ? h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }) : null,
      n.toLocaleString('es-CL') + (props.limit ? ' / ' + props.limit : '') + ' ' + (props.unit || 'caracteres'));
  }
  function ReviewCard(props) {
    var state = props.state || 'pending';
    var editing = state === 'editing';
    var roleMap = { primary: 'principal', secondary: 'secundario' };
    var body = props.faq
      ? h('div', { className: 'df-prop-faq' }, h('b', null, props.faq.q), h('span', null, props.faq.a))
      : h('div', { className: 'df-prop-text' }, props.proposal);
    return h('section', { className: cx('df-review', 'st-' + state), 'aria-label': 'Revisar ' + props.field },
      h('div', { className: 'df-review-head' },
        h('span', { className: 'df-review-field' }, props.section ? h('span', { className: 'df-review-sec' }, props.section + ' · ') : null, props.field, props.required ? h('span', { className: 'df-req' }, 'Obligatorio') : null),
        props.total ? h('span', { className: 'df-review-count' }, props.index + ' de ' + props.total) : null),
      props.original != null ? h('div', { className: 'df-orig' },
        h('div', { className: 'df-orig-label' }, props.originalLabel || 'Original'),
        h('div', { className: 'df-orig-text' }, props.original)) : null,
      h('div', { className: 'df-prop' },
        h('div', { className: 'df-prop-label' }, h(Icon, { name: 'sparkle', size: 'sm' }), editing ? 'Tu versión' : 'Propuesta',
          props.angle && roleMap[props.angle] ? h(RoleChip, { role: roleMap[props.angle], short: true }) : null,
          state === 'accepted' ? h('span', { style: { marginLeft: 'auto' } }, h(StatusBadge, { status: 'aprobado', size: 'sm', label: props.edited ? 'Tu versión' : undefined })) : null,
          state === 'discarded' ? h('span', { style: { marginLeft: 'auto' } }, h(StatusBadge, { status: 'rechazado', size: 'sm', label: 'Descartada' })) : null),
        editing ? h('textarea', { defaultValue: props.proposalText || '', 'aria-label': 'Editar propuesta', rows: props.rows }) : body,
        props.limit ? h('div', { className: 'df-prop-foot' }, h(CharCount, { count: props.count, limit: props.limit, unit: props.unit, live: editing })) : null),
      props.missing ? h('div', { className: 'df-review-miss' }, h(Icon, { name: 'clock', size: 'sm', strokeWidth: 2 }), h('span', null, props.missing)) : null,
      props.note && !editing ? h('p', { className: 'df-review-note' }, h(Icon, { name: 'sparkle', size: 'sm' }), props.note) : null,
      props.discardHint && !editing && state === 'pending' ? h('p', { className: 'df-review-dh' }, 'Si descartas: ', props.discardHint) : null,
      props.hideActions ? null : editing
        ? h('div', { className: 'df-review-actions', style: { gridTemplateColumns: '1fr 1.4fr' } },
            h(Button, { variant: 'ghost' }, 'Cancelar'),
            h(Button, { variant: 'primary', icon: 'check', disabled: props.limit && props.count > props.limit }, 'Guardar y aceptar'))
        : h('div', { className: 'df-review-actions' },
            h(Button, { variant: 'secondary', icon: 'x', kbd: props.keys ? 'D' : null }, 'Descartar'),
            h(Button, { variant: 'secondary', icon: 'edit', kbd: props.keys ? 'E' : null }, 'Editar'),
            h(Button, { variant: 'primary', icon: 'check', kbd: props.keys ? 'A' : null }, 'Aceptar')));
  }

  /* ---------- ImageTile ---------- */
  function ImageTile(props) {
    var st = props.state || 'idle';
    if (st === 'generating') return h('div', { className: 'df-tile is-generating', role: 'status' }, h('span', { className: 'df-tile-center' }, h(Icon, { name: 'sparkle' }), 'Generando'));
    if (st === 'error') return h('button', { type: 'button', className: 'df-tile is-error' }, h('span', { className: 'df-tile-center' }, h(Icon, { name: 'alert' }), 'Reintentar'));
    var sel = st === 'selected';
    return h('button', { type: 'button', className: cx('df-tile', sel && 'is-selected', st === 'discarded' && 'is-discarded'), 'aria-pressed': sel ? 'true' : 'false', 'aria-label': (props.alt || 'Imagen') + (sel ? ', posición ' + props.order : st === 'discarded' ? ', descartada' : ', sin elegir') },
      h('img', { src: props.src || productImage(props.imageIndex || 0, props.shape), alt: '' }),
      sel ? h('span', { className: 'df-tile-order' }, props.order) : st === 'discarded' ? null : h('span', { className: 'df-tile-check' }),
      sel && props.order === 1 ? h('span', { className: 'df-tile-cover' }, 'Portada') : null,
      st === 'discarded' ? h('span', { className: 'df-tile-tag' }, h(Icon, { name: 'undo', size: 'sm' }), 'Recuperar') : null);
  }

  /* ---------- SegmentedControl ---------- */
  function SegmentedControl(props) {
    return h('div', { className: cx('df-seg', props.block && 'df-seg-block'), role: 'group', 'aria-label': props.label },
      (props.options || []).map(function (o) {
        var v = typeof o === 'string' ? o : o.value;
        return h('button', { key: v, type: 'button', 'aria-pressed': props.value === v ? 'true' : 'false', onClick: props.onChange ? function () { props.onChange(v); } : undefined },
          o.label || v, o.count != null ? h('span', { className: 'df-seg-count' }, o.count) : null);
      }));
  }

  /* ---------- Field ---------- */
  function Field(props) {
    var id = props.id || ('f-' + String(props.label).replace(/\W+/g, '-').toLowerCase());
    return h('div', { className: cx('df-field', props.error && 'is-error', props.disabled && 'is-disabled', props.ai && 'is-ai') },
      h('label', { className: 'df-field-label', htmlFor: id }, props.label),
      h('div', { className: 'df-field-box' },
        props.prefix ? h('span', { className: 'df-field-affix' }, props.prefix) : null,
        h('input', { id: id, defaultValue: props.value, inputMode: props.inputMode || (props.prefix === '$' ? 'numeric' : undefined), disabled: props.disabled, 'aria-invalid': props.error ? 'true' : undefined }),
        props.suffix ? h('span', { className: 'df-field-affix' }, props.suffix) : null),
      (props.error || props.hint) ? h('span', { className: 'df-field-hint' }, props.ai && !props.error ? h(Icon, { name: 'sparkle', size: 'sm' }) : null, props.error || props.hint) : null);
  }

  /* ---------- PriceBreakdown ---------- */
  function money(n) { var neg = n < 0; n = Math.round(Math.abs(n)); return (neg ? '−$' : '$') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function PriceBreakdown(props) {
    var price = props.price, parts = props.parts || [];
    var cost = parts.reduce(function (a, p) { return a + p.value; }, 0);
    var profit = price - cost;
    var colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)'];
    var segs = parts.map(function (p, i) { return { label: p.label, value: p.value, color: p.color || colors[i % colors.length] }; });
    if (profit > 0) segs.push({ label: 'Tu ganancia', value: profit, color: 'var(--chart-4)', strong: true });
    var total = Math.max(price, cost);
    return h('div', { className: 'df-col', style: { padding: 0, gap: 'var(--space-4)' } },
      h('div', { className: 'df-profit' },
        h('div', null,
          h('div', { className: 'df-metric-l' }, 'Ganas por cada venta entregada'),
          h('div', { className: cx('df-profit-v', profit >= 0 ? 'is-pos' : 'is-neg') }, money(profit))),
        h('div', { style: { textAlign: 'right' } },
          h('div', { className: 'df-metric-l' }, 'Margen'),
          h('div', { className: 'df-metric-v' }, Math.round(profit / price * 100) + '%'))),
      h('div', { className: 'df-bar', role: 'img', 'aria-label': 'De ' + money(price) + ': ' + segs.map(function (s) { return s.label + ' ' + money(s.value); }).join(', ') },
        segs.map(function (s, i) { return h('span', { key: i, style: { flex: s.value / total, background: s.color } }); })),
      h('ul', { className: 'df-legend' },
        segs.map(function (s, i) {
          return h('li', { key: i },
            h('span', { className: 'df-legend-sw', style: { background: s.color } }),
            h('span', { style: s.strong ? { fontWeight: 600 } : null }, s.label),
            h('span', { className: 'df-legend-v', style: s.strong ? { color: 'var(--success)' } : null }, money(s.value)),
            h('span', { className: 'df-legend-p' }, Math.round(s.value / price * 100) + '%'));
        })),
      props.note ? h('div', { className: 'df-field-hint' }, props.note) : null);
  }

  /* ---------- OfferPreview: cómo lo ve el comprador ---------- */
  function OfferPreview(props) {
    var off = props.compareAt ? Math.round((1 - props.price / props.compareAt) * 100) : 0;
    return h('div', null,
      h('div', { className: 'df-offer-frame' }, h('span', null, 'Vista del comprador'), h('span', null, props.store || 'tutienda.cl')),
      h('div', { className: 'df-offer' },
        h('img', { className: 'df-offer-img', src: props.image || productImage(props.imageIndex || 0), alt: '' }),
        h('div', { className: 'df-offer-body' },
          h('div', { className: 'df-offer-title' }, props.title),
          h('div', { className: 'df-offer-price' },
            h('span', { className: 'df-offer-now' }, money(props.price)),
            props.compareAt ? h('span', { className: 'df-offer-was' }, money(props.compareAt)) : null,
            off > 0 ? h('span', { className: 'df-offer-off' }, '−' + off + '%') : null),
          h('div', { className: 'df-offer-cod' }, h(Icon, { name: 'truck', size: 'sm' }), 'Paga al recibir · Envío gratis'),
          h('div', { className: 'df-offer-cta' }, props.cta || 'Pedir ahora, pagar al recibir'))));
  }

  /* ---------- Metric ---------- */
  function Metric(props) {
    var t = props.trend;
    return h('div', { className: 'df-metric' },
      h('span', { className: 'df-metric-l' }, props.label),
      h('span', { className: 'df-metric-v' }, props.value),
      props.target ? h('span', { className: cx('df-metric-t', t && 't-' + t) },
        t === 'good' ? h(Icon, { name: 'check', size: 'sm', strokeWidth: 2.25 }) : t === 'bad' ? h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }) : t === 'warn' ? h(Icon, { name: 'clock', size: 'sm', strokeWidth: 2 }) : null,
        props.target) : null);
  }

  /* ---------- CampaignCard + veredicto ---------- */
  var VERDICT = {
    subir:       { k: 'Sube el presupuesto', icon: 'arrow-up', cta: 'Subir a ' },
    seguir:      { k: 'Déjala seguir',        icon: 'check' },
    vigilar:     { k: 'Vigílala',             icon: 'eye' },
    apagar:      { k: 'Apágala',              icon: 'power', cta: 'Apagar campaña' },
    aprendiendo: { k: 'Aún aprendiendo',      icon: 'clock' }
  };
  function Verdict(props) {
    var v = VERDICT[props.verdict] || VERDICT.seguir;
    return h('div', { className: 'df-verdict v-' + props.verdict, role: 'note' },
      h('span', { className: 'df-verdict-ico' }, h(Icon, { name: v.icon, strokeWidth: 2.25 })),
      h('div', null, h('div', { className: 'df-verdict-k' }, props.title || v.k), h('div', { className: 'df-verdict-r' }, props.reason)));
  }
  function CampaignCard(props) {
    var v = props.verdict || 'seguir';
    var actions = props.actions;
    if (actions === undefined) {
      if (v === 'subir') actions = [h(Button, { key: 'a', variant: 'secondary' }, 'Ver detalle'), h(Button, { key: 'b', variant: 'primary', icon: 'arrow-up' }, 'Subir a ' + (props.nextBudget || '$15.000'))];
      else if (v === 'apagar') actions = [h(Button, { key: 'a', variant: 'secondary' }, 'Mantener'), h(Button, { key: 'b', variant: 'destructive', icon: 'power' }, 'Apagar')];
      else actions = null;
    }
    return h('article', { className: 'df-card df-camp' },
      h('div', { className: 'df-camp-head' },
        h('img', { className: 'df-thumb', style: { width: 40, height: 40 }, src: productImage(props.imageIndex || 0), alt: '' }),
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'df-camp-name' }, props.name),
          h('div', { className: 'df-camp-sub' }, h('span', { className: cx('df-live', props.paused && 'off') }), props.paused ? 'Pausada' : 'Activa', ' · ', props.meta || 'Meta Ads · 3 días')),
        h(IconButton, { icon: 'more', label: 'Más opciones' })),
      h(Verdict, { verdict: v, reason: props.reason, title: props.verdictTitle }),
      props.metrics ? h('div', { className: 'df-metrics' }, props.metrics.map(function (m, i) { return h(Metric, Object.assign({ key: i }, m)); })) : null,
      actions ? h('div', { className: 'df-camp-actions' }, actions) : null);
  }

  /* ---------- Navigation: barra inferior (móvil) o riel (escritorio) ---------- */
  var NAV = [
    { id: 'hoy', label: 'Hoy', icon: 'inbox' },
    { id: 'productos', label: 'Productos', icon: 'box' },
    { id: 'campanas', label: 'Campañas', icon: 'megaphone' }
  ];
  function Navigation(props) {
    var rail = props.variant === 'rail';
    var items = (props.items || NAV).map(function (it) {
      return h('a', { key: it.id, href: '#' + it.id, className: 'df-tab', 'aria-current': props.active === it.id ? 'page' : undefined },
        h('span', { className: 'df-tab-pill' }, h(Icon, { name: it.icon }), !rail && props.badges && props.badges[it.id] ? h('span', { className: 'df-tab-badge' }, props.badges[it.id]) : null),
        h('span', null, it.label),
        rail && props.badges && props.badges[it.id] ? h('span', { className: 'df-tab-badge' }, props.badges[it.id]) : null);
    });
    if (!rail) return h('nav', { className: 'df-tabbar', 'aria-label': 'Principal' }, items);
    return h('nav', { className: 'df-rail', 'aria-label': 'Principal' },
      h('div', { className: 'df-rail-brand' }, h('span', { className: 'df-rail-mark', 'aria-hidden': 'true' }, 'D'), 'DropFlex'),
      items,
      h('div', { className: 'df-rail-sep' }),
      h('a', { href: '#ajustes', className: 'df-tab' }, h('span', { className: 'df-tab-pill' }, h(Icon, { name: 'settings' })), h('span', null, 'Ajustes')));
  }

  /* ---------- TopBar ---------- */
  function TopBar(props) {
    return h('header', { className: cx('df-topbar', props.large && 'is-large') },
      props.back ? h(IconButton, { icon: 'chevron-left', label: props.back }) : null,
      h('div', { className: cx('df-topbar-title', !props.back && 'no-back') },
        h('div', { className: 'df-topbar-t' }, props.title),
        props.subtitle ? h('div', { className: 'df-topbar-s' }, props.subtitle) : null),
      props.actions);
  }

  /* ---------- Toast ---------- */
  function Toast(props) {
    return h('div', { className: 'df-toast', role: 'status' }, h('span', null, props.message), props.action ? h('button', { type: 'button' }, props.action) : null);
  }

  /* ---------- AssistantSheet ---------- */
  function AssistantSheet(props) {
    var panel = props.variant === 'panel';
    return h('aside', { className: cx('df-sheet', panel && 'is-panel'), 'aria-label': 'Asistente', style: props.style },
      panel ? null : h('div', { className: 'df-sheet-grab', 'aria-hidden': 'true' }),
      h('div', { className: 'df-sheet-head' },
        h(Icon, { name: 'sparkle' }), h('strong', null, 'Asistente'),
        h(IconButton, { icon: 'x', label: 'Cerrar asistente' })),
      props.context ? h('span', { className: 'df-ctx' }, h('img', { src: productImage(props.contextImage || 0), alt: '' }), 'Sobre ', h('b', null, props.context)) : null,
      h('div', { className: 'df-msgs' },
        (props.messages || []).map(function (m, i) {
          return h('div', { key: i, className: 'df-msg from-' + m.from },
            m.from === 'ai' ? (Array.isArray(m.text) ? m.text.map(function (t, j) { return h('p', { key: j }, t); }) : h('p', null, m.text)) : m.text,
            m.apply ? h('div', { className: 'df-msg-apply' }, h(Button, { size: 'sm', variant: 'secondary', icon: 'check' }, m.apply)) : null);
        })),
      props.suggestions ? h('div', { className: 'df-sugs' }, props.suggestions.map(function (s, i) { return h('button', { key: i, type: 'button', className: 'df-chipbtn' }, s); })) : null,
      h('div', { className: 'df-compose' },
        h('input', { placeholder: props.placeholder || 'Pregunta sobre este producto', 'aria-label': 'Mensaje para el asistente' }),
        h(IconButton, { icon: 'send', label: 'Enviar', variant: 'primary' })));
  }

  /* =========================================================
     Onboarding: conexión con Shopify y Meta Ads
     ========================================================= */

  /* OnboardingHeader: paso, avance, volver y título */
  function OnboardingHeader(props) {
    var total = props.total || 4, step = props.step || 1;
    var stages = [];
    for (var i = 1; i <= total; i++) stages.push(i < step ? 'done' : i === step ? 'current' : (props.optionalSteps && props.optionalSteps.indexOf(i) >= 0 ? 'optional' : 'locked'));
    return h('header', { className: 'df-ob-head' },
      h('div', { className: 'df-ob-bar' },
        props.back ? h(IconButton, { icon: 'chevron-left', label: props.back }) : h('span', { style: { width: 44 } }),
        h('div', { className: 'df-ob-step' }, props.stepLabel || ('Paso ' + step + ' de ' + total)),
        props.skip ? h(Button, { variant: 'ghost', size: 'sm' }, props.skip) : h('span', { style: { width: 44 } })),
      h('div', { className: 'df-ob-meter' }, h(StageMeter, { stages: stages })),
      props.title ? h('h1', { className: 'df-ob-title' }, props.title) : null,
      props.desc ? h('p', { className: 'df-ob-desc' }, props.desc) : null);
  }

  /* ProviderMark: marca genérica del proveedor. Reemplazar por el logo oficial según sus guías de marca. */
  var PROVIDERS = {
    shopify: { name: 'Shopify', icon: 'store', what: 'Tu tienda' },
    meta: { name: 'Meta Ads', icon: 'megaphone', what: 'Tus anuncios' }
  };
  function ProviderMark(props) {
    var p = PROVIDERS[props.provider] || PROVIDERS.shopify;
    return h('span', { className: cx('df-pmark', props.size === 'lg' && 'is-lg'), 'aria-hidden': 'true', 'data-provider': props.provider }, h(Icon, { name: p.icon }));
  }

  /* ConnectionCard: estado de una integración */
  var CONN = {
    idle:       { badge: null },
    connecting: { badge: { t: 'Conectando', i: 'loader', c: 'df-status-progress', spin: true } },
    importing:  { badge: { t: 'Importando', i: 'loader', c: 'df-status-progress', spin: true } },
    connected:  { badge: { t: 'Conectada', i: 'check-circle', c: 'df-status-success' } },
    action:     { badge: { t: 'Falta un paso', i: 'clock', c: 'df-status-warning' } },
    error:      { badge: { t: 'Sin conexión', i: 'alert', c: 'df-status-danger' } },
    later:      { badge: { t: 'Pendiente', i: 'minus', c: 'df-status-quiet' } }
  };
  function ConnectionCard(props) {
    var p = PROVIDERS[props.provider] || PROVIDERS.shopify, st = props.state || 'idle', c = CONN[st];
    return h('section', { className: cx('df-card df-conn', 'is-' + st), 'aria-label': p.name },
      h('div', { className: 'df-conn-head' },
        h(ProviderMark, { provider: props.provider }),
        h('div', { style: { minWidth: 0, flex: 1 } },
          h('div', { className: 'df-conn-name' }, p.name),
          h('div', { className: 'df-conn-acc' }, props.account || p.what)),
        c.badge ? h('span', { className: 'df-status ' + c.badge.c, role: c.badge.spin ? 'status' : undefined }, h(Icon, { name: c.badge.i, className: c.badge.spin ? 'df-spin' : undefined, strokeWidth: 2 }), c.badge.t) : null),
      props.progress != null ? h('div', { className: 'df-conn-prog' },
        h('div', { className: 'df-conn-track' }, h('span', { style: { width: Math.round(props.progress * 100) + '%' } })),
        h('div', { className: 'df-conn-detail' }, props.detail)) : props.detail ? h('div', { className: cx('df-conn-detail', st === 'error' && 't-danger', st === 'action' && 't-warning') }, props.detail) : null,
      props.facts ? h('dl', { className: 'df-conn-facts' }, props.facts.map(function (f, i) { return h('div', { key: i }, h('dt', null, f[0]), h('dd', null, f[1])); })) : null,
      props.actions ? h('div', { className: 'df-conn-actions' }, props.actions) : null);
  }

  /* PermissionList: qué lee y qué escribe DropFlex */
  function PermissionList(props) {
    return h('div', { className: 'df-perms' },
      props.title ? h('div', { className: 'df-perms-t' }, h(Icon, { name: 'shield', size: 'sm' }), props.title) : null,
      h('ul', null, (props.items || []).map(function (it, i) {
        return h('li', { key: i },
          h('span', { className: cx('df-perm-k', it.kind === 'write' && 'is-write') }, it.kind === 'write' ? 'Escribe' : it.kind === 'never' ? 'Nunca' : 'Lee'),
          h('span', null, it.text));
      })),
      props.note ? h('p', { className: 'df-perms-n' }, props.note) : null);
  }

  /* OptionList: elegir una cuenta, página o píxel */
  function OptionList(props) {
    var name = props.name || 'opt';
    return h('fieldset', { className: 'df-opts' },
      h('legend', { className: 'df-opts-l' }, props.label, props.hint ? h('span', null, props.hint) : null),
      h('div', { className: 'df-opts-box' }, (props.options || []).map(function (o, i) {
        var sel = props.value === o.value;
        return h('label', { key: i, className: cx('df-opt', sel && 'is-sel', o.disabled && 'is-dis') },
          h('input', { type: 'radio', name: name, defaultChecked: sel, disabled: o.disabled }),
          h('span', { className: 'df-radio', 'aria-hidden': 'true' }),
          h('span', { className: 'df-opt-body' },
            h('span', { className: 'df-opt-t' }, o.title),
            o.meta ? h('span', { className: cx('df-opt-m', o.tone && 't-' + o.tone) }, o.tone === 'warning' ? h(Icon, { name: 'clock', size: 'sm', strokeWidth: 2 }) : o.tone === 'danger' ? h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }) : null, o.meta) : null),
          o.tag ? h('span', { className: 'df-opt-tag' }, o.tag) : null);
      })));
  }

  /* PickRow: elegir productos importados, con diagnóstico */
  function PickRow(props) {
    return h('label', { className: cx('df-pick', props.checked && 'is-sel') },
      h('input', { type: 'checkbox', defaultChecked: props.checked }),
      h('span', { className: 'df-check', 'aria-hidden': 'true' }, h(Icon, { name: 'check', size: 'sm', strokeWidth: 2.5 })),
      h('img', { className: 'df-thumb', src: productImage(props.imageIndex || 0), alt: '' }),
      h('span', { className: 'df-pick-body' },
        h('span', { className: 'df-prow-name' }, props.name),
        h('span', { className: 'df-pick-meta' }, props.meta),
        props.issues && props.issues.length ? h('span', { className: 'df-pick-issues' }, props.issues.map(function (t, i) { return h('span', { key: i, className: 'df-issue' }, t); })) : null),
      props.score != null ? h('span', { className: 'df-pick-score', title: 'Potencial de mejora' }, h('b', null, props.score), h('small', null, 'mejora')) : null);
  }

  /* GenerationProgress: la IA trabajando sobre los productos elegidos */
  function GenerationProgress(props) {
    var items = props.items || [];
    var done = items.filter(function (i) { return i.status === 'generado' || i.status === 'aprobado'; }).length;
    return h('div', { className: cx('df-gen', props.compact && 'is-compact') },
      h('div', { className: 'df-gen-head' },
        h(Icon, { name: 'sparkle', className: done < items.length ? 'df-pulse' : undefined }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { className: 'df-gen-t' }, props.title || (done < items.length ? 'Generando contenido' : 'Todo listo para revisar')),
          h('div', { className: 'df-gen-s' }, done + ' de ' + items.length + ' productos listos' + (props.eta ? ' · ' + props.eta : ''))),
        props.action || null),
      h('div', { className: 'df-conn-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': items.length, 'aria-valuenow': done }, h('span', { style: { width: (items.length ? done / items.length * 100 : 0) + '%' } })),
      props.compact ? null : h('ul', { className: 'df-gen-list' }, items.map(function (it, i) {
        return h('li', { key: i },
          h('img', { className: 'df-thumb', src: productImage(it.imageIndex || 0), alt: '', style: { width: 36, height: 36 } }),
          h('span', { className: 'df-gen-body' }, h('span', { className: 'df-prow-name', style: { fontSize: 14 } }, it.name), h('span', { className: 'df-pick-meta' }, it.detail)),
          it.status === 'cola' ? h('span', { className: 'df-status df-status-quiet df-status-sm' }, h(Icon, { name: 'clock', strokeWidth: 2 }), 'En cola') : h(StatusBadge, { status: it.status, size: 'sm', label: it.status === 'publicando' ? 'Generando' : undefined }));
      })));
  }

  /* SetupChecklist: lo que falta configurar, en Hoy */
  function SetupChecklist(props) {
    var items = props.items || [];
    var done = items.filter(function (i) { return i.done; }).length;
    return h('section', { className: 'df-card df-setup', 'aria-label': 'Configuración' },
      h('div', { className: 'df-setup-head' },
        h('div', { style: { flex: 1 } }, h('div', { className: 'df-conn-name' }, props.title || 'Termina de configurar'), h('div', { className: 'df-conn-acc' }, done + ' de ' + items.length + ' listos')),
        h(IconButton, { icon: 'x', label: 'Ocultar' })),
      h(StageMeter, { stages: items.map(function (i) { return i.done ? 'done' : 'locked'; }) }),
      h('ul', { className: 'df-setup-list' }, items.map(function (it, i) {
        return h('li', { key: i, className: it.done ? 'is-done' : '' },
          h('span', { className: 'df-setup-dot' }, it.done ? h(Icon, { name: 'check', size: 'sm', strokeWidth: 2.5 }) : null),
          h('span', { className: 'df-setup-t' }, it.title, it.desc ? h('small', null, it.desc) : null),
          !it.done && it.action ? h(Button, { size: 'sm', variant: 'secondary' }, it.action) : null);
      })));
  }

  /* =========================================================
     Producto sin optimizar: materia prima para la IA
     ========================================================= */

  /* ReferenceImage: imagen de origen (Shopify o subida) usada como referencia */
  var REF_SRC = { shopify: 'Shopify', upload: 'Subida', url: 'Enlace' };
  function ReferenceImage(props) {
    var st = props.state || 'ready';
    if (st === 'uploading') return h('div', { className: 'df-ref is-uploading', role: 'status', 'aria-label': 'Subiendo ' + (props.name || 'imagen') },
      h('span', { className: 'df-tile-center' }, h('span', { className: 'df-ref-pct' }, Math.round((props.progress || 0) * 100) + '%'), 'Subiendo'),
      h('span', { className: 'df-ref-bar' }, h('span', { style: { width: Math.round((props.progress || 0) * 100) + '%' } })));
    if (st === 'error') return h('div', { className: 'df-ref is-error', role: 'alert' },
      h('span', { className: 'df-tile-center' }, h(Icon, { name: 'alert' }), props.error || 'No se pudo subir'),
      h('button', { type: 'button', className: 'df-ref-retry' }, 'Reintentar'));
    var off = st === 'excluded';
    return h('figure', { className: cx('df-ref', off && 'is-off') },
      h('img', { src: props.src || productImage(props.imageIndex || 0, props.shape), alt: props.alt || '' }),
      h('span', { className: cx('df-ref-src', 'src-' + (props.source || 'shopify')) }, REF_SRC[props.source || 'shopify']),
      props.cover && !off ? h('span', { className: 'df-tile-cover' }, 'Portada') : null,
      h('button', { type: 'button', className: 'df-ref-toggle', 'aria-pressed': off ? 'false' : 'true', 'aria-label': off ? 'Usar como referencia' : 'No usar como referencia' },
        h(Icon, { name: off ? 'plus' : 'x', size: 'sm', strokeWidth: 2.25 })),
      off ? h('figcaption', { className: 'df-tile-tag' }, 'No se usa') : null);
  }

  /* ImageUploader: desde el equipo o desde un enlace */
  function ImageUploader(props) {
    var mode = props.mode || 'file', st = props.state || 'idle';
    var modeCtl = h(SegmentedControl, { block: true, value: mode, label: 'Cómo agregar imágenes', options: [{ value: 'file', label: 'Desde tu equipo' }, { value: 'url', label: 'Desde un enlace' }] });
    var body;
    if (mode === 'file') {
      body = h('label', { className: cx('df-drop', st === 'dragover' && 'is-over', st === 'error' && 'is-error') },
        h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, className: 'df-sr' }),
        h('span', { className: 'df-drop-ico' }, h(Icon, { name: st === 'dragover' ? 'arrow-down' : 'upload' })),
        h('span', { className: 'df-drop-t' }, st === 'dragover' ? 'Suelta para subir' : props.compact ? (props.pickLabel || 'Elige imágenes') : h(Frag, null, h('span', { className: 'df-drop-desk' }, (props.dragLabel || 'Arrastra imágenes aquí') + ' o '), h('u', null, 'elige desde tu equipo'))),
        h('span', { className: 'df-drop-s' }, props.formats || 'JPG, PNG o WEBP · hasta 10 MB cada una · máximo 10'));
    } else {
      body = h('div', { className: 'df-urlin' },
        h('div', { className: cx('df-field', props.urlError && 'is-error') },
          h('label', { className: 'df-field-label', htmlFor: 'df-url' }, 'Enlace de la imagen'),
          h('div', { className: 'df-urlrow' },
            h('div', { className: 'df-field-box', style: { flex: 1 } }, h(Icon, { name: 'link', size: 'sm', className: 'df-muted' }), h('input', { id: 'df-url', type: 'url', inputMode: 'url', defaultValue: props.url || '', placeholder: 'https://', 'aria-invalid': props.urlError ? 'true' : undefined })),
            h(Button, { variant: 'secondary', loading: st === 'fetching' }, st === 'fetching' ? 'Trayendo' : 'Traer')),
          h('span', { className: 'df-field-hint' }, props.urlError || 'Pega el enlace directo a la imagen (por ejemplo, desde la página del proveedor).')));
    }
    return h('section', { className: 'df-uploader', 'aria-label': 'Agregar imágenes' },
      props.hideModes ? null : modeCtl,
      body,
      props.items && props.items.length ? h('ul', { className: 'df-uplist' }, props.items.map(function (it, i) {
        return h('li', { key: i, className: 'is-' + it.state },
          h('span', { className: 'df-uplist-ico' }, h(Icon, { name: it.state === 'error' ? 'alert' : it.state === 'done' ? 'check' : 'image', size: 'sm', strokeWidth: 2 })),
          h('span', { className: 'df-uplist-b' },
            h('span', { className: 'df-uplist-n' }, it.name),
            it.state === 'uploading' ? h('span', { className: 'df-conn-track' }, h('span', { style: { width: Math.round(it.progress * 100) + '%' } })) : h('span', { className: 'df-uplist-m' }, it.detail)),
          it.state === 'error' ? h(Button, { size: 'sm', variant: 'ghost' }, 'Reintentar') : it.state === 'uploading' ? h(IconButton, { icon: 'x', label: 'Cancelar subida' }) : null);
      })) : null);
  }

  /* ProductInfoInput: todo lo que el comerciante sabe del producto, en un solo campo */
  var TOPICS = ['Beneficios', 'Medidas', 'Materiales', 'Qué incluye', 'Modo de uso', 'Garantía', 'Para quién es'];
  function ProductInfoInput(props) {
    var found = props.found || [];
    var len = (props.value || '').length;
    return h('section', { className: 'df-info', 'aria-label': 'Información del producto' },
      h('div', { className: 'df-info-head' },
        h('label', { className: 'df-info-l', htmlFor: 'df-info' }, props.label || 'Todo lo que sabes del producto'),
        h('span', { className: 'df-info-save', role: 'status' }, props.saving ? h(Frag, null, h(Icon, { name: 'loader', size: 'sm', className: 'df-spin' }), 'Guardando') : h(Frag, null, h(Icon, { name: 'check', size: 'sm' }), props.saved || 'Guardado'))),
      h('p', { className: 'df-info-hint', id: 'df-info-h' }, props.hint || 'Pega la descripción del proveedor, medidas, materiales, reseñas o lo que te hayan preguntado tus clientes. Sin orden: la IA lo organiza.'),
      h('div', { className: cx('df-info-box', props.focused && 'is-focus') },
        props.fromShopify ? h('span', { className: 'df-info-src' }, h(Icon, { name: 'store', size: 'sm' }), 'Incluye la descripción de Shopify') : null,
        h('textarea', { id: 'df-info', 'aria-describedby': 'df-info-h df-info-cov', defaultValue: props.value || '', placeholder: props.placeholder || 'Ej.: Corrector de postura de neopreno, talla única ajustable hasta 110 cm de pecho…', rows: props.rows || 8 }),
        h('div', { className: 'df-info-foot' },
          h('div', { className: 'df-chips', 'aria-label': 'Agregar un tema' }, (props.suggest || TOPICS.filter(function (t) { return found.indexOf(t) < 0; }).slice(0, 4)).map(function (t) { return h('button', { key: t, type: 'button', className: 'df-chipbtn df-chip-sm' }, '+ ' + t); })),
          h('span', { className: 'df-info-count' }, len.toLocaleString('es-CL') + ' caracteres'))),
      h('div', { className: 'df-cov', id: 'df-info-cov' },
        h('span', { className: 'df-cov-l' }, h(Icon, { name: 'sparkle', size: 'sm' }), found.length >= 3 ? 'Suficiente para empezar' : 'Agrega un poco más', ' · ', 'la IA encontró:'),
        h('ul', null, TOPICS.map(function (t) {
          var ok = found.indexOf(t) >= 0;
          return h('li', { key: t, className: ok ? 'is-ok' : '' }, h(Icon, { name: ok ? 'check' : 'minus', size: 'sm', strokeWidth: 2.25 }), t);
        }))));
  }

  /* =========================================================
     Reseñas importadas de AliExpress
     ========================================================= */

  /* Stars: calificación con estrellas en tinta, con texto accesible */
  function Stars(props) {
    var n = props.value || 0, out = [];
    for (var i = 1; i <= 5; i++) out.push(h('svg', { key: i, className: cx('df-star', i <= Math.round(n) && 'is-on'), viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: P.star })));
    return h('span', { className: cx('df-stars', props.size === 'lg' && 'is-lg'), role: 'img', 'aria-label': String(n).replace('.', ',') + ' de 5 estrellas' }, out);
  }

  /* ReviewImporter: trae reseñas desde el enlace del producto en AliExpress */
  function ReviewImporter(props) {
    var st = props.state || 'idle';
    return h('section', { className: cx('df-card df-rimp', 'is-' + st), 'aria-label': 'Importar reseñas' },
      h('div', { className: 'df-conn-head' },
        h('span', { className: 'df-pmark', 'aria-hidden': 'true' }, h(Icon, { name: 'star' })),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { className: 'df-conn-name' }, props.title || 'Reseñas de AliExpress'),
          h('div', { className: 'df-conn-acc' }, st === 'done' ? props.summary : 'Pega el enlace del producto en AliExpress')),
        st === 'fetching' ? h('span', { className: 'df-status df-status-progress', role: 'status' }, h(Icon, { name: 'loader', className: 'df-spin', strokeWidth: 2 }), 'Importando') :
          st === 'done' ? h('span', { className: 'df-status df-status-success' }, h(Icon, { name: 'check-circle', strokeWidth: 2 }), 'Importadas') :
          st === 'error' ? h('span', { className: 'df-status df-status-danger' }, h(Icon, { name: 'alert', strokeWidth: 2 }), 'No se pudo') : null),
      st === 'fetching' ? h('div', { className: 'df-conn-prog' },
        h('div', { className: 'df-conn-track' }, h('span', { style: { width: Math.round((props.progress || 0) * 100) + '%' } })),
        h('div', { className: 'df-conn-detail' }, props.detail || 'Leyendo reseñas…')) : null,
      st === 'idle' || st === 'error' ? h(Frag, null,
        h('div', { className: cx('df-field', st === 'error' && 'is-error') },
          h('label', { className: 'df-field-label', htmlFor: 'df-ali' }, 'Enlace del producto'),
          h('div', { className: 'df-field-box' }, h(Icon, { name: 'link', size: 'sm', className: 'df-muted' }), h('input', { id: 'df-ali', type: 'url', inputMode: 'url', defaultValue: props.url || '', placeholder: 'https://es.aliexpress.com/item/…', 'aria-invalid': st === 'error' ? 'true' : undefined })),
          h('span', { className: 'df-field-hint' }, props.error || 'Lo encuentras en la barra de direcciones del producto en AliExpress.')),
        props.filters === false ? null : h('fieldset', { className: 'df-rimp-f' },
          h('legend', { className: 'df-field-label' }, 'Qué traer'),
          h(SegmentedControl, { block: true, value: props.minStars || '4', label: 'Calificación mínima', options: [{ value: '1', label: 'Todas' }, { value: '4', label: '4★ o más' }, { value: '5', label: 'Solo 5★' }] }),
          h('label', { className: 'df-switch' }, h('input', { type: 'checkbox', defaultChecked: true }), h('span', { className: 'df-switch-ui', 'aria-hidden': 'true' }), h('span', null, 'Traducir al español', h('small', null, 'Se guarda el texto original'))),
          h('label', { className: 'df-switch' }, h('input', { type: 'checkbox', defaultChecked: props.photosOnly }), h('span', { className: 'df-switch-ui', 'aria-hidden': 'true' }), h('span', null, 'Solo con fotos', h('small', null, 'Las que más convencen')))),
        h(Button, { variant: props.primary === false ? 'secondary' : 'primary', block: true, icon: 'arrow-down' }, 'Importar reseñas')) : null,
      st === 'done' && props.actions ? h('div', { className: 'df-conn-actions' }, props.actions) : null);
  }

  /* ReviewSummary: promedio, distribución y avance de la curación */
  function ReviewSummary(props) {
    var dist = props.distribution || [0, 0, 0, 0, 0];
    var max = Math.max.apply(null, dist) || 1;
    return h('div', { className: 'df-rsum' },
      h('div', { className: 'df-rsum-avg' },
        h('span', { className: 'df-profit-v' }, String(props.average).replace('.', ',')),
        h(Stars, { value: props.average }),
        h('span', { className: 'df-pick-meta' }, props.total + ' importadas')),
      h('ul', { className: 'df-rsum-dist', 'aria-label': 'Distribución por estrellas' }, [5, 4, 3, 2, 1].map(function (s) {
        var v = dist[s - 1];
        return h('li', { key: s }, h('span', null, s + '★'), h('span', { className: 'df-rsum-bar' }, h('span', { style: { width: (v / max * 100) + '%' } })), h('span', { className: 'df-rsum-n' }, v));
      })));
  }

  /* ReviewItem: una reseña para aprobar, rechazar o editar */
  var RV_STATE = {
    pending: null,
    approved: { status: 'aprobado', label: 'Aprobada' },
    rejected: { status: 'rechazado', label: 'Rechazada' },
    published: { status: 'publicado', label: 'Publicada' }
  };
  function ReviewItem(props) {
    var st = props.state || 'pending', editing = props.editing, badge = RV_STATE[st];
    return h('article', { className: cx('df-rev', 'is-' + st, editing && 'is-editing'), 'aria-label': 'Reseña de ' + props.author },
      h('header', { className: 'df-rev-head' },
        h(Stars, { value: props.rating }),
        h('span', { className: 'df-rev-who' }, props.author, ' · ', props.country, ' · ', props.date),
        badge ? h('span', { style: { marginLeft: 'auto' } }, h(StatusBadge, { status: badge.status, label: badge.label, size: 'sm' })) : null),
      props.variant ? h('div', { className: 'df-rev-var' }, props.variant) : null,
      editing ? h('div', { className: 'df-rev-edit' },
          h('textarea', { defaultValue: props.text, 'aria-label': 'Editar texto de la reseña', rows: 3 }),
          h('div', { className: 'df-rev-edit-n' }, h(Icon, { name: 'shield', size: 'sm' }), 'Corrige traducción u ortografía sin cambiar lo que opinó el cliente.'))
        : h('p', { className: 'df-rev-text' }, props.text),
      props.photos ? h('div', { className: 'df-rev-photos' }, Array.apply(null, Array(props.photos)).map(function (_, i) { return h('img', { key: i, src: productImage((props.imageIndex || 1) + i, 1), alt: 'Foto ' + (i + 1) + ' del cliente' }); })) : null,
      h('div', { className: 'df-rev-meta' },
        props.translated ? h('button', { type: 'button', className: 'df-rev-link' }, h(Icon, { name: 'text', size: 'sm' }), 'Traducida · ver original') : null,
        props.edited ? h('span', { className: 'df-rev-tag' }, h(Icon, { name: 'edit', size: 'sm' }), 'Editada por ti') : null,
        (props.flags || []).map(function (f, i) { return h('span', { key: i, className: 'df-issue' }, f); })),
      props.original && editing ? h('div', { className: 'df-orig' }, h('div', { className: 'df-orig-label' }, 'Original (' + (props.lang || 'inglés') + ')'), h('div', { className: 'df-orig-text' }, props.original)) : null,
      props.hideActions ? null : editing
        ? h('div', { className: 'df-rev-actions', style: { gridTemplateColumns: '1fr 1.4fr' } }, h(Button, { variant: 'ghost', size: 'sm' }, 'Cancelar'), h(Button, { variant: 'primary', size: 'sm', icon: 'check' }, 'Guardar y aprobar'))
        : st === 'pending' ? h('div', { className: 'df-rev-actions' },
            h(Button, { variant: 'secondary', size: 'sm', icon: 'x' }, 'Rechazar'),
            h(Button, { variant: 'secondary', size: 'sm', icon: 'edit' }, 'Editar'),
            h(Button, { variant: 'primary', size: 'sm', icon: 'check' }, 'Aprobar'))
        : h('div', { className: 'df-rev-actions is-done' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'undo' }, 'Deshacer')));
  }

  /* =========================================================
     Ángulos de venta: ranking del orquestador y desarrollos
     ========================================================= */

  /* ScoreBar: puntaje 0–100 calculado en código */
  function ScoreBar(props) {
    var v = Math.max(0, Math.min(100, props.value || 0));
    var band = v >= 70 ? 'Alto' : v >= 45 ? 'Medio' : 'Bajo';
    return h('div', { className: cx('df-score', props.size === 'lg' && 'is-lg'), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': v, 'aria-label': 'Puntaje ' + v + ' de 100, ' + band.toLowerCase() },
      h('span', { className: 'df-score-v' }, v, h('small', null, '/100')),
      h('span', { className: 'df-score-track' }, h('span', { className: 'band-' + band.toLowerCase(), style: { width: v + '%' } })),
      props.hideBand ? null : h('span', { className: 'df-score-band' }, band));
  }

  /* RoleChip: principal / secundario / sugerencia IA */
  function RoleChip(props) {
    if (props.role === 'principal') return h('span', { className: 'df-role is-principal' }, h('b', null, '1'), props.short ? 'Principal' : 'Principal · gancho');
    if (props.role === 'secundario') return h('span', { className: 'df-role is-secundario' }, h('b', null, '2'), props.short ? 'Secundario' : 'Secundario · refuerzo');
    if (props.role === 'sugerido') return h('span', { className: 'df-role is-ai' }, h(Icon, { name: 'sparkle', size: 'sm' }), 'Sugerido por la IA');
    return null;
  }

  /* AngleCard: un ángulo del ranking con puntaje, motivos, riesgos y desglose */
  function AngleCard(props) {
    var role = props.role, low = props.score < 45;
    return h('article', { className: cx('df-angle', role && 'is-' + role, low && 'is-low', props.expanded && 'is-open'), 'aria-label': 'Ángulo ' + props.name + ', puesto ' + props.rank },
      h('header', { className: 'df-angle-head' },
        h('span', { className: 'df-angle-rank', 'aria-hidden': 'true' }, props.rank),
        h('div', { className: 'df-angle-t' },
          h('div', { className: 'df-angle-name' }, props.name),
          h('div', { className: 'df-angle-roles' }, h(RoleChip, { role: role }), props.suggestedRole && props.suggestedRole !== role ? h('span', { className: 'df-role is-ai' }, h(Icon, { name: 'sparkle', size: 'sm' }), 'La IA sugería ' + props.suggestedRole) : role && props.suggestedRole === role ? h(RoleChip, { role: 'sugerido' }) : null))),
      h(ScoreBar, { value: props.score }),
      props.fit ? h('p', { className: 'df-angle-fit' }, h(Icon, { name: low ? 'minus' : 'check', size: 'sm', strokeWidth: 2.25 }), props.fit) : null,
      props.risks && props.risks.length ? h('ul', { className: 'df-angle-risks', 'aria-label': 'Riesgos' }, props.risks.map(function (r, i) {
        return h('li', { key: i }, h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }), h('span', null, r.text), r.penalty ? h('b', null, '−' + r.penalty) : null, r.fix ? h('button', { type: 'button', className: 'df-rev-link' }, r.fix) : null);
      })) : null,
      props.expanded && props.breakdown ? h('dl', { className: 'df-angle-bd' },
        props.breakdown.map(function (b, i) { return h('div', { key: i, className: b.value < 0 ? 'is-neg' : '' }, h('dt', null, b.label), h('dd', null, (b.value > 0 ? '+' : b.value < 0 ? '−' : '') + Math.abs(b.value))); }),
        h('div', { className: 'is-total' }, h('dt', null, 'Puntaje final'), h('dd', null, props.score))) : null,
      props.hideActions ? null : h('div', { className: 'df-angle-actions' },
        h('button', { type: 'button', className: 'df-rev-link', 'aria-expanded': props.expanded ? 'true' : 'false' }, props.expanded ? 'Ocultar cálculo' : 'Cómo se calculó'),
        h('span', { style: { flex: 1 } }),
        role ? h(Button, { size: 'sm', variant: 'ghost' }, 'Quitar') : h(Button, { size: 'sm', variant: 'secondary', iconEnd: 'chevron-right' }, 'Usar este')));
  }

  /* AngleSuggestion: la elección del orquestador, cómo se combinan y qué falta */
  function AngleSuggestion(props) {
    return h('section', { className: 'df-card df-asug', 'aria-label': 'Sugerencia de la IA' },
      h('div', { className: 'df-asug-h' }, h(Icon, { name: 'sparkle', size: 'sm' }), props.changed ? 'Tu elección' : 'La IA sugiere'),
      h('div', { className: 'df-asug-pair' },
        h('div', null, h(RoleChip, { role: 'principal', short: true }), h('b', null, props.principal), h('small', null, props.principalScore + '/100')),
        h('span', { className: 'df-asug-plus', 'aria-hidden': 'true' }, '+'),
        h('div', null, h(RoleChip, { role: 'secundario', short: true }), h('b', null, props.secundario), h('small', null, props.secundarioScore + '/100'))),
      props.combo ? h('p', { className: 'df-asug-combo' }, props.combo) : null,
      props.missing && props.missing.length ? h('div', { className: 'df-asug-miss' },
        h('div', { className: 'df-asug-mt' }, 'Para elegir mejor, falta:'),
        h('ul', null, props.missing.map(function (m, i) { return h('li', { key: i }, h('span', null, m.text), m.action ? h(Button, { size: 'sm', variant: 'secondary' }, m.action) : null); }))) : null);
  }

  /* IcpSummary: el cliente ideal aprobado, entrada del orquestador */
  function IcpSummary(props) {
    return h('section', { className: 'df-card df-icp', 'aria-label': 'Cliente ideal' },
      h('div', { className: 'df-icp-h' }, h('span', { className: 'df-conn-name' }, 'Cliente ideal'), h(StatusBadge, { status: props.approved === false ? 'revision' : 'aprobado', size: 'sm' })),
      h('p', { className: 'df-icp-t' }, props.text),
      props.tags ? h('div', { className: 'df-pick-issues' }, props.tags.map(function (t, i) { return h('span', { key: i, className: 'df-rev-tag' }, t); })) : null,
      props.action ? h('button', { type: 'button', className: 'df-rev-link', style: { alignSelf: 'flex-start' } }, props.action) : null);
  }

  /* AngleDevelopment: el desarrollo de un ángulo para revisar y aprobar */
  var AIDA = [['atencion', 'Atención'], ['interes', 'Interés'], ['deseo', 'Deseo'], ['accion', 'Acción']];
  function AngleDevelopment(props) {
    var st = props.status || 'revision';
    if (st === 'generando') return h('section', { className: 'df-card df-adev is-loading', role: 'status' },
      h('div', { className: 'df-adev-h' }, h(RoleChip, { role: props.role }), h('b', null, props.angle), h(StatusBadge, { status: 'publicando', label: 'Generando', size: 'sm' })),
      [1, 2, 3, 4].map(function (i) { return h('span', { key: i, className: 'df-skel', style: { width: (90 - i * 12) + '%' } }); }));
    return h('section', { className: cx('df-card df-adev', 'is-' + st), 'aria-label': 'Desarrollo del ángulo ' + props.angle },
      h('div', { className: 'df-adev-h' },
        h(RoleChip, { role: props.role }),
        h('b', null, props.angle),
        h(StatusBadge, { status: st === 'aprobado' ? 'aprobado' : 'revision', size: 'sm' })),
      h('div', { className: 'df-adev-s' },
        h('div', { className: 'df-adev-st' }, 'Ganchos', h('small', null, props.role === 'principal' ? 'abren el anuncio' : 'refuerzan el argumento')),
        h('ol', { className: 'df-hooks' }, (props.hooks || []).map(function (x, i) { return h('li', { key: i, className: props.pickedHook === i ? 'is-pick' : '' }, h('span', null, x), props.pickedHook === i ? h('span', { className: 'df-role is-ai' }, 'Recomendado') : null); }))),
      props.aida ? h('div', { className: 'df-adev-s' },
        h('div', { className: 'df-adev-st' }, 'Argumento por etapa'),
        h('dl', { className: 'df-aida' }, AIDA.map(function (a) { return h('div', { key: a[0] }, h('dt', null, a[1]), h('dd', null, props.aida[a[0]])); }))) : null,
      props.objections ? h('div', { className: 'df-adev-s' },
        h('div', { className: 'df-adev-st' }, 'Objeciones'),
        h('ul', { className: 'df-obj' }, props.objections.map(function (o, i) { return h('li', { key: i }, h('b', null, '“' + o.q + '”'), h('span', null, o.a)); }))) : null,
      props.offer ? h('div', { className: 'df-adev-s' }, h('div', { className: 'df-adev-st' }, 'Oferta'), h('p', { className: 'df-adev-offer' }, props.offer)) : null,
      props.hideActions || st === 'aprobado' ? (st === 'aprobado' ? h('div', { className: 'df-rev-actions is-done' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'undo' }, 'Volver a revisar')) : null) :
        h('div', { className: 'df-review-actions' },
          h(Button, { variant: 'secondary', icon: 'sparkle' }, 'Regenerar'),
          h(Button, { variant: 'secondary', icon: 'edit' }, 'Editar'),
          h(Button, { variant: 'primary', icon: 'check' }, 'Aprobar')));
  }

  /* =========================================================
     Anuncios: configurador de lanzamiento y motor de decisión
     ========================================================= */

  /* StructurePicker: ABO o CBO */
  var STRUCT = {
    abo: { t: 'ABO · presupuesto por conjunto', d: 'Para testear. Un conjunto por creativo: apagas el que no funciona sin tocar al resto.', tag: 'Testeo' },
    cbo: { t: 'CBO · presupuesto de campaña', d: 'Para escalar ganadores. Meta reparte el presupuesto entre los conjuntos.', tag: 'Escalado' }
  };
  function StructurePicker(props) {
    return h('fieldset', { className: 'df-opts' },
      h('legend', { className: 'df-opts-l' }, props.label || 'Estructura'),
      h('div', { className: 'df-struct' }, ['abo', 'cbo'].map(function (k) {
        var s = STRUCT[k], sel = props.value === k;
        return h('label', { key: k, className: cx('df-struct-o', sel && 'is-sel') },
          h('input', { type: 'radio', name: 'df-struct', defaultChecked: sel }),
          h('span', { className: 'df-radio', 'aria-hidden': 'true' }),
          h('span', { className: 'df-struct-b' },
            h('span', { className: 'df-opt-t' }, s.t),
            h('span', { className: 'df-opt-m' }, s.d)),
          h('span', { className: 'df-struct-mini', 'aria-hidden': 'true' },
            h('i', { className: k === 'cbo' ? 'is-budget' : '' }),
            h('span', null, h('i', { className: k === 'abo' ? 'is-budget' : '' }), h('i', { className: k === 'abo' ? 'is-budget' : '' }), h('i', { className: k === 'abo' ? 'is-budget' : '' }))));
      })));
  }

  /* PresetSelect: plantillas precargadas, editables */
  function PresetSelect(props) {
    return h('div', { className: 'df-preset' },
      h('div', { className: 'df-field' },
        h('label', { className: 'df-field-label', htmlFor: 'df-preset' }, props.label || 'Plantilla'),
        h('div', { className: 'df-field-box df-sel-box' },
          h('select', { id: 'df-preset', className: 'df-sel', defaultValue: props.value }, (props.options || []).map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })),
          h(Icon, { name: 'chevron-right', size: 'sm', className: 'df-sel-ico' }))),
      props.source ? h('p', { className: 'df-field-hint', style: { margin: 0 } }, props.source) : null,
      props.modified ? h('div', { className: 'df-preset-mod' },
        h('span', null, h(Icon, { name: 'edit', size: 'sm' }), props.modified + ' cambios sobre la plantilla'),
        h('button', { type: 'button', className: 'df-rev-link' }, 'Restablecer'),
        h('button', { type: 'button', className: 'df-rev-link' }, 'Guardar como plantilla')) : null);
  }

  /* ConfigSection: sección plegable con resumen y marca de editado */
  function ConfigSection(props) {
    return h('section', { className: cx('df-cfg', props.open && 'is-open', props.error && 'is-error') },
      h('button', { type: 'button', className: 'df-cfg-h', 'aria-expanded': props.open ? 'true' : 'false' },
        h('span', { className: 'df-cfg-n' }, props.error ? h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }) : props.done ? h(Icon, { name: 'check', size: 'sm', strokeWidth: 2.25 }) : props.index),
        h('span', { className: 'df-cfg-t' }, h('b', null, props.title), props.open ? null : h('small', null, props.error || props.summary)),
        props.edited ? h('span', { className: 'df-rev-tag' }, 'Editado') : null,
        h(Icon, { name: 'chevron-right', size: 'sm', className: 'df-cfg-chev' })),
      props.open ? h('div', { className: 'df-cfg-b' }, props.children) : null);
  }

  /* ChipInput: países, regiones o intereses */
  function ChipInput(props) {
    return h('div', { className: 'df-field' },
      h('span', { className: 'df-field-label' }, props.label),
      h('div', { className: cx('df-chipin', props.disabled && 'is-dis') },
        (props.values || []).map(function (v, i) { return h('span', { key: i, className: 'df-chipv' }, v, props.disabled ? null : h('button', { type: 'button', 'aria-label': 'Quitar ' + v }, h(Icon, { name: 'x', size: 'sm', strokeWidth: 2.25 }))); }),
        props.disabled ? null : h('input', { placeholder: props.placeholder || 'Agregar…', 'aria-label': props.label })),
      props.hint ? h('span', { className: 'df-field-hint' }, props.hint) : null);
  }

  /* RuleRow: una regla escrita como frase, con los valores editables en línea */
  function Inline(props) {
    return h('span', { className: cx('df-inl', props.select && 'is-sel') }, props.prefix ? h('small', null, props.prefix) : null, h('b', null, props.value), props.suffix ? h('small', null, props.suffix) : null);
  }
  function RuleRow(props) {
    return h('li', { className: cx('df-rule', props.off && 'is-off') },
      h('label', { className: 'df-switch df-rule-sw' }, h('input', { type: 'checkbox', defaultChecked: !props.off, 'aria-label': 'Activar regla' }), h('span', { className: 'df-switch-ui', 'aria-hidden': 'true' })),
      h('span', { className: 'df-rule-txt' }, props.parts.map(function (p, i) { return typeof p === 'string' ? h(Frag, { key: i }, p) : h(Inline, Object.assign({ key: i }, p)); })),
      h(IconButton, { icon: 'more', label: 'Opciones de la regla' }));
  }
  var RG = {
    esperar: { t: 'Esperar', d: 'No decidir mientras Meta aprende', icon: 'clock', c: 'k-wait' },
    pausar: { t: 'Pausar', d: 'Cortar lo que pierde dinero', icon: 'pause', c: 'k-pause' },
    escalar: { t: 'Escalar', d: 'Subir presupuesto a lo que gana', icon: 'trend', c: 'k-scale' }
  };
  function RuleGroup(props) {
    var g = RG[props.kind];
    return h('section', { className: cx('df-rg', g.c) },
      h('div', { className: 'df-rg-h' }, h('span', { className: 'df-rg-ico' }, h(Icon, { name: g.icon, size: 'sm', strokeWidth: 2 })), h('span', null, h('b', null, g.t), h('small', null, props.desc || g.d)), props.level ? h('span', { className: 'df-rev-tag' }, props.level) : null),
      h('ul', { className: 'df-rules' }, props.children),
      props.add === false ? null : h('button', { type: 'button', className: 'df-rg-add' }, h(Icon, { name: 'plus', size: 'sm' }), 'Agregar condición'));
  }

  /* CreativeSlot: un creativo subido y el conjunto que genera */
  function CreativeSlot(props) {
    var st = props.state || 'ready';
    return h('div', { className: cx('df-cslot', 'is-' + st) },
      h('div', { className: 'df-cslot-m' },
        st === 'uploading' ? h('span', { className: 'df-tile-center' }, h('span', { className: 'df-ref-pct' }, Math.round((props.progress || 0) * 100) + '%'), 'Subiendo') :
        st === 'error' ? h('span', { className: 'df-tile-center', style: { color: 'var(--destructive)' } }, h(Icon, { name: 'alert' }), 'Error') :
        h('img', { src: productImage(props.imageIndex || 0, 1), alt: '' }),
        props.type === 'video' && st === 'ready' ? h('span', { className: 'df-cslot-play' }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: 'M8 5.5v13l10-6.5z', fill: 'currentColor' })), props.duration) : null,
        st === 'ready' || st === 'processing' ? h('span', { className: 'df-ref-src' }, props.ratio || (props.type === 'video' ? 'Video' : 'Imagen')) : null),
      h('div', { className: 'df-cslot-b' },
        h('span', { className: 'df-uplist-n' }, props.name),
        h('span', { className: cx('df-uplist-m', st === 'error' && 't-danger') }, st === 'error' ? props.error : st === 'processing' ? 'Meta está procesando el video…' : props.adset ? '→ ' + props.adset : props.detail)),
      h(IconButton, { icon: 'x', label: 'Quitar creativo' }));
  }

  /* CampaignTree: vista previa de la estructura que se creará en Meta */
  function CampaignTree(props) {
    var abo = props.structure !== 'cbo';
    return h('div', { className: 'df-tree', role: 'tree', 'aria-label': 'Estructura de la campaña' },
      h('div', { className: 'df-tree-n is-camp', role: 'treeitem' },
        h(Icon, { name: 'megaphone', size: 'sm' }), h('span', null, h('b', null, props.name), h('small', null, 'Campaña · Ventas · ' + (abo ? 'ABO' : 'CBO'))),
        abo ? null : h('span', { className: 'df-tree-bud' }, props.budget + '/día')),
      h('ul', null, (props.adsets || []).map(function (a, i) {
        return h('li', { key: i },
          h('div', { className: 'df-tree-n', role: 'treeitem' }, h(Icon, { name: 'box', size: 'sm' }), h('span', null, h('b', null, a.name), h('small', null, a.audience)), abo ? h('span', { className: 'df-tree-bud' }, a.budget + '/día') : null),
          h('ul', null, (a.ads || []).map(function (ad, j) { return h('li', { key: j }, h('div', { className: 'df-tree-n is-ad', role: 'treeitem' }, h(Icon, { name: ad.type === 'video' ? 'image' : 'image', size: 'sm' }), h('span', null, h('b', null, ad.name), h('small', null, ad.type === 'video' ? 'Video' : 'Imagen')))); })));
      })),
      props.note ? h('p', { className: 'df-field-hint', style: { margin: '8px 0 0' } }, props.note) : null);
  }

  /* DecisionRow: lo que el motor decidió para un conjunto o anuncio */
  var DEC = {
    esperar: { t: 'Esperando', icon: 'clock', c: 'k-wait' },
    mantener: { t: 'Mantener', icon: 'check', c: 'k-keep' },
    pausar: { t: 'Pausar', icon: 'pause', c: 'k-pause' },
    pausado: { t: 'Pausado', icon: 'pause', c: 'k-paused' },
    escalar: { t: 'Escalar', icon: 'trend', c: 'k-scale' }
  };
  function DecisionRow(props) {
    var d = DEC[props.decision];
    return h('article', { className: cx('df-dec', d.c) },
      h('div', { className: 'df-dec-h' },
        h('img', { className: 'df-thumb', style: { width: 40, height: 40 }, src: productImage(props.imageIndex || 0, 1), alt: '' }),
        h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { className: 'df-conn-name' }, props.name), h('div', { className: 'df-pick-meta' }, props.metrics)),
        h('span', { className: 'df-dec-chip' }, h(Icon, { name: d.icon, size: 'sm', strokeWidth: 2.25 }), props.label || d.t)),
      props.progress != null ? h('div', { className: 'df-conn-prog' }, h('div', { className: 'df-conn-track' }, h('span', { style: { width: Math.round(props.progress * 100) + '%' } })), h('div', { className: 'df-conn-detail' }, props.reason)) :
        h('p', { className: 'df-dec-r' }, props.reason),
      props.rule ? h('div', { className: 'df-dec-rule' }, h(Icon, { name: 'settings', size: 'sm' }), 'Regla: ', props.rule) : null,
      props.actions ? h('div', { className: 'df-camp-actions' }, props.actions) : null);
  }

  /* =========================================================
     Textos: la página del producto
     ========================================================= */

  /* EmptyState: estados de una etapa sin contenido que revisar */
  function EmptyState(props) {
    var tone = props.tone || 'neutral';
    return h('section', { className: cx('df-empty', 't-' + tone), role: tone === 'error' ? 'alert' : props.busy ? 'status' : undefined },
      h('span', { className: 'df-empty-ico' }, h(Icon, { name: props.icon || 'text', className: props.busy ? 'df-pulse' : undefined })),
      h('h2', { className: 'df-empty-t' }, props.title),
      props.body ? h('p', { className: 'df-empty-b' }, props.body) : null,
      props.children,
      props.action || props.secondary ? h('div', { className: 'df-empty-a' }, props.action, props.secondary) : null);
  }

  /* Notice: aviso sobre una lista (desactualizado, faltan datos) */
  function Notice(props) {
    var tone = props.tone || 'warning';
    return h('div', { className: cx('df-notice', 't-' + tone), role: 'status' },
      h(Icon, { name: props.icon || (tone === 'warning' ? 'alert' : 'sparkle'), size: 'sm', strokeWidth: 2 }),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('b', null, props.title), props.body ? h('span', null, props.body) : null),
      props.action || null);
  }

  /* PageOutline: los bloques de la página en orden, con su estado; navega la revisión */
  var BLK = {
    accepted: { i: 'check', c: 'is-ok', t: 'Aceptado' },
    edited: { i: 'check', c: 'is-ok', t: 'Tu versión' },
    pending: { i: null, c: 'is-pend', t: 'Por revisar' },
    current: { i: null, c: 'is-cur', t: 'Revisando' },
    discarded: { i: 'x', c: 'is-off', t: 'Descartado' },
    missing: { i: 'alert', c: 'is-miss', t: 'Falta aprobar' },
    omitted: { i: 'minus', c: 'is-omit', t: 'No se incluye' }
  };
  function PageOutline(props) {
    return h('nav', { className: 'df-outline', 'aria-label': 'Bloques de la página' },
      (props.groups || []).map(function (g, gi) {
        return h('div', { key: gi, className: 'df-outline-g' },
          h('div', { className: 'df-outline-gt' }, g.title),
          h('ul', null, g.items.map(function (it, i) {
            var b = BLK[it.state || 'pending'];
            return h('li', { key: i },
              h('button', { type: 'button', className: cx('df-outline-i', b.c), 'aria-current': it.state === 'current' ? 'true' : undefined },
                h('span', { className: 'df-outline-dot', 'aria-hidden': 'true' }, b.i ? h(Icon, { name: b.i, size: 'sm', strokeWidth: 2.5 }) : null),
                h('span', { className: 'df-outline-l' }, it.label, it.required ? h('small', null, ' · obligatorio') : null),
                h('span', { className: 'df-sr' }, b.t)));
          })));
      }));
  }

  /* CopySummary: lo aprobado por sección, al terminar la etapa */
  function CopySummary(props) {
    var TAG = { edited: 'Tu versión', kept: 'Se mantiene Shopify', omitted: 'No va en la página', missing: 'Falta aprobar' };
    return h('div', { className: 'df-csum' }, (props.sections || []).map(function (s, i) {
      return h('section', { key: i, className: 'df-csum-s' },
        h('div', { className: 'df-adev-st' }, s.title),
        h('ul', null, s.items.map(function (it, j) {
          return h('li', { key: j, className: it.tag ? 'is-' + it.tag : '' },
            h('span', { className: 'df-csum-l' }, it.label, it.tag ? h('span', { className: cx('df-rev-tag', it.tag === 'missing' && 't-miss') }, TAG[it.tag]) : null),
            it.text ? h('span', { className: 'df-csum-t' }, it.text) : null);
        })));
    }));
  }

  /* =========================================================
     Costo de IA por producto
     ========================================================= */
  function usd(n) { return 'US$' + n.toFixed(2).replace('.', ','); }

  /* AiCostChip: indicador compacto en la barra del producto */
  function AiCostChip(props) {
    var pct = props.cap ? props.total / props.cap : 0;
    var tone = pct >= 1 ? 'is-over' : pct >= 0.8 ? 'is-warn' : '';
    return h('button', { type: 'button', className: cx('df-aichip', tone, props.running && 'is-run'), 'aria-label': 'Costo de IA de este producto: ' + money(props.total) + (props.cap ? ', ' + Math.round(pct * 100) + '% del tope' : '') + '. Ver detalle' },
      h(Icon, { name: props.running ? 'loader' : 'sparkle', size: 'sm', className: props.running ? 'df-spin' : undefined }),
      h('span', { className: 'df-aichip-v' }, money(props.total)),
      props.cap ? h('span', { className: 'df-aichip-bar', 'aria-hidden': 'true' }, h('span', { style: { width: Math.min(100, pct * 100) + '%' } })) : null);
  }

  /* AiCostCard: total, por etapa, tope y contexto */
  function AiCostCard(props) {
    var stages = props.stages || [];
    var max = Math.max.apply(null, stages.map(function (s) { return s.cost; }).concat([1]));
    var pct = props.cap ? props.total / props.cap : 0;
    var tone = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
    var admin = props.audience === 'admin';
    return h('section', { className: cx('df-card df-aicost', props.compact && 'is-compact'), 'aria-label': 'Costo de IA del producto' },
      h('div', { className: 'df-aicost-h' },
        h('div', null,
          h('div', { className: 'df-metric-l' }, h(Icon, { name: 'sparkle', size: 'sm' }), ' Costo de IA de este producto'),
          h('div', { className: 'df-aicost-v' }, money(props.total), h('small', null, '≈ ' + usd(props.totalUsd)))),
        h('div', { className: 'df-aicost-n' }, h('b', null, props.generations), h('small', null, 'generaciones'))),
      props.cap ? h('div', { className: cx('df-aicost-cap', 't-' + tone) },
        h('div', { className: 'df-conn-track' }, h('span', { style: { width: Math.min(100, pct * 100) + '%' } })),
        h('div', { className: 'df-aicost-capl' },
          tone === 'over' ? h(Icon, { name: 'alert', size: 'sm', strokeWidth: 2 }) : tone === 'warn' ? h(Icon, { name: 'clock', size: 'sm', strokeWidth: 2 }) : null,
          h('span', null, Math.round(pct * 100) + '% del tope de ' + money(props.cap)),
          tone === 'over' ? h('span', null, ' · regenerar pide confirmación') : tone === 'warn' ? h('span', null, ' · quedan ' + money(props.cap - props.total)) : null)) : null,
      props.compact ? null : h('ul', { className: 'df-aicost-st', 'aria-label': 'Costo por etapa' }, stages.map(function (s, i) {
        return h('li', { key: i, className: s.cost ? '' : 'is-zero' },
          h('span', { className: 'df-aicost-sl' }, s.label, h('small', null, s.cost ? s.runs + (s.runs === 1 ? ' generación' : ' generaciones') + (s.retries ? ' · ' + s.retries + ' reintento' + (s.retries > 1 ? 's' : '') : '') : s.note || 'Sin uso aún')),
          h('span', { className: 'df-aicost-sb', 'aria-hidden': 'true' }, h('span', { style: { width: (s.cost / max * 100) + '%' } })),
          h('span', { className: 'df-aicost-sv' }, s.cost ? money(s.cost) : '—'),
          admin && s.tokens ? h('span', { className: 'df-aicost-tk' }, s.tokens) : null);
      })),
      props.context && !props.compact ? h('p', { className: 'df-aicost-ctx' }, props.context) : null,
      props.action ? h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, props.action) : null);
  }

  /* AiRunList: cada llamada a la IA, con acción, hora y costo */
  var RUN_KIND = { gen: 'Generó', regen: 'Regeneró', retry: 'Reintento', fail: 'Falló' };
  function AiRunList(props) {
    var admin = props.audience === 'admin';
    return h('ol', { className: 'df-airuns', 'aria-label': 'Historial de generaciones' }, (props.runs || []).map(function (r, i) {
      return h('li', { key: i, className: 'k-' + r.kind },
        h('span', { className: 'df-airuns-dot', 'aria-hidden': 'true' }, h(Icon, { name: r.kind === 'fail' ? 'alert' : r.kind === 'retry' ? 'undo' : 'sparkle', size: 'sm', strokeWidth: 2 })),
        h('span', { className: 'df-airuns-b' },
          h('span', { className: 'df-airuns-t' }, RUN_KIND[r.kind], ' · ', r.what),
          h('span', { className: 'df-pick-meta' }, r.stage, ' · ', r.when, admin && r.model ? ' · ' + r.model + ' · ' + r.tokens : '')),
        h('span', { className: 'df-airuns-c' }, r.cost ? money(r.cost) : '$0'));
    }));
  }

  /* =========================================================
     Pantallas de ejemplo (no son componentes: composiciones)
     ========================================================= */
  function Phone(props) {
    return h('div', null,
      h('p', { className: 'df-phone-label' }, props.label),
      h('div', { className: 'df-phone' },
        h('div', { className: 'df-status-strip', 'aria-hidden': 'true' }, h('span', null, '9:41'), h('span', null, '●●● 5G')),
        props.children));
  }
  var ST = function (s) { return s.split(','); };

  function ScreenHoy() {
    return h(Phone, { label: '1 · Hoy — qué requiere tu atención' },
      h(TopBar, { title: 'Hoy', subtitle: 'Miércoles 23 de septiembre', large: true, actions: h(IconButton, { icon: 'search', label: 'Buscar' }) }),
      h('div', { className: 'df-scroll' },
        h('div', { className: 'df-summary' },
          h('div', { className: 'df-sum' }, h('div', { className: 'df-sum-v' }, '6'), h('div', { className: 'df-sum-l' }, h('span', { className: 'df-dot', style: { background: 'var(--warning)' } }), 'Por decidir')),
          h('div', { className: 'df-sum' }, h('div', { className: 'df-sum-v' }, '1'), h('div', { className: 'df-sum-l' }, h('span', { className: 'df-dot', style: { background: 'var(--destructive)' } }), 'Con error')),
          h('div', { className: 'df-sum' }, h('div', { className: 'df-sum-v' }, '12'), h('div', { className: 'df-sum-l' }, h('span', { className: 'df-dot', style: { background: 'var(--success)' } }), 'Publicados'))),
        h('div', { className: 'df-section-t' }, 'Primero esto'),
        h('div', { className: 'df-group' },
          h(AttentionItem, { kind: 'error', title: 'No se pudo publicar en tu tienda', product: 'Lámpara lunar 3D', detail: 'Shopify rechazó 2 imágenes por tamaño.', actions: [h(Button, { key: 1, size: 'sm', variant: 'primary' }, 'Reintentar'), h(Button, { key: 2, size: 'sm', variant: 'ghost' }, 'Ver detalle')] }),
          h(AttentionItem, { kind: 'ads', title: 'Apaga “Masajeador · Video 2”', product: 'Campaña · 4 días', detail: 'CPA $9.800, sobre tu límite de $6.000.', actions: [h(Button, { key: 1, size: 'sm', variant: 'secondary' }, 'Revisar')] })),
        h('div', { className: 'df-section-t' }, 'Contenido por revisar'),
        h('div', { className: 'df-group' },
          h(AttentionItem, { kind: 'review', title: '8 propuestas nuevas', product: 'Corrector de postura', actions: [h(Button, { key: 1, size: 'sm', variant: 'secondary', iconEnd: 'chevron-right' }, 'Revisar ahora')] }),
          h(AttentionItem, { kind: 'stuck', title: 'Falta definir el precio', product: 'Botella térmica 1L · detenido hace 3 días' }))),
      h(Navigation, { active: 'hoy', badges: { hoy: 6 } }));
  }

  function ScreenProductos() {
    return h(Phone, { label: '2 · Productos — dónde está cada uno' },
      h(TopBar, { title: 'Productos', subtitle: '24 productos', large: true, actions: [h(IconButton, { key: 1, icon: 'search', label: 'Buscar' }), h(IconButton, { key: 2, icon: 'plus', label: 'Nuevo producto', variant: 'primary' })] }),
      h('div', { style: { padding: '0 16px 8px' } }, h(SegmentedControl, { block: true, value: 'det', label: 'Filtrar productos', options: [{ value: 'avz', label: 'Avanzan', count: 9 }, { value: 'det', label: 'Detenidos', count: 3 }, { value: 'pub', label: 'Publicados', count: 12 }] })),
      h('div', { className: 'df-scroll' },
        h('div', { className: 'df-group' },
          h(ProductRow, { name: 'Lámpara lunar 3D', imageIndex: 2, stages: ST('done,done,done,done,error,optional'), tone: 'danger', reason: 'Error al publicar · 2 imágenes' }),
          h(ProductRow, { name: 'Corrector de postura', imageIndex: 1, stages: ST('done,current,locked,locked,locked,optional'), tone: 'warning', reason: 'Espera tu revisión · 8 textos' }),
          h(ProductRow, { name: 'Botella térmica 1L', imageIndex: 0, stages: ST('done,done,done,stuck,locked,optional'), tone: 'warning', reason: 'Detenido: falta el precio · 3 días' })),
        h('div', { className: 'df-section-t' }, 'Así se leen'),
        h('div', { style: { padding: '0 16px', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted-foreground)' } },
          [['var(--foreground)', 'Lista'], ['var(--primary)', 'En curso'], ['var(--warning)', 'Detenida'], ['var(--destructive)', 'Error']].map(function (x, i) { return h('span', { key: i, style: { display: 'inline-flex', gap: 6, alignItems: 'center' } }, h('span', { style: { width: 14, height: 6, borderRadius: 9, background: x[0] } }), x[1]); }))),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  var STAGES = [
    { title: 'Producto importado', state: 'done', desc: 'Proveedor · costo $6.900' },
    { title: 'Textos', state: 'review', desc: '8 propuestas esperan tu revisión' },
    { title: 'Imágenes', state: 'current', desc: 'Elige y ordena 4 a 6' },
    { title: 'Precio y oferta', state: 'available', desc: 'Calcula cuánto ganas' },
    { title: 'Publicar en tu tienda', state: 'locked', desc: 'Necesita textos, imágenes y precio aprobados' },
    { title: 'Anuncios', state: 'locked', optional: true, desc: 'Se habilita al publicar' }
  ];
  function ScreenProducto() {
    return h(Phone, { label: '3 · Producto — retomar la ruta' },
      h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: '2 de 5 etapas · editado hace 2 h', actions: h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' }) }),
      h('div', { className: 'df-scroll' },
        h('div', { style: { padding: '4px 16px 12px' } }, h(StageMeter, { stages: ST('done,review,current,locked,locked,optional') })),
        h(StageList, { stages: STAGES })),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', iconEnd: 'chevron-right' }, 'Continuar: Imágenes')),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  function ScreenRevision() {
    return h(Phone, { label: '4 · Revisar lo que generó la IA' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: '3 aceptados · 5 pendientes' }),
      h('div', { style: { padding: '0 16px 8px' } }, h(StageMeter, { stages: ST('done,done,done,current,locked,locked,locked,locked') })),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px' } },
        h(ReviewCard, { field: 'Título del producto', index: 4, total: 8, original: 'Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única', proposal: 'Corrector de postura ajustable: espalda recta en 15 minutos al día', hideActions: true }),
        h('div', { style: { marginTop: 12, fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', gap: 6, alignItems: 'center' } }, h(Icon, { name: 'sparkle', size: 'sm' }), 'Más corto, con el beneficio al frente. 62 caracteres.')),
      h('div', { style: { padding: '0 16px 12px' } }, h(Toast, { message: 'Descripción aceptada', action: 'Deshacer' })),
      h('div', { className: 'df-sticky', style: { display: 'block' } },
        h('div', { className: 'df-review-actions' },
          h(Button, { variant: 'secondary', icon: 'x' }, 'Descartar'),
          h(Button, { variant: 'secondary', icon: 'edit' }, 'Editar'),
          h(Button, { variant: 'primary', icon: 'check' }, 'Aceptar'))));
  }

  function ScreenImagenes() {
    var tiles = [
      { state: 'selected', order: 1, imageIndex: 1, shape: 1 }, { state: 'selected', order: 2, imageIndex: 3, shape: 1 }, { state: 'idle', imageIndex: 0, shape: 1 },
      { state: 'selected', order: 3, imageIndex: 4, shape: 1 }, { state: 'discarded', imageIndex: 5, shape: 1 }, { state: 'idle', imageIndex: 2, shape: 1 },
      { state: 'generating' }, { state: 'generating' }, { state: 'error' }
    ];
    return h(Phone, { label: '5 · Curar imágenes' },
      h(TopBar, { back: 'Corrector de postura', title: 'Imágenes', subtitle: '3 elegidas · la 1 es la portada', actions: h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' }) }),
      h('div', { style: { padding: '0 16px 12px' } }, h(SegmentedControl, { block: true, value: 'all', label: 'Ver', options: [{ value: 'all', label: 'Opciones', count: 9 }, { value: 'sel', label: 'Elegidas', count: 3 }, { value: 'dis', label: 'Descartadas', count: 1 }] })),
      h('div', { className: 'df-scroll', style: { padding: '0 16px' } },
        h('div', { className: 'df-grid3' }, tiles.map(function (t, i) { return h(ImageTile, Object.assign({ key: i, alt: 'Opción ' + (i + 1) }, t)); })),
        h('p', { style: { fontSize: 12, lineHeight: '16px', color: 'var(--muted-foreground)', margin: '12px 0 0' } }, 'Toca para elegir; el número es el orden en tu tienda. Mantén presionado para reordenar.')),
      h('div', { className: 'df-sticky' },
        h(Button, { variant: 'secondary', icon: 'sparkle' }, 'Generar más'),
        h(Button, { variant: 'primary', icon: 'check' }, 'Aprobar 3')));
  }

  function ScreenPrecio() {
    return h(Phone, { label: '6 · Definir el precio' },
      h(TopBar, { back: 'Corrector de postura', title: 'Precio y oferta', actions: h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' }) }),
      h('div', { className: 'df-scroll', style: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: 'Precio de venta', prefix: '$', value: '24.990', id: 'pv' }),
          h(Field, { label: 'Precio tachado', prefix: '$', value: '39.990', id: 'pt' })),
        h('div', { className: 'df-card df-card-pad' },
          h(PriceBreakdown, { price: 24990, parts: [{ label: 'Costo del producto', value: 6900 }, { label: 'Envío', value: 3500 }, { label: 'Publicidad por venta', value: 6000 }], note: 'Supone 1 de cada 5 pedidos sin entregar. Cambia supuestos en Ajustes.' })),
        h(OfferPreview, { title: 'Corrector de postura ajustable', price: 24990, compareAt: 39990, imageIndex: 1 })),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', icon: 'check' }, 'Aprobar precio')));
  }

  function ScreenCampanas() {
    return h(Phone, { label: '7 · Campañas — qué hacer con cada una' },
      h(TopBar, { title: 'Campañas', subtitle: 'Últimos 7 días · gasto $86.400', large: true }),
      h('div', { className: 'df-scroll', style: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(CampaignCard, { name: 'Corrector · Video UGC', imageIndex: 1, verdict: 'subir', reason: 'CPA $4.100 por 3 días, 32% bajo tu límite de $6.000.', nextBudget: '$15.000',
          metrics: [{ label: 'Costo por venta', value: '$4.100', target: 'Límite $6.000', trend: 'good' }, { label: 'Ventas confirmadas', value: '23', target: '82% confirma', trend: 'good' }] }),
        h(CampaignCard, { name: 'Masajeador · Video 2', imageIndex: 4, verdict: 'apagar', reason: 'CPA $9.800 por 4 días; cada venta te deja −$1.200.',
          metrics: [{ label: 'Costo por venta', value: '$9.800', target: 'Límite $6.000', trend: 'bad' }, { label: 'Ventas confirmadas', value: '6', target: '61% confirma', trend: 'warn' }] })),
      h(Navigation, { active: 'campanas', badges: { hoy: 6 } }));
  }

  function ScreenAsistente() {
    return h(Phone, { label: '8 · Asistente sin perder el contexto' },
      h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h(TopBar, { back: 'Corrector de postura', title: 'Precio y oferta' }),
        h('div', { style: { padding: '0 16px' } }, h('div', { className: 'df-card df-card-pad' }, h(PriceBreakdown, { price: 24990, parts: [{ label: 'Costo del producto', value: 6900 }, { label: 'Envío', value: 3500 }, { label: 'Publicidad por venta', value: 6000 }] }))),
        h('div', { style: { position: 'absolute', inset: 0, background: 'var(--scrim)' } }),
        h(AssistantSheet, { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' }, context: 'Corrector de postura · Precio', contextImage: 1,
          messages: [{ from: 'user', text: '¿Me conviene bajar a $19.990?' }, { from: 'ai', text: ['Con $19.990 ganarías $3.590 por venta (18%). Si tu CPA sube a $7.000, pierdes dinero.', 'Mejor: mantén $24.990 y ofrece 2 unidades por $39.990.'], apply: 'Crear oferta 2×$39.990' }],
          suggestions: ['¿Qué precio usa la competencia?', 'Escribe una garantía', 'Otra oferta'] })));
  }

  function DeskFrame(props) {
    return h('div', null, h('p', { className: 'df-phone-label' }, props.label), h('div', { className: cx('df-desk', props.panel && 'has-panel') }, props.children));
  }
  function ScreenDeskProducto() {
    return h(DeskFrame, { label: 'Escritorio · Producto: ruta a la izquierda, trabajo al centro, asistente a la derecha', panel: true },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, '2 de 5 etapas · editado hace 2 h')),
          h(StatusBadge, { status: 'revision' })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '264px 1fr', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12 } }, h(StageList, { stages: STAGES.map(function (s) { return s.title === 'Textos' ? Object.assign({}, s, { state: 'current', desc: 'Propuesta 4 de 8' }) : s.title === 'Imágenes' ? Object.assign({}, s, { state: 'available' }) : s; }) })),
          h('div', { style: { padding: '24px 32px', overflow: 'hidden' } },
            h('div', { className: 'df-review-head', style: { marginBottom: 12 } }, h('span', { className: 'type-heading' }, 'Título del producto'), h('span', { className: 'df-review-count' }, '4 de 8 · 3 aceptados')),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
              h('div', { className: 'df-orig' }, h('div', { className: 'df-orig-label' }, 'Original'), h('div', { className: 'df-orig-text' }, 'Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única')),
              h('div', { className: 'df-prop' }, h('div', { className: 'df-prop-label' }, h(Icon, { name: 'sparkle', size: 'sm' }), 'Propuesta'), h('div', { className: 'df-prop-text' }, 'Corrector de postura ajustable: espalda recta en 15 minutos al día'))),
            h('div', { className: 'df-btn-row', style: { justifyContent: 'flex-end' } },
              h(Button, { variant: 'secondary', icon: 'x', kbd: 'D' }, 'Descartar'),
              h(Button, { variant: 'secondary', icon: 'edit', kbd: 'E' }, 'Editar'),
              h(Button, { variant: 'primary', icon: 'check', kbd: 'A' }, 'Aceptar')),
            h('div', { className: 'df-section-t', style: { padding: '28px 0 8px' } }, 'Siguientes'),
            h('div', { className: 'df-group', style: { margin: 0 } },
              ['Descripción corta', 'Beneficio 1', 'Beneficio 2', 'Preguntas frecuentes'].map(function (f, i) {
                return h('div', { key: i, className: 'df-prow', style: { gridTemplateColumns: '1fr auto', cursor: 'default' } }, h('span', { className: 'df-prow-name' }, f), h(StatusBadge, { status: 'generado', size: 'sm' }));
              }))))),
      h(AssistantSheet, { variant: 'panel', context: 'Corrector de postura · Textos', contextImage: 1,
        messages: [{ from: 'user', text: '¿El título suena exagerado?' }, { from: 'ai', text: '“15 minutos al día” es concreto y creíble. Evita “cura” o “elimina el dolor”: Meta puede rechazar el anuncio.' }],
        suggestions: ['Más corto', 'Tono más cercano'] }));
  }
  function ScreenDeskCampanas() {
    return h(DeskFrame, { label: 'Escritorio · Campañas en dos columnas con la cifra que justifica cada veredicto' },
      h(Navigation, { variant: 'rail', active: 'campanas', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Campañas'), h('div', { className: 'df-topbar-s' }, 'Últimos 7 días · gasto $86.400 · 41 ventas confirmadas')),
          h(SegmentedControl, { value: '7', label: 'Periodo', options: [{ value: 'hoy', label: 'Hoy' }, { value: '7', label: '7 días' }, { value: '30', label: '30 días' }] })),
        h('div', { style: { padding: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' } },
          h(CampaignCard, { name: 'Corrector · Video UGC', imageIndex: 1, verdict: 'subir', reason: 'CPA $4.100 por 3 días, 32% bajo tu límite de $6.000.', metrics: [{ label: 'Costo por venta', value: '$4.100', target: 'Límite $6.000', trend: 'good' }, { label: 'Ventas confirmadas', value: '23', target: '82% confirma', trend: 'good' }, { label: 'Gasto', value: '$38.200' }, { label: 'Retorno', value: '2,6×' }] }),
          h(CampaignCard, { name: 'Masajeador · Video 2', imageIndex: 4, verdict: 'apagar', reason: 'CPA $9.800 por 4 días; cada venta te deja −$1.200.', metrics: [{ label: 'Costo por venta', value: '$9.800', target: 'Límite $6.000', trend: 'bad' }, { label: 'Ventas confirmadas', value: '6', target: '61% confirma', trend: 'warn' }, { label: 'Gasto', value: '$29.400' }, { label: 'Retorno', value: '0,9×' }] }),
          h(CampaignCard, { name: 'Lámpara lunar · Carrusel', imageIndex: 2, verdict: 'aprendiendo', reason: '14 h activa. Espera 48 h o 10 ventas antes de decidir.', actions: null, metrics: [{ label: 'Costo por venta', value: '—' }, { label: 'Gasto', value: '$4.600' }] }),
          h(CampaignCard, { name: 'Botella térmica · Imagen', imageIndex: 0, verdict: 'vigilar', reason: 'CPA $5.700, cerca del límite y subiendo 3 días seguidos.', actions: null, metrics: [{ label: 'Costo por venta', value: '$5.700', target: 'Límite $6.000', trend: 'warn' }, { label: 'Gasto', value: '$14.200' }] }))));
  }

  /* ---------- Pantallas de onboarding ---------- */
  function ObBody(props) { return h('div', { className: 'df-scroll df-ob-body', style: props.style }, props.children); }
  var PERMS_SHOPIFY = [
    { kind: 'read', text: 'Productos, variantes, imágenes y precios' },
    { kind: 'read', text: 'Pedidos, para saber qué se vende y cuánto se entrega' },
    { kind: 'write', text: 'Productos: solo lo que tú apruebes' },
    { kind: 'never', text: 'Datos de pago ni clientes fuera de tus pedidos' }
  ];
  var PERMS_META = [
    { kind: 'read', text: 'Rendimiento de tus campañas y del píxel' },
    { kind: 'write', text: 'Campañas, anuncios y presupuestos que tú apruebes' },
    { kind: 'never', text: 'Publicar en tu página sin tu aprobación' }
  ];
  var GEN = [
    { name: 'Corrector de postura', imageIndex: 1, status: 'generado', detail: '8 textos · 6 imágenes' },
    { name: 'Lámpara lunar 3D', imageIndex: 2, status: 'publicando', detail: 'Escribiendo textos' },
    { name: 'Botella térmica 1L', imageIndex: 0, status: 'cola', detail: 'Empieza en ~1 min' }
  ];

  function ObBienvenida() {
    return h(Phone, { label: 'O1 · Crear cuenta: la promesa en 3 pasos' },
      h(ObBody, { style: { padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 20 } },
        h('div', { className: 'df-rail-brand', style: { padding: 0 } }, h('span', { className: 'df-rail-mark', 'aria-hidden': 'true' }, 'D'), 'DropFlex'),
        h('div', null,
          h('h1', { className: 'df-ob-title', style: { fontSize: 28, lineHeight: '34px', margin: 0 } }, 'Tus productos, mejores y listos para vender'),
          h('p', { className: 'df-ob-desc', style: { margin: '8px 0 0' } }, 'Conecta tu tienda y la IA prepara textos, imágenes y anuncios. Tú decides qué se publica.')),
        h('ol', { className: 'df-ob-promise' },
          [['store', 'Conecta Shopify', 'Traemos tus productos en segundos'], ['sparkle', 'La IA los mejora', 'Textos, imágenes y precio sugerido'], ['check', 'Tú apruebas', 'Nada se publica sin tu OK']].map(function (x, i) {
            return h('li', { key: i }, h('span', { className: 'df-ob-num' }, h(Icon, { name: x[0] })), h('span', null, h('b', null, x[1]), h('small', null, x[2])));
          }))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', borderTop: 0 } },
        h(Button, { variant: 'secondary', size: 'lg', block: true }, 'Continuar con Google'),
        h('div', { className: 'df-ob-or' }, 'o con tu correo'),
        h(Field, { label: 'Correo', value: 'tu@correo.com', id: 'ob-mail' }),
        h(Button, { variant: 'primary', size: 'lg', block: true }, 'Crear cuenta gratis'),
        h('p', { className: 'df-ob-fine' }, '¿Ya tienes cuenta? ', h('a', { href: '#' }, 'Inicia sesión'))));
  }

  function ObShopify() {
    return h(Phone, { label: 'O2 · Paso 1: conectar Shopify (obligatorio)' },
      h(OnboardingHeader, { step: 1, total: 4, optionalSteps: [4], title: 'Conecta tu tienda Shopify', desc: 'De aquí sacamos tus productos para mejorarlos. Te llevaremos a Shopify para que autorices.' }),
      h(ObBody, null,
        h(Field, { label: 'Dirección de tu tienda', value: 'mitienda', suffix: '.myshopify.com', id: 'ob-shop', hint: 'La ves en Shopify › Configuración › Dominios' }),
        h(PermissionList, { title: 'Qué hará DropFlex con tu tienda', items: PERMS_SHOPIFY, note: 'Puedes desconectar en cualquier momento desde Ajustes o desde tu Shopify.' })),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', iconEnd: 'chevron-right' }, 'Conectar con Shopify')));
  }

  function ObShopifyOk() {
    return h(Phone, { label: 'O3 · Tienda conectada, importando en segundo plano' },
      h(OnboardingHeader, { step: 1, total: 4, optionalSteps: [4], title: 'Tienda conectada', desc: 'Estamos trayendo tus productos. Puedes seguir mientras terminamos.' }),
      h(ObBody, null,
        h(ConnectionCard, { provider: 'shopify', state: 'importing', account: 'mitienda.myshopify.com', progress: 0.67, detail: '86 de 128 productos importados' }),
        h(ConnectionCard, { provider: 'shopify', state: 'error', account: 'otratienda.myshopify.com', detail: 'Shopify no encontró esa tienda. Revisa la dirección e intenta de nuevo.', actions: [h(Button, { key: 1, size: 'sm', variant: 'secondary' }, 'Cambiar dirección'), h(Button, { key: 2, size: 'sm', variant: 'ghost' }, 'Reintentar')] }),
        h('p', { className: 'df-ob-fine', style: { textAlign: 'left' } }, 'Arriba: así se ve cuando todo va bien. Abajo: el error, con qué pasó y qué hacer.')),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', iconEnd: 'chevron-right' }, 'Elegir productos')));
  }

  function ObProductos() {
    var rows = [
      { name: 'Corrector de postura', imageIndex: 1, meta: '$24.990 · 41 ventas en 30 días', issues: ['Sin descripción', '2 imágenes'], score: 'Alta', checked: true },
      { name: 'Lámpara lunar 3D', imageIndex: 2, meta: '$19.990 · 18 ventas', issues: ['Título de proveedor'], score: 'Alta', checked: true },
      { name: 'Botella térmica 1L', imageIndex: 0, meta: '$14.990 · 9 ventas', issues: ['Imágenes con texto chino'], score: 'Media', checked: true },
      { name: 'Masajeador de cuello', imageIndex: 4, meta: '$29.990 · 3 ventas', issues: ['Sin precio tachado'], score: 'Media', checked: false }
    ];
    return h(Phone, { label: 'O4 · Paso 2: elegir con qué empezar' },
      h(OnboardingHeader, { step: 2, total: 4, optionalSteps: [4], back: 'Volver', title: 'Elige con qué empezar', desc: 'Te recomendamos los que más venden y más pueden mejorar.' }),
      h('div', { style: { padding: '0 16px 12px' } }, h(SegmentedControl, { block: true, value: 'rec', label: 'Productos', options: [{ value: 'rec', label: 'Recomendados', count: 12 }, { value: 'all', label: 'Todos', count: 128 }] })),
      h(ObBody, { style: { padding: 0 } }, h('div', { className: 'df-group' }, rows.map(function (r, i) { return h(PickRow, Object.assign({ key: i }, r)); }))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', gap: 6 } },
        h(Button, { variant: 'primary', size: 'lg', block: true, iconEnd: 'chevron-right' }, 'Mejorar 3 productos'),
        h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Tu plan incluye 10 productos al mes.')));
  }

  function ObNumeros() {
    return h(Phone, { label: 'O5 · Paso 3: tus números (con valores sugeridos)' },
      h(OnboardingHeader, { step: 3, total: 4, optionalSteps: [4], back: 'Volver', skip: 'Usar sugeridos', title: 'Tus números', desc: 'Con esto calculamos cuánto ganas por venta y cuándo apagar una campaña. Puedes cambiarlos después.' }),
      h(ObBody, { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h(Field, { label: 'De cada 10 pedidos, ¿cuántos se entregan?', value: '8', suffix: 'de 10', id: 'ob-del', ai: true, hint: 'Lo calculamos con tus pedidos de Shopify' }),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          h(Field, { label: 'Envío por pedido', prefix: '$', value: '3.500', id: 'ob-env' }),
          h(Field, { label: 'Máximo por venta en anuncios', prefix: '$', value: '6.000', id: 'ob-cpa', hint: 'Tu CPA límite' })),
        h('div', { className: 'df-card df-card-pad', style: { display: 'flex', gap: 12, alignItems: 'flex-start' } },
          h('span', { className: 'df-att-ico k-review' }, h(Icon, { name: 'tag' })),
          h('div', null, h('div', { className: 'type-heading', style: { fontSize: 15 } }, 'Ejemplo con tu Corrector de postura'), h('div', { className: 'df-att-detail' }, 'A $24.990 ganarías ', h('b', { style: { color: 'var(--success)' } }, '$8.590'), ' por venta entregada, si el anuncio cuesta hasta $6.000.')))),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', iconEnd: 'chevron-right' }, 'Empezar a generar')));
  }

  function ObMeta() {
    return h(Phone, { label: 'O6 · Paso 4: Meta Ads mientras la IA trabaja' },
      h(OnboardingHeader, { step: 4, total: 4, optionalSteps: [4], back: 'Volver', title: 'Conecta Meta Ads', desc: 'Para crear anuncios con tus productos y decirte cuáles funcionan. Si no los usas aún, sáltalo.' }),
      h(ObBody, { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h('div', { className: 'df-card df-card-pad' }, h(GenerationProgress, { compact: true, items: GEN, eta: 'unos 3 min' })),
        h(ConnectionCard, { provider: 'meta', state: 'idle', account: 'Cuenta publicitaria, página y píxel' }),
        h(PermissionList, { title: 'Qué hará DropFlex con Meta', items: PERMS_META })),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column' } },
        h(Button, { variant: 'primary', size: 'lg', block: true }, 'Continuar con Facebook'),
        h(Button, { variant: 'ghost', block: true }, 'Conectar después')));
  }

  function ObMetaCuentas() {
    return h(Phone, { label: 'O7 · Elegir cuenta, página y píxel' },
      h(OnboardingHeader, { step: 4, total: 4, optionalSteps: [4], back: 'Volver', title: 'Elige dónde anunciar', desc: 'Encontramos varias en tu Business Manager.' }),
      h(ObBody, { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
        h(OptionList, { label: 'Cuenta publicitaria', name: 'acc', value: 'a1', options: [
          { value: 'a1', title: 'Mi Tienda CL', meta: 'CLP · activa', tag: 'Sugerida' },
          { value: 'a2', title: 'Pruebas 2025', meta: 'Deshabilitada por Meta', tone: 'danger', disabled: true }] }),
        h(OptionList, { label: 'Página de Facebook', name: 'pg', value: 'p1', options: [{ value: 'p1', title: 'Mi Tienda', meta: 'Instagram vinculado' }] }),
        h(OptionList, { label: 'Píxel', name: 'px', value: 'x1', options: [
          { value: 'x1', title: 'Píxel Mi Tienda', meta: 'Sin compras en 7 días: revisa que esté en tu tienda', tone: 'warning' }] })),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', icon: 'check' }, 'Guardar y terminar')));
  }

  function ObListo() {
    return h(Phone, { label: 'O8 · Listo: el primer producto espera tu revisión' },
      h(ObBody, { style: { paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 20 } },
        h('span', { className: 'df-ob-done', 'aria-hidden': 'true' }, h(Icon, { name: 'check', strokeWidth: 2.5 })),
        h('div', null,
          h('h1', { className: 'df-ob-title', style: { margin: 0 } }, 'Tu primer producto está listo'),
          h('p', { className: 'df-ob-desc', style: { margin: '6px 0 0' } }, 'Revisa lo que propuso la IA. Los demás siguen generándose; te avisamos al terminar.')),
        h('div', { className: 'df-card df-card-pad' }, h(GenerationProgress, { items: GEN, eta: 'unos 2 min' })),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h(ConnectionCard, { provider: 'shopify', state: 'connected', account: 'mitienda.myshopify.com' }),
          h(ConnectionCard, { provider: 'meta', state: 'connected', account: 'Mi Tienda CL · Píxel Mi Tienda' }))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column' } },
        h(Button, { variant: 'primary', size: 'lg', block: true, iconEnd: 'chevron-right' }, 'Revisar Corrector de postura'),
        h(Button, { variant: 'ghost', block: true }, 'Ir a Hoy')));
  }

  function ObHoy() {
    return h(Phone, { label: 'O9 · Hoy, si saltó Meta: la lista de lo pendiente' },
      h(TopBar, { title: 'Hoy', subtitle: 'Miércoles 23 de septiembre', large: true }),
      h('div', { className: 'df-scroll' },
        h('div', { style: { padding: '0 16px' } }, h(SetupChecklist, { items: [
          { title: 'Conectar Shopify', done: true }, { title: 'Elegir productos', done: true }, { title: 'Definir tus números', done: true },
          { title: 'Conectar Meta Ads', desc: 'Para lanzar y vigilar anuncios', action: 'Conectar' }] })),
        h('div', { className: 'df-section-t' }, 'Contenido por revisar'),
        h('div', { className: 'df-group' },
          h(AttentionItem, { kind: 'review', title: '14 propuestas nuevas', product: 'Corrector de postura', actions: [h(Button, { key: 1, size: 'sm', variant: 'primary', iconEnd: 'chevron-right' }, 'Revisar ahora')] }),
          h(AttentionItem, { kind: 'review', title: 'Generando…', product: 'Lámpara lunar 3D · Botella térmica 1L' }))),
      h(Navigation, { active: 'hoy', badges: { hoy: 2 } }));
  }

  var OB_STEPS = function (cur) {
    var t = ['Conectar Shopify', 'Elegir productos', 'Tus números', 'Conectar Meta Ads'];
    var d = ['mitienda.myshopify.com', '3 elegidos', 'Entrega 8 de 10 · CPA $6.000', 'Puedes hacerlo después'];
    return t.map(function (x, i) { return { title: x, state: i + 1 < cur ? 'done' : i + 1 === cur ? 'current' : 'locked', desc: d[i], optional: i === 3 }; });
  };
  function ObDeskFrame(props) {
    return h(DeskFrame, { label: props.label },
      h('div', { className: 'df-ob-side' },
        h('div', { className: 'df-rail-brand' }, h('span', { className: 'df-rail-mark', 'aria-hidden': 'true' }, 'D'), 'DropFlex'),
        h('div', { className: 'df-ob-side-t' }, 'Configura tu cuenta'),
        h(StageList, { stages: OB_STEPS(props.step) }),
        h('div', { className: 'df-rail-sep' }),
        props.side || null),
      props.children);
  }
  function ObDeskProductos() {
    var rows = [
      { name: 'Corrector de postura', imageIndex: 1, meta: '$24.990 · 41 ventas en 30 días', issues: ['Sin descripción', '2 imágenes'], score: 'Alta', checked: true },
      { name: 'Lámpara lunar 3D', imageIndex: 2, meta: '$19.990 · 18 ventas', issues: ['Título de proveedor'], score: 'Alta', checked: true },
      { name: 'Botella térmica 1L', imageIndex: 0, meta: '$14.990 · 9 ventas', issues: ['Imágenes con texto chino'], score: 'Media', checked: true },
      { name: 'Masajeador de cuello', imageIndex: 4, meta: '$29.990 · 3 ventas', issues: ['Sin precio tachado'], score: 'Media', checked: false },
      { name: 'Organizador de cables', imageIndex: 3, meta: '$9.990 · 2 ventas', issues: [], score: 'Baja', checked: false }
    ];
    return h(ObDeskFrame, { label: 'Escritorio · Paso 2: pasos a la izquierda, lista al centro, resumen fijo abajo', step: 2,
      side: h('div', { className: 'df-ob-sidenote' }, h(StatusBadge, { status: 'aprobado', label: 'Shopify conectada' }), h('span', null, '128 productos importados · CLP')) },
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-ob-deskhead' },
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Elige con qué empezar'), h('div', { className: 'df-ob-desc', style: { margin: '4px 0 0' } }, 'Te recomendamos los que más venden y más pueden mejorar.')),
          h(SegmentedControl, { value: 'rec', label: 'Productos', options: [{ value: 'rec', label: 'Recomendados', count: 12 }, { value: 'all', label: 'Todos', count: 128 }] })),
        h('div', { style: { padding: '0 48px', flex: 1, overflow: 'hidden' } }, h('div', { className: 'df-group', style: { margin: 0, maxWidth: 'var(--size-content)' } }, rows.map(function (r, i) { return h(PickRow, Object.assign({ key: i }, r)); }))),
        h('div', { className: 'df-ob-deskfoot' },
          h('span', { className: 'df-ob-desc', style: { flex: 1, margin: 0 } }, '3 elegidos · tu plan incluye 10 al mes'),
          h(Button, { variant: 'ghost' }, 'Volver'),
          h(Button, { variant: 'primary', iconEnd: 'chevron-right' }, 'Mejorar 3 productos'))));
  }
  function ObDeskMeta() {
    return h(ObDeskFrame, { label: 'Escritorio · Paso 4: Meta Ads, con la generación avanzando al costado', step: 4,
      side: h('div', { className: 'df-card df-card-pad' }, h(GenerationProgress, { compact: true, items: GEN, eta: 'unos 3 min' })) },
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-ob-deskhead' }, h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Elige dónde anunciar'), h('div', { className: 'df-ob-desc', style: { margin: '4px 0 0' } }, 'Encontramos estas cuentas en tu Business Manager.'))),
        h('div', { style: { padding: '0 48px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 32, alignItems: 'start' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
            h(OptionList, { label: 'Cuenta publicitaria', name: 'dacc', value: 'a1', options: [
              { value: 'a1', title: 'Mi Tienda CL', meta: 'CLP · activa', tag: 'Sugerida' },
              { value: 'a2', title: 'Pruebas 2025', meta: 'Deshabilitada por Meta', tone: 'danger', disabled: true }] }),
            h(OptionList, { label: 'Página de Facebook', name: 'dpg', value: 'p1', options: [{ value: 'p1', title: 'Mi Tienda', meta: 'Instagram vinculado' }] }),
            h(OptionList, { label: 'Píxel', name: 'dpx', value: 'x1', options: [{ value: 'x1', title: 'Píxel Mi Tienda', meta: 'Sin compras en 7 días: revisa que esté en tu tienda', tone: 'warning' }] })),
          h(PermissionList, { title: 'Qué hará DropFlex con Meta', items: PERMS_META })),
        h('div', { className: 'df-rail-sep' }),
        h('div', { className: 'df-ob-deskfoot' },
          h('span', { style: { flex: 1 } }),
          h(Button, { variant: 'ghost' }, 'Conectar después'),
          h(Button, { variant: 'primary', icon: 'check' }, 'Guardar y terminar'))));
  }

  /* ---------- Pantallas: producto sin optimizar ---------- */
  var PP_TEXT = 'Corrector Postura Espalda Ajustable Unisex. Material: neopreno + velcro. Talla única, ajustable hasta 110 cm de pecho. Ayuda a mantener la espalda recta y reduce la tensión en hombros. Se usa debajo de la ropa. Clientes preguntan si sirve para trabajar sentado 8 horas: sí, recomendado 2 a 3 horas al día al inicio.';
  var PP_FOUND = ['Beneficios', 'Medidas', 'Materiales', 'Modo de uso'];
  var PP_STAGES = [
    { title: 'Información base', state: 'current', desc: 'Lo que sabes del producto e imágenes de referencia' },
    { title: 'Reseñas', state: 'available', optional: true, desc: 'Importa de AliExpress; la IA las usa para escribir' },
    { title: 'Textos', state: 'locked', desc: 'Se generan con la información base' },
    { title: 'Imágenes', state: 'locked', desc: 'Se generan desde tus imágenes de referencia' },
    { title: 'Precio y oferta', state: 'available', desc: 'Puedes adelantarlo' },
    { title: 'Publicar en tu tienda', state: 'locked', desc: 'Necesita textos, imágenes y precio aprobados' },
    { title: 'Anuncios', state: 'locked', optional: true, desc: 'Se habilita al publicar' }
  ];
  function ppRefs(extra) {
    var r = [
      { source: 'shopify', imageIndex: 1, shape: 1, cover: true, alt: 'Imagen 1 de Shopify' },
      { source: 'shopify', imageIndex: 5, shape: 1, alt: 'Imagen 2 de Shopify' },
      { source: 'shopify', imageIndex: 0, shape: 1, state: 'excluded', alt: 'Imagen 3 de Shopify, con texto del proveedor' }
    ];
    return r.concat(extra || []);
  }
  function RefGrid(props) {
    return h('div', { className: 'df-grid3', style: props.cols ? { gridTemplateColumns: 'repeat(' + props.cols + ', 1fr)' } : null },
      props.items.map(function (r, i) { return h(ReferenceImage, Object.assign({ key: i }, r)); }),
      props.add ? h('button', { type: 'button', className: 'df-ref-add' }, h(Icon, { name: 'plus' }), 'Agregar') : null);
  }

  function PpMain() {
    return h(Phone, { label: 'P1 · Producto sin optimizar: materia prima para la IA' },
      h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: 'Importado de Shopify · sin optimizar', actions: h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' }) }),
      h('div', { style: { padding: '0 16px 8px' } }, h(StageMeter, { stages: ['current', 'locked', 'locked', 'locked', 'locked', 'optional'] })),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 20 } },
        h('section', null,
          h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Imágenes de referencia'), h('span', { className: 'df-review-count' }, '2 de 3 en uso')),
          h(RefGrid, { items: ppRefs(), add: true, cols: 4 })),
        h(ProductInfoInput, { value: PP_TEXT, found: PP_FOUND, fromShopify: true, rows: 4, saved: 'Guardado hace 5 s' }),
        h('button', { type: 'button', className: 'df-inline-cta' }, h(Icon, { name: 'star', size: 'sm' }), h('span', null, h('b', null, 'Importa reseñas de AliExpress'), h('small', null, 'Opcional. La IA las usa para escribir beneficios reales.')), h(Icon, { name: 'chevron-right', size: 'sm' }))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', gap: 6 } },
        h(Button, { variant: 'primary', size: 'lg', block: true, icon: 'sparkle' }, 'Optimizar con IA'),
        h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Genera textos e imágenes en ~2 min. Nada se publica sin tu OK.')));
  }

  function PpSheetFile() {
    return h(Phone, { label: 'P2 · Agregar desde tu equipo (hoja inferior)' },
      h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: 'Importado de Shopify · sin optimizar' }),
        h('div', { style: { padding: '8px 16px' } }, h(RefGrid, { items: ppRefs(), add: true, cols: 4 })),
        h('div', { style: { position: 'absolute', inset: 0, background: 'var(--scrim)' } }),
        h('div', { className: 'df-sheet', style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%' } },
          h('div', { className: 'df-sheet-grab', 'aria-hidden': 'true' }),
          h('div', { className: 'df-sheet-head' }, h('strong', null, 'Agregar imágenes'), h(IconButton, { icon: 'x', label: 'Cerrar' })),
          h('div', { style: { padding: '0 16px', flex: 1, overflow: 'hidden' } },
            h(ImageUploader, { mode: 'file', compact: true, items: [
              { name: 'corrector-espalda.jpg', state: 'done', detail: '1,2 MB · lista' },
              { name: 'corrector-lateral.png', state: 'uploading', progress: 0.62 },
              { name: 'video-proveedor.mp4', state: 'error', detail: 'Solo imágenes JPG, PNG o WEBP' }] })),
          h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', icon: 'check' }, 'Listo')))));
  }

  function PpSheetUrl() {
    return h(Phone, { label: 'P3 · Agregar desde un enlace' },
      h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: 'Importado de Shopify · sin optimizar' }),
        h('div', { style: { padding: '8px 16px' } }, h(RefGrid, { items: ppRefs([{ state: 'uploading', progress: 0.4 }]), add: true, cols: 4 })),
        h('div', { style: { position: 'absolute', inset: 0, background: 'var(--scrim)' } }),
        h('div', { className: 'df-sheet', style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '56%' } },
          h('div', { className: 'df-sheet-grab', 'aria-hidden': 'true' }),
          h('div', { className: 'df-sheet-head' }, h('strong', null, 'Agregar imágenes'), h(IconButton, { icon: 'x', label: 'Cerrar' })),
          h('div', { style: { padding: '0 16px', flex: 1 } },
            h(ImageUploader, { mode: 'url', url: 'https://proveedor.com/producto/corrector', urlError: 'Ese enlace es una página, no una imagen. Abre la imagen y copia su dirección.' })))));
  }

  function PpDesk() {
    return h(DeskFrame, { label: 'Escritorio · Información a la izquierda, referencias y carga a la derecha' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('img', { className: 'df-thumb', src: productImage(1, 1), alt: '' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Importado de Shopify · sin optimizar · $24.990')),
          h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr) 360px', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12 } }, h(StageList, { stages: PP_STAGES })),
          h('div', { style: { padding: '24px 32px', overflow: 'hidden' } }, h(ProductInfoInput, { value: PP_TEXT, found: PP_FOUND, fromShopify: true, rows: 9, focused: true, saved: 'Guardado hace 5 s' })),
          h('div', { style: { padding: '24px 32px 24px 0', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' } },
            h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Imágenes de referencia'), h('span', { className: 'df-review-count' }, '3 de 4 en uso')),
            h(RefGrid, { items: ppRefs([{ source: 'upload', imageIndex: 3, shape: 1, alt: 'Subida' }]), cols: 2 }),
            h(ImageUploader, { mode: 'file', state: 'dragover' }),
            h('button', { type: 'button', className: 'df-inline-cta' }, h(Icon, { name: 'star', size: 'sm' }), h('span', null, h('b', null, 'Importa reseñas de AliExpress'), h('small', null, 'Opcional. La IA las usa para escribir.')), h(Icon, { name: 'chevron-right', size: 'sm' })))),
        h('div', { className: 'df-ob-deskfoot' },
          h('span', { className: 'df-ob-desc', style: { flex: 1, margin: 0 } }, 'Genera textos e imágenes en ~2 min. Nada se publica sin tu OK.'),
          h(Button, { variant: 'primary', icon: 'sparkle' }, 'Optimizar con IA'))));
  }

  /* ---------- Pantallas: reseñas ---------- */
  var RV = [
    { author: 'M***a', country: 'CL', date: 'ago 2026', rating: 5, variant: 'Talla única · Negro', text: 'Llegó rápido y se ajusta bien. Después de una semana ya noto menos dolor en los hombros al trabajar sentada.', photos: 2, imageIndex: 1, translated: true, original: 'Arrived fast and fits well. After one week I already feel less shoulder pain when working seated.', lang: 'inglés' },
    { author: 'J***n', country: 'MX', date: 'jul 2026', rating: 4, text: 'Buena calidad, el velcro es firme. Al principio incomoda un poco, pero te acostumbras.', photos: 0 },
    { author: 'A***o', country: 'ES', date: 'jul 2026', rating: 5, text: 'Mejor que el de la marca PostureX que tenía antes, y mucho más barato.', flags: ['Menciona otra marca'] },
    { author: 'R***s', country: 'BR', date: 'jun 2026', rating: 4, text: 'Buen producto, llegó en 20 días.', translated: true, flags: ['Habla del envío', 'Muy corta'] }
  ];
  var RV_STAGES = [
    { title: 'Información base', state: 'done', desc: 'Listo · 3 imágenes de referencia' },
    { title: 'Reseñas', state: 'current', optional: true, desc: '14 por revisar' },
    { title: 'Textos', state: 'review', desc: '8 propuestas esperan tu revisión' },
    { title: 'Imágenes', state: 'available', desc: 'Elige y ordena 4 a 6' },
    { title: 'Precio y oferta', state: 'available', desc: 'Calcula cuánto ganas' },
    { title: 'Publicar en tu tienda', state: 'locked', desc: 'Necesita textos, imágenes y precio aprobados' },
    { title: 'Anuncios', state: 'locked', optional: true, desc: 'Se habilita al publicar' }
  ];

  function RvImport() {
    return h(Phone, { label: 'R1 · Reseñas (opcional): importar desde AliExpress' },
      h(TopBar, { back: 'Corrector de postura', title: 'Reseñas', subtitle: 'Opcional · la IA también las usa para escribir' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
        h(ReviewImporter, { url: 'https://es.aliexpress.com/item/1005006….html', minStars: '4' }),
        h('div', { className: 'df-card df-card-pad', style: { display: 'flex', gap: 12 } },
          h('span', { className: 'df-att-ico k-review' }, h(Icon, { name: 'shield' })),
          h('div', null, h('div', { className: 'type-heading', style: { fontSize: 15 } }, 'Nada se publica sin tu aprobación'), h('div', { className: 'df-att-detail' }, 'Cada reseña queda pendiente hasta que la apruebes. Las publicamos con su calificación y fecha originales.')))),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  function RvList() {
    return h(Phone, { label: 'R2 · Curar: aprobar, rechazar o editar' },
      h(TopBar, { back: 'Corrector de postura', title: 'Reseñas', subtitle: '48 importadas · 14 por revisar', actions: h(IconButton, { icon: 'more', label: 'Más opciones' }) }),
      h('div', { style: { padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 } },
        h(SegmentedControl, { block: true, value: 'p', label: 'Filtrar reseñas', options: [{ value: 'p', label: 'Por revisar', count: 14 }, { value: 'a', label: 'Aprobadas', count: 30 }, { value: 'r', label: 'Rechazadas', count: 4 }] }),
        h('div', { className: 'df-rv-bulk' }, h(Icon, { name: 'sparkle', size: 'sm' }), h('span', null, '9 son de 5★ con foto y sin alertas'), h(Button, { size: 'sm', variant: 'secondary' }, 'Aprobar 9'))),
      h('div', { className: 'df-scroll', style: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(ReviewItem, RV[0]), h(ReviewItem, RV[2])),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  function RvEdit() {
    return h(Phone, { label: 'R3 · Editar sin cambiar el sentido' },
      h(TopBar, { back: 'Corrector de postura', title: 'Reseñas', subtitle: '48 importadas · 13 por revisar' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(ReviewItem, Object.assign({}, RV[0], { editing: true })),
        h(ReviewItem, Object.assign({}, RV[1], { state: 'approved', edited: false }))),
      h('div', { style: { padding: '0 16px 12px' } }, h(Toast, { message: 'Reseña aprobada', action: 'Deshacer' })),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  function RvDesk() {
    return h(DeskFrame, { label: 'Escritorio · Reseñas: ruta, curación y vista en la tienda' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Reseñas · 48 importadas de AliExpress · 14 por revisar')),
          h(Button, { variant: 'secondary', icon: 'arrow-down' }, 'Importar más')),
        h('div', { style: { display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr) 340px', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12 } }, h(StageList, { stages: RV_STAGES })),
          h('div', { style: { padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h(SegmentedControl, { value: 'p', label: 'Filtrar reseñas', options: [{ value: 'p', label: 'Por revisar', count: 14 }, { value: 'a', label: 'Aprobadas', count: 30 }, { value: 'r', label: 'Rechazadas', count: 4 }] }),
            h('div', { className: 'df-rv-bulk' }, h(Icon, { name: 'sparkle', size: 'sm' }), h('span', null, '9 son de 5★ con foto y sin alertas'), h(Button, { size: 'sm', variant: 'secondary' }, 'Aprobar 9')),
            h(ReviewItem, Object.assign({ keys: true }, RV[0])),
            h(ReviewItem, RV[2]),
            h(ReviewItem, RV[3])),
          h('div', { style: { padding: '20px 28px 20px 0', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' } },
            h('div', { className: 'df-card df-card-pad' }, h(ReviewSummary, { average: 4.6, total: 48, distribution: [1, 1, 3, 12, 31] })),
            h('div', null,
              h('div', { className: 'df-offer-frame' }, h('span', null, 'Así se verán en tu tienda'), h('span', null, '30 aprobadas')),
              h('div', { className: 'df-offer df-rv-store' },
                h('div', { className: 'df-rv-store-h' }, h('b', null, '4,7'), h(Stars, { value: 4.7 }), h('span', null, '30 reseñas')),
                h('div', { className: 'df-rv-store-src' }, 'Reseñas de compradores del mismo producto en AliExpress'),
                h('div', { className: 'df-rv-store-i' }, h(Stars, { value: 5 }), h('p', null, 'Llegó rápido y se ajusta bien. Después de una semana ya noto menos dolor en los hombros…'), h('small', null, 'M***a · Chile')),
                h('div', { className: 'df-rv-store-i' }, h(Stars, { value: 4 }), h('p', null, 'Buena calidad, el velcro es firme.'), h('small', null, 'J***n · México'))))))));
  }

  /* ---------- Pantallas: Ángulos ---------- */
  var ANG = [
    { rank: 1, name: 'Problema → solución', score: 84, suggestedRole: 'principal', fit: 'Tu cliente ideal ya siente el dolor de espalda al trabajar sentado: el gancho nombra algo que vive a diario.',
      breakdown: [{ label: 'Encaje con el cliente ideal', value: 38 }, { label: 'Fuerza de la prueba disponible', value: 22 }, { label: 'Claridad del beneficio', value: 24 }] },
    { rank: 2, name: 'Transformación (antes y después)', score: 71, suggestedRole: 'secundario', fit: 'La postura cambia de forma visible; sirve para demostrar el resultado que promete el gancho.',
      risks: [{ text: 'Sin fotos reales de clientes', penalty: 8, fix: 'Importar reseñas con fotos' }],
      breakdown: [{ label: 'Encaje con el cliente ideal', value: 30 }, { label: 'Fuerza de la prueba disponible', value: 25 }, { label: 'Claridad del beneficio', value: 24 }, { label: 'Sin fotos reales de clientes', value: -8 }] },
    { rank: 3, name: 'Mecanismo único', score: 62, fit: 'El ajuste cruzado en la espalda es un buen “cómo funciona”, pero no es exclusivo del producto.' },
    { rank: 4, name: 'Oferta y urgencia', score: 55, fit: 'El precio con descuento ayuda, aunque el pago contra entrega ya baja el riesgo percibido.', risks: [{ text: 'Urgencia sin fecha real se lee como falsa', penalty: 10 }] },
    { rank: 5, name: 'Prueba social', score: 38, fit: 'Funcionaría muy bien, pero hoy no hay reseñas reales del producto.', risks: [{ text: 'No hay reseñas reales', penalty: 35, fix: 'Importar reseñas' }] },
    { rank: 6, name: 'Autoridad (experto)', score: 21, fit: 'No se puede respaldar: no hay un kinesiólogo ni un experto real que lo recomiende.', risks: [{ text: 'No hay experto real', penalty: 45 }] }
  ];
  var ANG_STAGES = [
    { title: 'Información base', state: 'done', desc: 'Cliente ideal aprobado' },
    { title: 'Reseñas', state: 'available', optional: true, desc: 'Sube el puntaje de Prueba social' },
    { title: 'Ángulos', state: 'current', desc: 'Elige principal y secundario' },
    { title: 'Textos', state: 'locked', desc: 'Se habilita al aprobar los 2 desarrollos' },
    { title: 'Imágenes', state: 'locked', desc: 'Después de Textos' },
    { title: 'Publicar en tu tienda', state: 'locked', desc: 'Necesita textos e imágenes aprobados' },
    { title: 'Anuncios', state: 'locked', optional: true, desc: 'Usa los ángulos elegidos' }
  ];
  var SUG = { principal: 'Problema → solución', principalScore: 84, secundario: 'Transformación', secundarioScore: 71,
    combo: 'El gancho nombra el dolor de espalda al trabajar sentado; la transformación lo remata mostrando la postura antes y después en 2 semanas.',
    missing: [{ text: 'Reseñas reales: subirían Prueba social hasta ~70', action: 'Importar' }, { text: 'Fotos de clientes usando el producto' }] };
  var DEV = {
    principal: { role: 'principal', angle: 'Problema → solución', pickedHook: 0,
      hooks: ['¿Te duele la espalda después de 8 horas sentado?', 'Tu silla no es el problema: es cómo te sientas.', 'El dolor de hombros que aparece a las 4 de la tarde tiene solución.'],
      aida: { atencion: 'Nombra el dolor al final de la jornada frente al computador.', interes: 'Explica por qué la postura encorvada lo provoca y empeora con los días.', deseo: 'Muestra el corrector bajo la ropa: nadie lo nota y la espalda se mantiene recta.', accion: 'Pídelo hoy y paga al recibir; si no te ajusta, lo cambias.' },
      objections: [{ q: '¿Se nota bajo la ropa?', a: 'Es delgado y se usa bajo una polera o camisa.' }, { q: '¿Es incómodo?', a: 'Los primeros días úsalo 2 horas; el velcro permite ajustarlo.' }],
      offer: '$24.990 (antes $39.990) · Envío gratis · Paga al recibir' },
    secundario: { role: 'secundario', angle: 'Transformación', status: 'generando' }
  };

  function AnStart() {
    return h(Phone, { label: 'A1 · Punto de partida: el cliente ideal aprobado' },
      h(TopBar, { back: 'Corrector de postura', title: 'Ángulos', subtitle: 'Cómo vas a vender este producto', actions: h(IconButton, { icon: 'sparkle', label: 'Abrir asistente' }) }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
        h(IcpSummary, { text: 'Oficinistas y personas que trabajan desde casa, de 28 a 45 años, que sienten dolor de espalda o de hombros al final del día y no quieren ir al kinesiólogo.', tags: ['Trabaja sentado', 'Dolor al final del día', 'Busca algo discreto'], action: 'Ver o cambiar' }),
        h('div', { className: 'df-card df-card-pad df-an-how' },
          h('div', { className: 'type-heading', style: { fontSize: 15 } }, 'Qué hará la IA'),
          h('ol', null,
            h('li', null, 'Evalúa ', h('b', null, '6 ángulos'), ' de venta con tu cliente ideal, tus reseñas y tu información.'),
            h('li', null, 'Te los muestra todos con su puntaje, sus motivos y sus riesgos.'),
            h('li', null, 'Sugiere un ', h('b', null, 'principal'), ' (el gancho) y un ', h('b', null, 'secundario'), ' (el refuerzo). Tú decides.')),
          h('p', { className: 'df-ob-fine', style: { textAlign: 'left', margin: 0 } }, 'No inventa pruebas: si falta un experto o reseñas reales, baja el puntaje del ángulo que las necesita.'))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', gap: 6 } },
        h(Button, { variant: 'primary', size: 'lg', block: true, icon: 'sparkle' }, 'Elegir ángulos con IA'),
        h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Toma unos 30 segundos.')));
  }

  function AnRanking() {
    return h(Phone, { label: 'A2 · Ranking: los 6 ángulos, con la sugerencia marcada' },
      h(TopBar, { back: 'Corrector de postura', title: 'Ángulos', subtitle: '6 evaluados · sugerencia lista' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(AngleSuggestion, SUG),
        h('div', { className: 'df-section-t', style: { padding: '4px 0 0' } }, 'Ranking completo', h('span', { style: { fontWeight: 400 } }, 'de mayor a menor')),
        h(AngleCard, Object.assign({ role: 'principal' }, ANG[0])),
        h(AngleCard, Object.assign({ role: 'secundario' }, ANG[1])),
        h(AngleCard, ANG[4])),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', gap: 6 } },
        h(Button, { variant: 'primary', size: 'lg', block: true, iconEnd: 'chevron-right' }, 'Confirmar y desarrollar'),
        h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Se generan los 2 desarrollos en paralelo.')));
  }

  function AnSwap() {
    return h(Phone, { label: 'A3 · Cambiar el secundario por otro del ranking' },
      h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h(TopBar, { back: 'Corrector de postura', title: 'Ángulos', subtitle: '6 evaluados · sugerencia lista' }),
        h('div', { style: { padding: '8px 16px' } }, h(AngleSuggestion, { principal: SUG.principal, principalScore: 84, secundario: SUG.secundario, secundarioScore: 71 })),
        h('div', { style: { position: 'absolute', inset: 0, background: 'var(--scrim)' } }),
        h('div', { className: 'df-sheet', style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%' } },
          h('div', { className: 'df-sheet-grab', 'aria-hidden': 'true' }),
          h('div', { className: 'df-sheet-head' }, h('strong', null, 'Ángulo secundario'), h(IconButton, { icon: 'x', label: 'Cerrar' })),
          h('div', { style: { padding: '0 16px', flex: 1, overflow: 'hidden' } },
            h(OptionList, { label: 'Refuerza el argumento del principal', name: 'sec', value: 'm', options: [
              { value: 't', title: 'Transformación', meta: '71/100 · sugerido por la IA', tag: 'Sugerido' },
              { value: 'm', title: 'Mecanismo único', meta: '62/100' },
              { value: 'o', title: 'Oferta y urgencia', meta: '55/100 · riesgo: urgencia sin fecha real', tone: 'warning' },
              { value: 's', title: 'Prueba social', meta: '38/100 · no hay reseñas reales', tone: 'warning' },
              { value: 'a', title: 'Autoridad (experto)', meta: '21/100 · no hay experto real', tone: 'danger' },
              { value: 'p', title: 'Problema → solución', meta: 'Ya es el principal', disabled: true }] })),
          h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', icon: 'check' }, 'Usar Mecanismo único')))));
  }

  function AnDev() {
    return h(Phone, { label: 'A4 · Revisar y aprobar los 2 desarrollos' },
      h(TopBar, { back: 'Corrector de postura', title: 'Ángulos', subtitle: '0 de 2 desarrollos aprobados' }),
      h('div', { style: { padding: '0 16px 8px' } }, h(SegmentedControl, { block: true, value: 'p', label: 'Desarrollo', options: [{ value: 'p', label: '1 · Problema → solución' }, { value: 's', label: '2 · Transformación' }] })),
      h('div', { className: 'df-scroll', style: { padding: '0 16px' } }, h(AngleDevelopment, Object.assign({ hideActions: true }, DEV.principal))),
      h('div', { className: 'df-sticky', style: { display: 'block' } },
        h('div', { className: 'df-review-actions' }, h(Button, { variant: 'secondary', icon: 'sparkle' }, 'Regenerar'), h(Button, { variant: 'secondary', icon: 'edit' }, 'Editar'), h(Button, { variant: 'primary', icon: 'check' }, 'Aprobar'))));
  }

  function AnDeskRanking() {
    return h(DeskFrame, { label: 'Escritorio · Ranking: ruta, los 6 ángulos y la elección fija a la derecha' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Ángulos · 6 evaluados · sugerencia lista')),
          h(Button, { variant: 'ghost', icon: 'sparkle' }, 'Volver a evaluar')),
        h('div', { style: { display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr) 360px', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12 } }, h(StageList, { stages: ANG_STAGES })),
          h('div', { style: { padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start', overflow: 'hidden' } },
            h(AngleCard, Object.assign({ role: 'principal', expanded: true }, ANG[0])),
            h(AngleCard, Object.assign({ role: 'secundario' }, ANG[1])),
            h(AngleCard, ANG[2]), h(AngleCard, ANG[3]), h(AngleCard, ANG[4]), h(AngleCard, ANG[5])),
          h('div', { style: { padding: '20px 28px 20px 0', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h(AngleSuggestion, SUG),
            h(Button, { variant: 'primary', block: true, iconEnd: 'chevron-right' }, 'Confirmar y desarrollar'),
            h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Se generan los 2 desarrollos en paralelo.')))));
  }

  function AnDeskDev() {
    return h(DeskFrame, { label: 'Escritorio · Los 2 desarrollos lado a lado; se generan en paralelo' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Ángulos · 0 de 2 desarrollos aprobados')),
          h(Button, { variant: 'ghost' }, 'Cambiar ángulos')),
        h('div', { style: { padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', overflow: 'hidden', flex: 1 } },
          h(AngleDevelopment, DEV.principal),
          h(AngleDevelopment, DEV.secundario)),
        h('div', { className: 'df-ob-deskfoot' },
          h('span', { className: 'df-ob-desc', style: { flex: 1, margin: 0 } }, 'Aprueba los 2 desarrollos para habilitar Textos.'),
          h(Button, { variant: 'primary', iconEnd: 'chevron-right', disabled: true }, 'Continuar: Textos'))));
  }

  /* ---------- Pantallas: lanzar campaña y motor de decisión ---------- */
  var AD_PRESETS = [
    { value: 'abo-test', label: 'Testeo ABO · 1 creativo por conjunto (base)' },
    { value: 'abo-int', label: 'Testeo ABO · con intereses' },
    { value: 'cbo-scale', label: 'Escalado CBO · ganadores' },
    { value: 'mine', label: 'Mi plantilla · Chile 23+' }
  ];
  var AD_TREE = { name: 'Corrector de postura · Testeo', structure: 'abo', adsets: [
    { name: 'Conjunto 1 · Video UGC', audience: 'Chile · 23+ · abierto', budget: '$10.000', ads: [{ name: 'Video UGC', type: 'video' }] },
    { name: 'Conjunto 2 · Antes y después', audience: 'Chile · 23+ · abierto', budget: '$10.000', ads: [{ name: 'Antes y después', type: 'image' }] },
    { name: 'Conjunto 3 · Problema', audience: 'Chile · 23+ · abierto', budget: '$10.000', ads: [{ name: 'Problema', type: 'image' }] }] };
  function RulesEsperar() {
    return h(RuleGroup, { kind: 'esperar' },
      h(RuleRow, { parts: ['No decidir antes de gastar ', { value: '1×', select: true }, ' tu CPA límite (', { value: '$6.000' }, ') o de ', { value: '48 h', select: true }] }),
      h(RuleRow, { parts: ['Tras editar un conjunto, esperar ', { value: '24 h', select: true }] }));
  }
  function RulesPausar(p) {
    return h(RuleGroup, { kind: 'pausar', level: p && p.cbo ? 'Por anuncio' : 'Por conjunto' },
      h(RuleRow, { parts: ['Si gasta ', { value: '1,5×', select: true }, ' el CPA límite ', { value: 'sin ventas', select: true }] }),
      h(RuleRow, { parts: ['Si el ', { value: 'CPA', select: true }, ' supera ', { value: '1,3×', select: true }, ' el límite por ', { value: '2 días', select: true }] }),
      h(RuleRow, { off: true, parts: ['Si el ', { value: 'CTR', select: true }, ' es menor a ', { value: '0,8 %' }, ' tras ', { value: '1.000' }, ' impresiones'] }));
  }
  function RulesEscalar(p) {
    return h(RuleGroup, { kind: 'escalar', level: p && p.cbo ? 'Campaña' : 'Por conjunto' },
      h(RuleRow, { parts: ['Si el CPA es ', { value: '≤ 0,8×', select: true }, ' el límite por ', { value: '3 días', select: true }, ', subir ', { value: '+20 %', select: true }, ' cada ', { value: '48 h', select: true }] }),
      h(RuleRow, { parts: ['Nunca pasar de ', { value: '$60.000' }, ' diarios'] }));
  }

  function AdLaunch() {
    return h(Phone, { label: 'L1 · Lanzar: estructura, plantilla y secciones' },
      h(TopBar, { back: 'Corrector de postura', title: 'Lanzar campaña', subtitle: 'Anuncios · todo es editable' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
        h(StructurePicker, { value: 'abo' }),
        h(PresetSelect, { value: 'abo-test', options: AD_PRESETS, source: 'Carga público, presupuesto, horario y reglas. Cámbiala cuando quieras.', modified: 2 }),
        h('div', { className: 'df-cfgs' },
          h(ConfigSection, { index: 1, title: 'Creativos', summary: '3 listos → 3 conjuntos', done: true }),
          h(ConfigSection, { index: 2, title: 'Público', summary: 'Chile · 23+ · abierto (Advantage+)', edited: true }),
          h(ConfigSection, { index: 3, title: 'Presupuesto y horario', summary: '$10.000 por conjunto · empieza mañana 8:00', edited: true }),
          h(ConfigSection, { index: 4, title: 'Textos del anuncio', summary: 'Del ángulo Problema → solución · Comprar' }),
          h(ConfigSection, { index: 5, title: 'Motor de decisión', summary: 'Esperar, pausar y escalar · solo recomendar' }))),
      h('div', { className: 'df-sticky', style: { flexDirection: 'column', gap: 6 } },
        h(Button, { variant: 'primary', size: 'lg', block: true, iconEnd: 'chevron-right' }, 'Revisar y lanzar'),
        h('p', { className: 'df-ob-fine', style: { margin: 0 } }, 'Se crea en pausa. Tú la activas.')));
  }

  function AdCreatives() {
    return h(Phone, { label: 'L2 · Creativos y público (secciones abiertas)' },
      h(TopBar, { back: 'Corrector de postura', title: 'Lanzar campaña', subtitle: 'ABO · Testeo base (editada)' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(ConfigSection, { index: 1, title: 'Creativos', open: true },
          h('p', { className: 'df-field-hint', style: { margin: 0 } }, 'En ABO cada creativo crea su propio conjunto.'),
          h(CreativeSlot, { name: 'ugc-espalda.mp4', type: 'video', ratio: '9:16', duration: '0:18', imageIndex: 1, adset: 'Conjunto 1' }),
          h(CreativeSlot, { name: 'antes-despues.jpg', type: 'image', ratio: '1:1', imageIndex: 3, adset: 'Conjunto 2' }),
          h(CreativeSlot, { name: 'problema-v2.mp4', state: 'uploading', progress: 0.45 }),
          h(ImageUploader, { mode: 'file', compact: true, hideModes: true, pickLabel: 'Sube imágenes o videos', formats: 'Imagen JPG o PNG · video MP4 o MOV · 1:1, 4:5 o 9:16' })),
        h(ConfigSection, { index: 2, title: 'Público', open: true, edited: true },
          h(ChipInput, { label: 'Países', values: ['Chile'] }),
          h(SegmentedControl, { block: true, value: 'open', label: 'Tipo de público', options: [{ value: 'open', label: 'Abierto (Advantage+)' }, { value: 'int', label: 'Intereses' }] }),
          h(ChipInput, { label: 'Intereses', disabled: true, hint: 'Solo con público de intereses.' }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } }, h(Field, { label: 'Edad mínima', value: '23', suffix: 'años', id: 'ad-age' }), h(Field, { label: 'Ubicación', value: 'Vive o estuvo', id: 'ad-loc' })))));
  }

  function AdRules() {
    return h(Phone, { label: 'L3 · Motor de decisión: esperar, pausar, escalar' },
      h(TopBar, { back: 'Lanzar campaña', title: 'Motor de decisión', subtitle: 'Plantilla: Testeo ABO (base)' }),
      h('div', { style: { padding: '0 16px 8px' } }, h(SegmentedControl, { block: true, value: 'rec', label: 'Cómo actúa', options: [{ value: 'rec', label: 'Solo recomendar' }, { value: 'auto', label: 'Automático' }] })),
      h('div', { className: 'df-scroll', style: { padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(RulesEsperar), h(RulesPausar), h(RulesEscalar)),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'primary', size: 'lg', icon: 'check' }, 'Guardar reglas')));
  }

  function AdMonitor() {
    return h(Phone, { label: 'L4 · Campaña en curso: qué decidió el motor' },
      h(TopBar, { back: 'Campañas', title: 'Corrector · Testeo', subtitle: 'ABO · 3 conjuntos · día 3 · solo recomendar' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(DecisionRow, { decision: 'escalar', name: 'Conjunto 1 · Video UGC', imageIndex: 1, metrics: 'Gasto $28.400 · 7 ventas · CPA $4.057', reason: 'CPA 32% bajo tu límite por 3 días.', rule: 'Escalar si CPA ≤ 0,8× por 3 días', actions: [h(Button, { key: 1, variant: 'secondary', size: 'sm' }, 'Ignorar'), h(Button, { key: 2, variant: 'primary', size: 'sm', icon: 'arrow-up' }, 'Subir a $12.000')] }),
        h(DecisionRow, { decision: 'pausar', name: 'Conjunto 3 · Problema', imageIndex: 0, metrics: 'Gasto $9.300 · 0 ventas', reason: 'Gastó 1,5× tu CPA límite sin ventas.', rule: 'Pausar si gasta 1,5× sin ventas', actions: [h(Button, { key: 1, variant: 'secondary', size: 'sm' }, 'Mantener'), h(Button, { key: 2, variant: 'destructive', size: 'sm', icon: 'pause' }, 'Pausar conjunto')] }),
        h(DecisionRow, { decision: 'esperar', name: 'Conjunto 2 · Antes y después', imageIndex: 3, metrics: 'Gasto $3.700 · 1 venta', progress: 0.62, reason: 'Falta gastar $2.300 para decidir (62% de 1× CPA).' })),
      h(Navigation, { active: 'campanas', badges: { hoy: 6 } }));
  }

  function AdDeskLaunch() {
    return h(DeskFrame, { label: 'Escritorio · Configuración a la izquierda, estructura en vivo a la derecha' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Corrector de postura' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Lanzar campaña'), h('div', { className: 'df-topbar-s' }, 'Corrector de postura · Anuncios'))),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1, minHeight: 0 } },
          h('div', { style: { padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' } },
              h(StructurePicker, { value: 'abo' }),
              h(PresetSelect, { value: 'abo-test', options: AD_PRESETS, source: 'Carga público, presupuesto, horario y reglas.', modified: 2 })),
            h(ConfigSection, { index: 1, title: 'Creativos', summary: '3 listos → 3 conjuntos', done: true }),
            h(ConfigSection, { index: 2, title: 'Público', summary: 'Chile · 23+ · abierto (Advantage+)', edited: true }),
            h(ConfigSection, { index: 3, title: 'Presupuesto y horario', open: true, edited: true },
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } },
                h(Field, { label: 'Presupuesto por conjunto', prefix: '$', value: '10.000', suffix: '/día', id: 'dk-b', hint: 'ABO: se fija en cada conjunto' }),
                h(Field, { label: 'Puja', value: 'Menor costo', id: 'dk-bid', hint: 'Sin tope de costo' }),
                h(Field, { label: 'Empieza', value: 'Mañana 8:00', id: 'dk-t', hint: 'Hora de Chile' })),
              h('p', { className: 'df-field-hint', style: { margin: 0 } }, 'Total diario: $30.000 (3 conjuntos × $10.000).')),
            h(ConfigSection, { index: 4, title: 'Textos del anuncio', summary: 'Del ángulo Problema → solución · 3 textos · 2 títulos · Comprar' }),
            h(ConfigSection, { index: 5, title: 'Motor de decisión', summary: '2 reglas de espera · 2 de pausa · 2 de escalado · solo recomendar' })),
          h('div', { style: { borderLeft: '1px solid var(--border)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', background: 'var(--sidebar)' } },
            h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Se creará en Meta'), h(StatusBadge, { status: 'rechazado', label: 'En pausa', size: 'sm' })),
            h(CampaignTree, Object.assign({ note: 'Presupuesto en cada conjunto. Un anuncio por conjunto.' }, AD_TREE)))),
        h('div', { className: 'df-ob-deskfoot' },
          h('span', { className: 'df-ob-desc', style: { flex: 1, margin: 0 } }, 'Se crea en pausa: campaña → medios → creativos → conjuntos y anuncios. Tú la activas.'),
          h(Button, { variant: 'ghost' }, 'Guardar borrador'),
          h(Button, { variant: 'primary', iconEnd: 'chevron-right' }, 'Revisar y lanzar'))));
  }

  function AdDeskEngine() {
    return h(DeskFrame, { label: 'Escritorio · Motor en marcha: decisiones por conjunto y reglas al lado' },
      h(Navigation, { variant: 'rail', active: 'campanas', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Campañas' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector · Testeo'), h('div', { className: 'df-topbar-s' }, 'ABO · 3 conjuntos · día 3 · gasto $41.400 · 8 ventas')),
          h(SegmentedControl, { value: 'rec', label: 'Cómo actúa', options: [{ value: 'rec', label: 'Solo recomendar' }, { value: 'auto', label: 'Automático' }] })),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', flex: 1, minHeight: 0 } },
          h('div', { style: { padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h('div', { className: 'df-section-t', style: { padding: 0 } }, 'Decisiones de hoy'),
            h(DecisionRow, { decision: 'escalar', name: 'Conjunto 1 · Video UGC', imageIndex: 1, metrics: 'Gasto $28.400 · 7 ventas · CPA $4.057', reason: 'CPA 32% bajo tu límite por 3 días.', rule: 'Escalar si CPA ≤ 0,8× por 3 días', actions: [h(Button, { key: 1, variant: 'secondary', size: 'sm' }, 'Ignorar'), h(Button, { key: 2, variant: 'primary', size: 'sm', icon: 'arrow-up' }, 'Subir a $12.000')] }),
            h(DecisionRow, { decision: 'pausar', name: 'Conjunto 3 · Problema', imageIndex: 0, metrics: 'Gasto $9.300 · 0 ventas', reason: 'Gastó 1,5× tu CPA límite sin ventas.', rule: 'Pausar si gasta 1,5× sin ventas', actions: [h(Button, { key: 1, variant: 'secondary', size: 'sm' }, 'Mantener'), h(Button, { key: 2, variant: 'destructive', size: 'sm', icon: 'pause' }, 'Pausar conjunto')] }),
            h(DecisionRow, { decision: 'esperar', name: 'Conjunto 2 · Antes y después', imageIndex: 3, metrics: 'Gasto $3.700 · 1 venta', progress: 0.62, reason: 'Falta gastar $2.300 para decidir (62% de 1× CPA).' })),
          h('div', { style: { borderLeft: '1px solid var(--border)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Reglas activas'), h('button', { type: 'button', className: 'df-rev-link' }, 'Editar')),
            h(RulesEsperar), h(RulesPausar)))));
  }

  /* ---------- Pantallas: Textos ---------- */
  var TX_STAGES = function (textos) {
    return [
      { title: 'Información base', state: 'done', desc: 'Ficha, cliente ideal y precio' },
      { title: 'Reseñas', state: 'done', optional: true, desc: '30 aprobadas' },
      { title: 'Ángulos', state: 'done', desc: 'Problema → solución + Transformación' },
      textos,
      { title: 'Imágenes', state: 'locked', desc: 'Después de Textos' },
      { title: 'Publicar en tu tienda', state: 'locked', desc: 'Necesita textos e imágenes aprobados' },
      { title: 'Anuncios', state: 'locked', optional: true, desc: 'Se habilita al publicar' }];
  };
  var TX_OUTLINE = [
    { title: 'Arriba del precio', items: [{ label: 'Título del producto', state: 'accepted', required: true }, { label: 'Nombre corto', state: 'edited', required: true }, { label: 'Descripción corta', state: 'accepted', required: true }, { label: 'Frase de la oferta', state: 'accepted', required: true }] },
    { title: 'Por qué comprarlo', items: [{ label: 'Beneficio 1', state: 'accepted' }, { label: 'Beneficio 2', state: 'discarded' }, { label: 'Beneficio 3', state: 'accepted' }, { label: 'Cómo funciona', state: 'accepted', required: true }] },
    { title: 'Dudas', items: [{ label: 'Pregunta 1', state: 'current' }, { label: 'Pregunta 2', state: 'pending' }, { label: 'Pregunta 3', state: 'pending' }, { label: 'Envío y pago', state: 'pending', required: true }, { label: 'Garantía', state: 'omitted' }] },
    { title: 'Google', items: [{ label: 'Título para Google', state: 'pending', required: true }, { label: 'Descripción para Google', state: 'pending', required: true }] }
  ];
  var TX_FAQ = { field: 'Pregunta frecuente 1', section: 'Dudas', index: 9, total: 14, angle: 'secondary', faq: { q: '¿Tengo que pagar antes de recibirlo?', a: 'No. Pagas en efectivo o con tarjeta cuando el repartidor te entrega el pedido. Si no te lo entregan, no pagas nada.' }, limit: 280, count: 118, note: 'Responde la objeción más común del pago contra entrega.', discardHint: 'esta pregunta no va en la página.' };

  function TxStates() {
    return h(Phone, { label: 'T1 · Bloqueada → empezar → escribiendo' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: 'La página del producto en tu tienda' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(EmptyState, { icon: 'lock', title: 'Aprueba los 2 desarrollos de Ángulos', body: 'Los textos de la página salen del ángulo principal y del secundario.', action: h(Button, { size: 'sm', variant: 'secondary', iconEnd: 'chevron-right' }, 'Ir a Ángulos') }),
        h(EmptyState, { icon: 'text', title: 'Escribe la página de tu producto', body: 'Título, descripción, beneficios, cómo funciona, preguntas, envío y pago, y lo que ve Google. Cada texto lo apruebas tú.', action: h(Button, { variant: 'primary', icon: 'sparkle' }, 'Escribir textos con IA') }),
        h(EmptyState, { icon: 'sparkle', busy: true, title: 'La IA está escribiendo los textos', body: 'Suele tardar menos de un minuto. Puedes salir: te avisamos en Hoy.' },
          h('div', { className: 'df-empty-skel' }, [80, 64, 72].map(function (w, i) { return h('span', { key: i, className: 'df-skel', style: { width: w + '%' } }); })))));
  }

  function TxReview() {
    return h(Phone, { label: 'T2 · Revisar: un bloque a la vez, con límite y ángulo' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: '0 de 14 aceptados' }),
      h('div', { style: { padding: '0 16px 8px' } }, h(StageMeter, { stages: ['current', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'] })),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px' } },
        h(ReviewCard, { field: 'Título del producto', section: 'Arriba del precio', required: true, index: 1, total: 14, angle: 'primary', original: 'Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única', originalLabel: 'Hoy en Shopify', proposal: 'Corrector de postura ajustable para trabajar sentado sin dolor de espalda', limit: 70, count: 70, note: 'Nombra qué es y el dolor que resuelve, como en el ángulo principal.', discardHint: 'se mantiene el título actual de Shopify.', hideActions: true })),
      h('div', { className: 'df-sticky', style: { display: 'block' } },
        h('div', { className: 'df-review-actions' }, h(Button, { variant: 'secondary', icon: 'x' }, 'Descartar'), h(Button, { variant: 'secondary', icon: 'edit' }, 'Editar'), h(Button, { variant: 'primary', icon: 'check' }, 'Aceptar'))));
  }

  function TxEdit() {
    return h(Phone, { label: 'T3 · Editar: el contador avisa antes de pasarse' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: '11 de 14 aceptados' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Notice, { tone: 'info', icon: 'clock', title: 'Completa el plazo de entrega y tu WhatsApp', body: 'La IA no los tiene: escríbelos al editar este bloque.' }),
        h(ReviewCard, { field: 'Envío y pago', section: 'Dudas', required: true, index: 12, total: 14, state: 'editing', rows: 5, proposalText: 'Paga al recibir: en efectivo o con tarjeta cuando te entregan el pedido. Envío a todo Chile en 2 a 4 días hábiles. ¿Dudas? Escríbenos por WhatsApp al +56 9 1234 5678 y te respondemos el mismo día hábil, de lunes a sábado.', limit: 280, count: 288 })));
  }

  function TxFaqFail() {
    return h(Phone, { label: 'T4 · Pregunta frecuente · y si falla la generación' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: '8 de 14 aceptados' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
        h(ReviewCard, TX_FAQ),
        h(EmptyState, { tone: 'error', icon: 'alert', title: 'No se pudieron escribir los textos', body: 'La IA escribió textos que no cumplen las reglas. Toca Reintentar.', action: h(Button, { variant: 'primary', icon: 'sparkle' }, 'Reintentar') })));
  }

  function TxDone() {
    return h(Phone, { label: 'T5 · Listo: lo aprobado por sección' },
      h(TopBar, { back: 'Corrector de postura', title: 'Textos', subtitle: '13 de 14 aceptados · 1 obligatorio pendiente' }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(Notice, { tone: 'warning', title: 'Falta aprobar Envío y pago', body: 'Es obligatorio: escribe tu versión para completar la etapa.', action: h(Button, { size: 'sm', variant: 'secondary' }, 'Escribir') }),
        h(CopySummary, { sections: [
          { title: 'Arriba del precio', items: [{ label: 'Título', text: 'Corrector de postura ajustable para trabajar sentado sin dolor de espalda' }, { label: 'Nombre corto', tag: 'edited', text: 'Corrector de postura' }, { label: 'Frase de la oferta', text: '2 por $39.990 · Paga al recibir' }] },
          { title: 'Por qué comprarlo', items: [{ label: 'Beneficio 1', text: 'Tela transpirable que puedes usar bajo la ropa todo el día' }, { label: 'Beneficio 2', tag: 'omitted' }] },
          { title: 'Dudas', items: [{ label: 'Envío y pago', tag: 'missing' }, { label: 'Garantía', tag: 'omitted', text: 'Tu ficha no tiene días de garantía.' }] }] })),
      h('div', { className: 'df-sticky' }, h(Button, { variant: 'secondary', icon: 'sparkle' }, 'Rehacer'), h(Button, { variant: 'primary', iconEnd: 'chevron-right', disabled: true }, 'Imágenes')));
  }

  function TxDeskReview() {
    return h(DeskFrame, { label: 'Escritorio · Ruta, bloque en revisión y la página completa como índice' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Textos · 8 de 14 aceptados')),
          h(Button, { variant: 'ghost', icon: 'sparkle' }, 'Rehacer descartados')),
        h('div', { style: { display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr) 280px', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12 } }, h(StageList, { stages: TX_STAGES({ title: 'Textos', state: 'current', desc: '8 de 14 aceptados' }) })),
          h('div', { style: { padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h(Notice, { tone: 'warning', title: 'Cambiaste tus ángulos.', body: ' Reescribe los textos que no aprobaste.', action: h(Button, { size: 'sm', variant: 'secondary', icon: 'sparkle' }, 'Reescribir') }),
            h(ReviewCard, Object.assign({ keys: true }, TX_FAQ))),
          h('div', { style: { borderLeft: '1px solid var(--border)', padding: '20px 16px', overflow: 'hidden', background: 'var(--sidebar)' } },
            h('div', { className: 'df-pp-sect', style: { padding: '0 8px' } }, h('span', { className: 'type-heading' }, 'La página'), h('span', { className: 'df-review-count' }, '8/14')),
            h(PageOutline, { groups: TX_OUTLINE })))));
  }

  /* ---------- Pantallas: costo de IA ---------- */
  var AI = { total: 387, totalUsd: 0.41, generations: 9, cap: 1500,
    stages: [
      { label: 'Información base', cost: 96, runs: 2 },
      { label: 'Reseñas', cost: 31, runs: 1 },
      { label: 'Ángulos', cost: 142, runs: 3 },
      { label: 'Textos', cost: 118, runs: 3, retries: 1 },
      { label: 'Imágenes', cost: 0, note: 'Se genera después de Textos' }],
    context: 'Equivale al 4,5% de lo que ganas en una venta ($8.590).' };
  var AI_ADMIN_STAGES = AI.stages.map(function (s, i) { return Object.assign({}, s, { tokens: ['18,2k tok', '6,1k tok', '27,4k tok', '22,9k tok', ''][i] }); });
  var AI_RUNS = [
    { kind: 'retry', what: 'Textos (no cumplía las reglas)', stage: 'Textos', when: 'hoy 10:42', cost: 38, model: 'sonnet', tokens: '7,3k tok' },
    { kind: 'fail', what: 'Textos', stage: 'Textos', when: 'hoy 10:41', cost: 41, model: 'sonnet', tokens: '7,9k tok' },
    { kind: 'gen', what: 'Desarrollo · Transformación', stage: 'Ángulos', when: 'ayer 18:05', cost: 44, model: 'sonnet', tokens: '8,4k tok' },
    { kind: 'gen', what: 'Desarrollo · Problema → solución', stage: 'Ángulos', when: 'ayer 18:05', cost: 47, model: 'sonnet', tokens: '9,0k tok' },
    { kind: 'gen', what: 'Ranking de 6 ángulos', stage: 'Ángulos', when: 'ayer 18:02', cost: 51, model: 'sonnet', tokens: '10,0k tok' },
    { kind: 'regen', what: 'Cliente ideal', stage: 'Información base', when: 'ayer 17:40', cost: 49, model: 'sonnet', tokens: '9,3k tok' }
  ];

  function AiProduct() {
    return h(Phone, { label: 'C1 · Indicador en la barra y tarjeta en la ruta' },
      h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: '4 de 7 etapas', actions: [h(AiCostChip, { key: 1, total: AI.total, cap: AI.cap }), h(IconButton, { key: 2, icon: 'sparkle', label: 'Abrir asistente' })] }),
      h('div', { className: 'df-scroll', style: { overflow: 'hidden' } },
        h(StageList, { stages: TX_STAGES({ title: 'Textos', state: 'current', desc: '8 de 14 aceptados' }).slice(0, 4) }),
        h('div', { style: { padding: '8px 16px' } }, h(AiCostCard, Object.assign({ compact: true, action: h('button', { type: 'button', className: 'df-rev-link' }, 'Ver detalle') }, AI)))),
      h(Navigation, { active: 'productos', badges: { hoy: 6 } }));
  }

  function AiSheet() {
    return h(Phone, { label: 'C2 · Detalle: por etapa, contexto e historial' },
      h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: '4 de 7 etapas' }),
        h('div', { style: { position: 'absolute', inset: 0, background: 'var(--scrim)' } }),
        h('div', { className: 'df-sheet', style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '88%' } },
          h('div', { className: 'df-sheet-grab', 'aria-hidden': 'true' }),
          h('div', { className: 'df-sheet-head' }, h('strong', null, 'Costo de IA'), h(IconButton, { icon: 'x', label: 'Cerrar' })),
          h('div', { style: { padding: '0 16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 } },
            h(AiCostCard, AI),
            h('div', { className: 'df-section-t', style: { padding: '4px 0 0' } }, 'Historial', h('span', { style: { fontWeight: 400 } }, '9 generaciones')),
            h(AiRunList, { runs: AI_RUNS.slice(0, 4) })))));
  }

  function AiWarn() {
    return h(Phone, { label: 'C3 · Cerca del tope: regenerar avisa antes' },
      h(TopBar, { back: 'Productos', title: 'Corrector de postura', subtitle: 'Textos · 8 de 14 aceptados', actions: h(AiCostChip, { total: 1290, cap: 1500 }) }),
      h('div', { className: 'df-scroll', style: { padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
        h(AiCostCard, Object.assign({}, AI, { total: 1290, totalUsd: 1.37, generations: 21, compact: true })),
        h('div', { className: 'df-card df-card-pad', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('div', { className: 'type-heading', style: { fontSize: 15 } }, '¿Rehacer los descartados?'),
          h('p', { className: 'df-att-detail', style: { margin: 0 } }, 'Cuesta cerca de ', h('b', { style: { color: 'var(--foreground)' } }, '$120'), '. Quedarías en $1.410 de $1.500.'),
          h('div', { className: 'df-camp-actions' }, h(Button, { variant: 'secondary', size: 'sm' }, 'Cancelar'), h(Button, { variant: 'primary', size: 'sm', icon: 'sparkle' }, 'Rehacer por ~$120'))),
        h(AiCostChip, { total: 1620, cap: 1500 }),
        h('p', { className: 'df-ob-fine', style: { textAlign: 'left', margin: 0 } }, 'Sobre el tope, el indicador pasa a rojo y cada generación pide confirmación. Nunca se bloquea el trabajo ya hecho.')));
  }

  function AiDesk() {
    return h(DeskFrame, { label: 'Escritorio · Tarjeta bajo la ruta; vista de administrador con tokens y modelo' },
      h(Navigation, { variant: 'rail', active: 'productos', badges: { hoy: 6 } }),
      h('div', { className: 'df-desk-main' },
        h('div', { className: 'df-desk-head' },
          h(IconButton, { icon: 'chevron-left', label: 'Productos' }),
          h('div', { style: { flex: 1 } }, h('div', { className: 'type-display' }, 'Corrector de postura'), h('div', { className: 'df-topbar-s' }, 'Textos · 8 de 14 aceptados')),
          h(AiCostChip, { total: AI.total, cap: AI.cap })),
        h('div', { style: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) minmax(0, 1fr)', flex: 1, minHeight: 0 } },
          h('div', { style: { borderRight: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h(StageList, { stages: TX_STAGES({ title: 'Textos', state: 'current', desc: '8 de 14 aceptados' }).slice(0, 5) }),
            h('div', { style: { padding: '0 16px' } }, h(AiCostCard, Object.assign({ compact: true, action: h('button', { type: 'button', className: 'df-rev-link' }, 'Ver detalle') }, AI)))),
          h('div', { style: { padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Vista del comerciante'), null),
            h(AiCostCard, AI)),
          h('div', { style: { padding: '20px 28px 20px 0', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' } },
            h('div', { className: 'df-pp-sect' }, h('span', { className: 'type-heading' }, 'Vista de administrador'), h('span', { className: 'df-rev-tag' }, 'Solo equipo')),
            h(AiCostCard, Object.assign({}, AI, { audience: 'admin', stages: AI_ADMIN_STAGES, context: null })),
            h(AiRunList, { audience: 'admin', runs: AI_RUNS.slice(0, 3) })))));
  }

  var Screens = {
    Movil1: function () { return h('div', { className: 'df-screens' }, h(ScreenHoy), h(ScreenProductos), h(ScreenProducto)); },
    Movil2: function () { return h('div', { className: 'df-screens' }, h(ScreenRevision), h(ScreenImagenes), h(ScreenPrecio)); },
    Movil3: function () { return h('div', { className: 'df-screens' }, h(ScreenCampanas), h(ScreenAsistente)); },
    Escritorio1: function () { return h('div', { className: 'df-screens' }, h(ScreenDeskProducto)); },
    Escritorio2: function () { return h('div', { className: 'df-screens' }, h(ScreenDeskCampanas)); },
    Onboarding1: function () { return h('div', { className: 'df-screens' }, h(ObBienvenida), h(ObShopify), h(ObShopifyOk)); },
    Onboarding2: function () { return h('div', { className: 'df-screens' }, h(ObProductos), h(ObNumeros), h(ObMeta)); },
    Onboarding3: function () { return h('div', { className: 'df-screens' }, h(ObMetaCuentas), h(ObListo), h(ObHoy)); },
    OnboardingEscritorio1: function () { return h('div', { className: 'df-screens' }, h(ObDeskProductos)); },
    OnboardingEscritorio2: function () { return h('div', { className: 'df-screens' }, h(ObDeskMeta)); },
    ProductoNuevo1: function () { return h('div', { className: 'df-screens' }, h(PpMain), h(PpSheetFile), h(PpSheetUrl)); },
    ProductoNuevoEscritorio: function () { return h('div', { className: 'df-screens' }, h(PpDesk)); },
    Resenas1: function () { return h('div', { className: 'df-screens' }, h(RvImport), h(RvList), h(RvEdit)); },
    ResenasEscritorio: function () { return h('div', { className: 'df-screens' }, h(RvDesk)); },
    Angulos1: function () { return h('div', { className: 'df-screens' }, h(AnStart), h(AnRanking), h(AnSwap)); },
    Angulos2: function () { return h('div', { className: 'df-screens' }, h(AnDev)); },
    AngulosEscritorio1: function () { return h('div', { className: 'df-screens' }, h(AnDeskRanking)); },
    AngulosEscritorio2: function () { return h('div', { className: 'df-screens' }, h(AnDeskDev)); },
    Anuncios1: function () { return h('div', { className: 'df-screens' }, h(AdLaunch), h(AdCreatives), h(AdRules)); },
    Anuncios2: function () { return h('div', { className: 'df-screens' }, h(AdMonitor)); },
    AnunciosEscritorio1: function () { return h('div', { className: 'df-screens' }, h(AdDeskLaunch)); },
    AnunciosEscritorio2: function () { return h('div', { className: 'df-screens' }, h(AdDeskEngine)); },
    Textos1: function () { return h('div', { className: 'df-screens' }, h(TxStates), h(TxReview), h(TxEdit)); },
    Textos2: function () { return h('div', { className: 'df-screens' }, h(TxFaqFail), h(TxDone)); },
    TextosEscritorio: function () { return h('div', { className: 'df-screens' }, h(TxDeskReview)); },
    CostoIA: function () { return h('div', { className: 'df-screens' }, h(AiProduct), h(AiSheet), h(AiWarn)); },
    CostoIAEscritorio: function () { return h('div', { className: 'df-screens' }, h(AiDesk)); }
  };

  window.DropFlex = Object.assign(window.DropFlex || {}, {
    Button: Button, IconButton: IconButton, StatusBadge: StatusBadge, StageMeter: StageMeter, ProductRow: ProductRow,
    AttentionItem: AttentionItem, StageList: StageList, ReviewCard: ReviewCard, ImageTile: ImageTile,
    SegmentedControl: SegmentedControl, Field: Field, PriceBreakdown: PriceBreakdown, OfferPreview: OfferPreview,
    Metric: Metric, CampaignCard: CampaignCard, Verdict: Verdict, Navigation: Navigation, TopBar: TopBar, Toast: Toast,
    AssistantSheet: AssistantSheet, Icon: Icon,
    OnboardingHeader: OnboardingHeader, ProviderMark: ProviderMark, ConnectionCard: ConnectionCard, PermissionList: PermissionList, OptionList: OptionList, PickRow: PickRow, GenerationProgress: GenerationProgress, SetupChecklist: SetupChecklist,
    ReferenceImage: ReferenceImage, ImageUploader: ImageUploader, ProductInfoInput: ProductInfoInput,
    Stars: Stars, ReviewImporter: ReviewImporter, ReviewSummary: ReviewSummary, ReviewItem: ReviewItem,
    ScoreBar: ScoreBar, RoleChip: RoleChip, AngleCard: AngleCard, AngleSuggestion: AngleSuggestion, IcpSummary: IcpSummary, AngleDevelopment: AngleDevelopment,
    StructurePicker: StructurePicker, PresetSelect: PresetSelect, ConfigSection: ConfigSection, ChipInput: ChipInput, RuleRow: RuleRow, RuleGroup: RuleGroup, CreativeSlot: CreativeSlot, CampaignTree: CampaignTree, DecisionRow: DecisionRow,
    CharCount: CharCount, EmptyState: EmptyState, Notice: Notice, PageOutline: PageOutline, CopySummary: CopySummary,
    AiCostChip: AiCostChip, AiCostCard: AiCostCard, AiRunList: AiRunList, productImage: productImage, money: money, Screens: Screens
  });
})();
