// DropFlex · Eventos: la cuenta regresiva y el apagado a la hora (docs/spec-eventos.md).
//
// Sin red: la ventana viene en los data-* del contador (segundos Unix, la misma para todos). Cada
// segundo escribe lo que falta; al terminar el evento quita `df-event-on` de <html> y toda la capa
// del evento desaparece sin recargar.
//
// Fases (df-event-countdown.liquid): antesala sin reloj («Precio Cyber adelantado · ya disponible»),
// «Termina en 3 días» mientras quedan más de 48 h, reloj en segundos en las últimas 48 h y «Último
// día · termina hoy a las 23:59» el día del término (hora del comprador).

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

  function tick() {
    var now = Math.floor(Date.now() / 1000);
    var nodes = document.querySelectorAll('[data-df-countdown]');
    var end = null;
    nodes.forEach(function (el) {
      end = Number(el.dataset.end);
      var v = view(el, now);
      var label = el.querySelector('[data-df-countdown-label]');
      var time = el.querySelector('[data-df-countdown-time]');
      if (label && label.textContent !== v.label) label.textContent = v.label;
      if (time && time.textContent !== v.time) time.textContent = v.time;
      el.classList.toggle('df-event-countdown--early', v.phase === 'early');
      el.classList.toggle('df-event-countdown--urgent', v.phase === 'urgent');
    });
    if (end !== null && now >= end) {
      root.classList.remove('df-event-on');
      return false;
    }
    return true;
  }

  function run() {
    if (!root.classList.contains('df-event-on')) return;
    if (!tick()) return;
    var id = setInterval(function () {
      if (!tick()) clearInterval(id);
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
