/**
 * Tiny performance HUD. Off by default, toggled only from the command palette.
 * FPS from rAF; JS heap where Chromium exposes performance.memory.
 */

const HUD_KEY = "perf:hud";

let hud = null;
let raf = 0;
let frames = 0;
let last = 0;
let visible = false;

function formatMem() {
  const mem = performance.memory;
  if (!mem || !mem.usedJSHeapSize) return "MEM —";
  const mb = mem.usedJSHeapSize / 1048576;
  return `MEM ${mb.toFixed(1)} MB`;
}

function tick(now) {
  if (!visible) return;
  raf = requestAnimationFrame(tick);
  frames += 1;
  if (!last) {
    last = now;
    return;
  }
  const elapsed = now - last;
  if (elapsed < 500) return;
  const fps = Math.round((frames * 1000) / elapsed);
  frames = 0;
  last = now;
  if (hud) hud.textContent = `FPS ${fps}   ${formatMem()}`;
}

function ensureHud() {
  if (hud) return hud;
  hud = document.createElement("p");
  hud.className = "perf-hud";
  hud.setAttribute("aria-live", "off");
  hud.setAttribute("aria-hidden", "true");
  hud.hidden = true;
  hud.textContent = "FPS —   MEM —";
  document.body.appendChild(hud);
  return hud;
}

export function setPerfHud(on) {
  visible = Boolean(on);
  ensureHud();
  hud.hidden = !visible;
  try {
    localStorage.setItem(HUD_KEY, visible ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (visible) {
    frames = 0;
    last = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function togglePerfHud() {
  setPerfHud(!visible);
  return visible;
}

export function initPerfHud() {
  let stored = "0";
  try {
    stored = localStorage.getItem(HUD_KEY) || "0";
  } catch {
    stored = "0";
  }
  // Palette is the only way to turn it on. A leftover flag from a previous
  // visit is honoured so a session survives reload, but the default is off.
  if (stored === "1") setPerfHud(true);
}
