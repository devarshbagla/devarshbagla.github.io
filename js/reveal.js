/**
 * Scroll system — reveal-on-intersect + top progress bar.
 */

export function initReveal(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = Array.from(root.querySelectorAll("[data-reveal]"));
  if (!nodes.length) return;

  if (reduced.matches || !("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  // Stagger siblings that share a parent
  const byParent = new Map();
  nodes.forEach((el) => {
    const parent = el.parentElement;
    if (!parent) return;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(el);
  });
  byParent.forEach((group) => {
    group.forEach((el, i) => {
      el.style.setProperty("--reveal-i", String(i));
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  nodes.forEach((el) => io.observe(el));
}

export function initScrollProgress(root = document) {
  const bar = root.querySelector("[data-scroll-progress]");
  if (!bar) return;

  const update = () => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const value = scrollable <= 0 ? 0 : (doc.scrollTop / scrollable) * 100;
    bar.value = value;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
}
