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

export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  syncToggle(next);
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
