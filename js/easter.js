/**
 * Easter eggs: Konami scope-mode, the "deskpulse" type-trigger, and the
 * console colophon. None of this is required to use the site.
 */

import { cssVar, fitCanvas, cssSize, prefersReducedMotion } from "./util.js";
import { triggerDeskPulse } from "./deskpulse.js";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const SCOPE_MS = 10000;

function waveLogo() {
  const rows = 5;
  const cols = 28;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));
  let prev = null;
  for (let x = 0; x < cols; x += 1) {
    const y = Math.round(((1 - Math.sin((x / (cols - 1)) * Math.PI * 3)) / 2) * (rows - 1));
    if (prev !== null) {
      const lo = Math.min(prev, y);
      const hi = Math.max(prev, y);
      for (let fill = lo; fill <= hi; fill += 1) grid[fill][x] = "#";
    } else {
      grid[y][x] = "#";
    }
    prev = y;
  }
  return grid.map((row) => row.join("")).join("\n");
}

function consoleColophon() {
  const style = "color:#e2703a;font-family:ui-monospace,monospace";
  console.log(`%c${waveLogo()}`, style);
  console.log(
    "%cHand-written. No framework, no bundler, no build step.\nIf you read this far, email devarshbagla@gmail.com — I would like to hear from you.",
    "color:#b0a89e;font-family:ui-monospace,monospace"
  );
}

export function initEaster() {
  consoleColophon();
  watchKonami();
  watchDeskPulse();
}

/* ---------------------------------------------------------- scope mode */

function watchKonami() {
  let index = 0;
  document.addEventListener("keydown", (event) => {
    const expected = KONAMI[index];
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === expected || key === expected.toLowerCase()) {
      index += 1;
      if (index >= KONAMI.length) {
        index = 0;
        enterScopeMode();
      }
    } else {
      index = key === KONAMI[0] ? 1 : 0;
    }
  });
}

let scopeTimer = 0;
let scopeRaf = 0;
let scopeCanvas = null;
let live = null;

function announce(text) {
  if (!live) {
    live = document.createElement("p");
    live.className = "visually-hidden";
    live.dataset.scopeModeLive = "true";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = text;
  });
}

function enterScopeMode() {
  document.documentElement.classList.add("is-scope-mode");
  ensureScopeCanvas();
  announce(
    "Scope mode. The page is a phosphor-green oscilloscope for ten seconds. Press Escape to leave."
  );
  window.clearTimeout(scopeTimer);
  if (!prefersReducedMotion()) {
    startScope();
    scopeTimer = window.setTimeout(exitScopeMode, SCOPE_MS);
  } else {
    paintScope(0);
    scopeTimer = window.setTimeout(exitScopeMode, SCOPE_MS);
  }
}

function exitScopeMode() {
  window.clearTimeout(scopeTimer);
  scopeTimer = 0;
  if (scopeRaf) cancelAnimationFrame(scopeRaf);
  scopeRaf = 0;
  document.documentElement.classList.remove("is-scope-mode");
  if (scopeCanvas) scopeCanvas.hidden = true;
  announce("Scope mode ended.");
}

function ensureScopeCanvas() {
  if (scopeCanvas) {
    scopeCanvas.hidden = false;
    fitCanvas(scopeCanvas, scopeCanvas.getContext("2d"), 1.5);
    return;
  }
  scopeCanvas = document.createElement("canvas");
  scopeCanvas.className = "scope-mode";
  scopeCanvas.setAttribute("aria-hidden", "true");
  document.body.prepend(scopeCanvas);
  fitCanvas(scopeCanvas, scopeCanvas.getContext("2d"), 1.5);
  window.addEventListener(
    "resize",
    () => {
      if (!document.documentElement.classList.contains("is-scope-mode")) return;
      fitCanvas(scopeCanvas, scopeCanvas.getContext("2d"), 1.5);
    },
    { passive: true }
  );
}

function startScope() {
  if (scopeRaf) cancelAnimationFrame(scopeRaf);
  const t0 = performance.now();
  const loop = (now) => {
    if (!document.documentElement.classList.contains("is-scope-mode")) return;
    paintScope((now - t0) / 1000);
    scopeRaf = requestAnimationFrame(loop);
  };
  scopeRaf = requestAnimationFrame(loop);
}

function paintScope(t) {
  if (!scopeCanvas) return;
  const ctx = scopeCanvas.getContext("2d");
  const { width, height } = cssSize(scopeCanvas);
  ctx.clearRect(0, 0, width, height);

  const green = cssVar("--accent", "#39d98a");
  const line = cssVar("--line", "#1c3d2a");

  ctx.save();
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = 0; x <= width; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = green;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  const mid = height / 2;
  for (let x = 0; x <= width; x += 2) {
    const n = x / width;
    const y =
      mid -
      Math.sin(n * Math.PI * 6 + t * 2.2) * height * 0.08 -
      Math.sin(n * Math.PI * 13 + t * 3.1) * height * 0.035;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!document.documentElement.classList.contains("is-scope-mode")) return;
  event.preventDefault();
  exitScopeMode();
});

/* ----------------------------------------------------- type "deskpulse" */

function watchDeskPulse() {
  let buffer = "";
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length !== 1) return;
    buffer = (buffer + event.key.toLowerCase()).slice(-9);
    if (buffer === "deskpulse") {
      buffer = "";
      triggerDeskPulse();
    }
  });
}
