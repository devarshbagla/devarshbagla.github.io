/**
 * Shared primitives: media queries, canvas sizing, storage, lazy init.
 * Everything here is dependency-free and safe to call before DOM ready.
 */

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

export const reduceMotionQuery = window.matchMedia(REDUCE_QUERY);

export function prefersReducedMotion() {
  return reduceMotionQuery.matches;
}

export function hasFinePointer() {
  return window.matchMedia(HOVER_QUERY).matches;
}

export function onMediaChange(query, fn) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", fn);
  } else if (typeof query.addListener === "function") {
    query.addListener(fn);
  }
}

export function onReducedMotionChange(fn) {
  onMediaChange(reduceMotionQuery, fn);
}

export function cssVar(name, fallback = "") {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function onThemeChange(fn) {
  const observer = new MutationObserver(fn);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return observer;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function debounce(fn, wait) {
  let id = 0;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...args), wait);
  };
}

/** localStorage that never throws (private mode, file://, blocked storage). */
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  },
  getJSON(key, fallback) {
    const raw = this.get(key, null);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  setJSON(key, value) {
    try {
      this.set(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

/**
 * Run `init` once the element is within `margin` of the viewport.
 * Falls back to immediate init where IntersectionObserver is missing.
 */
export function whenNear(el, init, margin = "300px") {
  if (!el) return;
  if (!("IntersectionObserver" in window)) {
    init();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      init();
    },
    { rootMargin: margin }
  );
  io.observe(el);
}

/** Size a canvas to its CSS box at the current DPR. Returns false when unchanged. */
export function fitCanvas(canvas, ctx, maxDpr = 2) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const pxW = Math.round(w * dpr);
  const pxH = Math.round(h * dpr);
  if (canvas.width === pxW && canvas.height === pxH) return false;
  canvas.width = pxW;
  canvas.height = pxH;
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

export function cssSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

/** Deterministic PRNG so generated datasets are identical across visits. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
