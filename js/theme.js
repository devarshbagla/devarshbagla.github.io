/**
 * Theme: prefers-color-scheme on first load, localStorage persistence,
 * data-theme on <html>. Pair with the blocking inline script in <head>.
 */

const STORAGE_KEY = "theme";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

function applyTheme(next) {
  document.documentElement.setAttribute("data-theme", next);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute("content", next === "light" ? "#F7F3EC" : "#0B0A09");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  syncToggle(next);
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  if (next === document.documentElement.getAttribute("data-theme")) {
    applyTheme(next);
    return;
  }
  // Cross-fade the whole document where the browser can; plain swap elsewhere.
  if (typeof document.startViewTransition === "function" && !reducedMotion()) {
    document.documentElement.classList.add("is-theme-transition");
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.finished
      .catch(() => {})
      .finally(() => document.documentElement.classList.remove("is-theme-transition"));
    return;
  }
  applyTheme(next);
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

function syncToggle(theme) {
  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("title", label);
}

export function initTheme() {
  const stored = readStoredTheme();
  setTheme(stored || systemTheme());

  const btn = document.querySelector("[data-theme-toggle]");
  if (btn) {
    btn.addEventListener("click", () => toggleTheme());
  }

  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (!readStoredTheme()) setTheme(systemTheme());
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(onChange);
  }
}
