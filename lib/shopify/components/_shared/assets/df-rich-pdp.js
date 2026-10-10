// Progresivo: sin JS las dos imágenes quedan visibles, sin ocultar evidencia.
(() => {
  if (window.DropFlexRichPdp) return;
  const mount = (root = document) =>
    root.querySelectorAll("[data-df-comparison]").forEach((host) => {
      const input = host.querySelector('input[type="range"]');
      if (!input || host.dataset.dfComparisonReady) return;
      const update = () =>
        host.style.setProperty(
          "--df-comparison-position",
          `${Math.min(100, Math.max(0, Number(input.value) || 0))}%`,
        );
      input.addEventListener("input", update);
      host.dataset.dfComparisonReady = "true";
      host.querySelector(".df-rich__range").hidden = false;
      update();
    });
  window.DropFlexRichPdp = { mount };
  document.addEventListener("DOMContentLoaded", () => mount());
  document.addEventListener("shopify:section:load", () => mount());
  document.addEventListener("df:landing-selected", () => mount());
  document.addEventListener("df:experience-selected", () => mount());
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-df-purchase-link]")) return;
    const target = document.getElementById("df-product-purchase");
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
  });
  mount();
})();
