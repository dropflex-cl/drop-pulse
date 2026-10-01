// DropFlex · Eventos: la cuenta regresiva y el apagado a la hora (docs/spec-eventos.md).
//
// Sin red: la ventana viene en los data-* del contador (segundos Unix, la misma para todos). Cada
// segundo escribe lo que falta; al terminar el evento quita `df-event-on` de <html> y toda la capa
// del evento desaparece sin recargar.
//
// Fases (df-event-countdown.liquid): antesala sin reloj («Precio Cyber adelantado · ya disponible»),
// «Termina en 3 días» mientras quedan más de 48 h, reloj en segundos en las últimas 48 h y «Último
// día · termina hoy a las 23:59» el día del término (hora del comprador).
//
// La barra con cuenta regresiva (df-event-bar.liquid, [data-df-event-clock]) lleva el reloj en cajas
// (días, horas, minutos, segundos) hasta el término; en la antesala, el texto sin reloj.
//
// Brillo de la barra (docs/spec-movimiento-tienda.md, como el del botón de EasySell): al entrar en
// pantalla, dos pasadas de luz y se detiene; hasta SHINE_ROUNDS veces por visita. En las últimas
// 48 h la primera pasada lleva 3 latidos de las cajas. Nada con movimiento reducido, con
// data-df-motion="off" ni con la pestaña oculta. Cada vuelta dura menos de 5 s (WCAG 2.2.2).

(function () {
  var root = document.documentElement;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var URGENT_S = 48 * 3600;
  var clock = function (s) {
    var d = Math.floor(s / 86400);
    var rest = pad(Math.floor((s % 86400) / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    return d > 0 ? d + (d === 1 ? ' día ' : ' días ') + rest : rest;
  };
  var days = function (s) {
    var d = Math.floor(s / 86400);
    return d + (d === 1 ? ' día' : ' días');
  };

  /** Lo que muestra el contador ahora: texto, reloj y fase. */
  function view(el, now) {
    var start = Number(el.dataset.start);
    var to = Number(el.dataset.end);
    if (now < start) return { label: el.dataset.early, time: '', phase: 'early' };
    var left = Math.max(0, to - now);
    var end = new Date(to * 1000);
    if (end.toDateString() === new Date(now * 1000).toDateString()) {
      return { label: 'Último día · termina hoy a las ' + pad(end.getHours()) + ':' + pad(end.getMinutes()), time: clock(left), phase: 'urgent' };
    }
    if (left <= URGENT_S) return { label: el.dataset.during, time: clock(left), phase: 'urgent' };
    return { label: el.dataset.during, time: days(left), phase: 'calm' };
  }

  var setText = function (el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  };

  /** La barra: cajas durante el evento, el texto de la antesala antes. */
  function clockBar(el, now) {
    var start = Number(el.dataset.start);
    var left = Math.max(0, Number(el.dataset.end) - now);
    var early = now < start;
    el.classList.toggle('df-event-bar--early', early);
    el.classList.toggle('df-event-bar--urgent', !early && left <= URGENT_S);
    var boxes = el.querySelector('[data-df-clock-boxes]');
    var earlyText = el.querySelector('[data-df-clock-early]');
    var saving = el.querySelector('[data-df-clock-saving]');
    if (boxes) boxes.hidden = early;
    if (earlyText) earlyText.hidden = !early;
    if (saving) saving.hidden = early;
    if (early) return;
    var d = Math.floor(left / 86400);
    var h = Math.floor((left % 86400) / 3600);
    var m = Math.floor((left % 3600) / 60);
    setText(el.querySelector('[data-unit="d"]'), pad(d));
    setText(el.querySelector('[data-unit="h"]'), pad(h));
    setText(el.querySelector('[data-unit="m"]'), pad(m));
    setText(el.querySelector('[data-unit="s"]'), pad(left % 60));
    // Para el lector de pantalla, sin segundos: cambia una vez por minuto.
    setText(el.querySelector('[data-df-clock-sr]'), el.dataset.during + ' ' + d + (d === 1 ? ' día, ' : ' días, ') + h + (h === 1 ? ' hora y ' : ' horas y ') + m + (m === 1 ? ' minuto' : ' minutos'));
  }

  function tick() {
    var now = Math.floor(Date.now() / 1000);
    var nodes = document.querySelectorAll('[data-df-countdown]');
    var end = null;
    document.querySelectorAll('[data-df-event-clock]').forEach(function (el) {
      end = Number(el.dataset.end);
      clockBar(el, now);
    });
    nodes.forEach(function (el) {
      end = Number(el.dataset.end);
      var v = view(el, now);
      setText(el.querySelector('[data-df-countdown-label]'), v.label);
      setText(el.querySelector('[data-df-countdown-time]'), v.time);
      el.classList.toggle('df-event-countdown--early', v.phase === 'early');
      el.classList.toggle('df-event-countdown--urgent', v.phase === 'urgent');
    });
    if (end !== null && now >= end) {
      root.classList.remove('df-event-on');
      return false;
    }
    return true;
  }

  var SHINE_ROUNDS = 3;

  /** Una pasada de luz (y, si toca, los latidos). Quitar y volver a poner el atributo la reinicia. */
  function shine(bar, beat) {
    if (document.hidden || !root.classList.contains('df-event-on')) return;
    // La segunda pasada no toca los latidos: siguen hasta el tercero.
    bar.removeAttribute('data-df-shine');
    if (beat) bar.removeAttribute('data-df-beat');
    void bar.offsetWidth;
    bar.setAttribute('data-df-shine', '');
    if (beat) bar.setAttribute('data-df-beat', '');
  }

  function watchShine() {
    if (root.dataset.dfMotion === 'off' || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-df-event-clock]').forEach(function (bar) {
      var rounds = 0;
      var seen = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || rounds >= SHINE_ROUNDS) return;
            rounds++;
            setTimeout(shine, 600, bar, true);
            setTimeout(shine, 2600, bar, false);
          });
          if (rounds >= SHINE_ROUNDS) seen.disconnect();
        },
        { threshold: 0.6 }
      );
      seen.observe(bar);
    });
  }

  function run() {
    if (!root.classList.contains('df-event-on')) return;
    watchShine();
    if (!tick()) return;
    var id = setInterval(function () {
      if (!tick()) clearInterval(id);
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
