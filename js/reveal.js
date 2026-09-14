/**
 * Scroll system — reveal-on-intersect + top progress bar.
 *
 * Where the browser supports scroll-driven CSS animations the reveal is handed
 * to `animation-timeline: view()` and no JavaScript observer runs. That timeline
 * is inactive when the document cannot scroll, which would strand every element
 * at opacity 0, so the CSS path is only armed once there is something to scroll.
 */

const SCROLL_REVEAL_CLASS = "has-scroll-reveal";
const MIN_SCROLLABLE = 240;

function hasScrollTimeline() {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline", "view()")
  );
}

function scrollableDistance() {
  const doc = document.documentElement;
  return doc.scrollHeight - doc.clientHeight;
}

export function initReveal(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = Array.from(root.querySelectorAll("[data-reveal]"));
  if (!nodes.length) return;

  const revealAll = () => nodes.forEach((el) => el.classList.add("is-revealed"));

  if (reduced.matches || !("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  if (hasScrollTimeline() && scrollableDistance() > MIN_SCROLLABLE) {
    document.documentElement.classList.add(SCROLL_REVEAL_CLASS);
    // A window that grows taller than the content kills the timeline; bail out.
    window.addEventListener(
      "resize",
      () => {
        if (scrollableDistance() > MIN_SCROLLABLE) return;
        document.documentElement.classList.remove(SCROLL_REVEAL_CLASS);
        revealAll();
      },
      { passive: true }
    );
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
