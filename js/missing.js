/**
 * 404 background scope — a quiet waveform behind the copy.
 * Same constraints as the rest of the site: no libraries, DPR-aware, paused
 * when hidden, one static frame under reduced motion.
 */

import { cssVar, fitCanvas, cssSize, prefersReducedMotion, onReducedMotionChange } from "./util.js";
import { initTheme } from "./theme.js";

initTheme();

const canvas = document.querySelector("[data-missing-scope]");
if (canvas) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let running = false;

  function paint(t) {
    const { width, height } = cssSize(canvas);
    ctx.clearRect(0, 0, width, height);
    const accent = cssVar("--accent", "#e2703a");
    const line = cssVar("--line", "#2a2622");

    ctx.save();
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    const step = 48;
    for (let x = 0; x <= width; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mid = height / 2;
    for (let x = 0; x <= width; x += 2) {
      const n = x / width;
      const y =
        mid -
        Math.sin(n * Math.PI * 4 + t * 1.6) * height * 0.16 -
        Math.sin(n * Math.PI * 9 + t * 2.4) * height * 0.06;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function start() {
    if (running || prefersReducedMotion() || document.hidden) return;
    running = true;
    const t0 = performance.now();
    const loop = (now) => {
      if (!running) return;
      paint((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function sync() {
    fitCanvas(canvas, ctx, 1.5);
    if (prefersReducedMotion() || document.hidden) {
      stop();
      paint(0);
      return;
    }
    start();
  }

  window.addEventListener("resize", sync, { passive: true });
  document.addEventListener("visibilitychange", sync);
  onReducedMotionChange(sync);
  sync();
}
