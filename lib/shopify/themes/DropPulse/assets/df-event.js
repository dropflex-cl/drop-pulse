// DropFlex · Eventos: la cuenta regresiva y el apagado a la hora (docs/spec-eventos.md).
//
// Sin red: la ventana viene en los data-* del contador (segundos Unix, la misma para todos). Cada
// segundo escribe lo que falta; al terminar el evento quita `df-event-on` de <html> y toda la capa
// del evento desaparece sin recargar. Antes de empezar cuenta hasta el inicio («Empieza en»).

(function () {
  var root = document.documentElement;
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var format = function (s) {
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var rest = pad(h) + ':' + pad(m) + ':' + pad(s % 60);
    return d > 0 ? d + (d === 1 ? ' día ' : ' días ') + rest : rest;
  };

  function tick() {
    var now = Math.floor(Date.now() / 1000);
    var nodes = document.querySelectorAll('[data-df-countdown]');
    var end = null;
    nodes.forEach(function (el) {
      var start = Number(el.dataset.start);
      var to = Number(el.dataset.end);
      end = to;
      var before = now < start;
      var label = el.querySelector('[data-df-countdown-label]');
      var time = el.querySelector('[data-df-countdown-time]');
      if (label) label.textContent = before ? el.dataset.before : el.dataset.during;
      if (time) time.textContent = format(Math.max(0, (before ? start : to) - now));
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
