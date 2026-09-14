/**
 * Oscilloscope canvas — DeskPulse metaphor.
 * Three summed sines, pointer-driven freq/amp with lerp, grid + glow,
 * 10 Hz readout, DPR-aware, pauses offscreen / when hidden / reduced-motion.
 */

const IDLE_FREQ = 2.4;
const IDLE_AMP = 0.62;
const LERP = 0.08;
const READOUT_MS = 100;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function initScope(root = document) {
  const host = root.querySelector("[data-scope]");
  const canvas = root.querySelector("[data-scope-canvas]");
  const readout = root.querySelector("[data-scope-readout]");
  if (!host || !canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let visible = true;
  let pageHidden = document.hidden;

  let phase = 0;
  let freq = IDLE_FREQ;
  let amp = IDLE_AMP;
  let targetFreq = IDLE_FREQ;
  let targetAmp = IDLE_AMP;
  let pointerInside = false;

  let lastFrame = 0;
  let lastReadout = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w === width && h === height && nextDpr === dpr) return;
    width = w;
    height = h;
    dpr = nextDpr;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGrid() {
    const line = cssVar("--line", "#2a2622");
    const inkMuted = cssVar("--ink-muted", "#9a9086");

    ctx.save();
    ctx.lineWidth = 1;

    const major = 40;
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let x = 0; x <= width; x += major) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += major) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();

    // Brighter centre axes
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = inkMuted;
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.moveTo(width / 2 + 0.5, 0);
    ctx.lineTo(width / 2 + 0.5, height);
    ctx.stroke();
    ctx.restore();
  }

  function sample(xNorm, tPhase, f, a) {
    const x = xNorm * Math.PI * 2;
    const w1 = Math.sin(x * f + tPhase) * a;
    const w2 = Math.sin(x * f * 2.15 + tPhase * 1.37) * a * 0.45;
    const w3 = Math.sin(x * f * 0.55 + tPhase * 0.61) * a * 0.3;
    return w1 + w2 + w3;
  }

  function drawWave() {
    const accent = cssVar("--accent", "#e2703a");
    const mid = height / 2;
    const scale = height * 0.32;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Soft glow underlay
    ctx.beginPath();
    for (let px = 0; px <= width; px++) {
      const y = mid - sample(px / width, phase, freq, amp) * scale;
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 4;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.stroke();

    // Crisp trace
    ctx.beginPath();
    for (let px = 0; px <= width; px++) {
      const y = mid - sample(px / width, phase, freq, amp) * scale;
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.restore();
  }

  function paint() {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawWave();
  }

  function updateReadout(now) {
    if (!readout || now - lastReadout < READOUT_MS) return;
    lastReadout = now;
    const phaseWrapped = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    readout.textContent =
      `FREQ ${freq.toFixed(2)} Hz   AMP ${amp.toFixed(2)}   PHASE ${phaseWrapped.toFixed(2)} rad`;
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;

    freq = lerp(freq, targetFreq, LERP);
    amp = lerp(amp, targetAmp, LERP);
    phase += dt * freq * Math.PI * 2 * 0.35;

    paint();
    updateReadout(now);
  }

  function start() {
    if (running || reducedMotion.matches || !visible || pageHidden) return;
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function syncLoop() {
    if (reducedMotion.matches) {
      stop();
      resize();
      freq = IDLE_FREQ;
      amp = IDLE_AMP;
      paint();
      updateReadout(performance.now());
      return;
    }
    if (visible && !pageHidden) start();
    else {
      stop();
      // Keep last painted frame visible
    }
  }

  function onPointerMove(event) {
    if (reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    // Right → higher frequency; up → higher amplitude
    targetFreq = lerp(0.8, 5.2, x);
    targetAmp = lerp(1.0, 0.18, y);
    pointerInside = true;
  }

  function onPointerLeave() {
    pointerInside = false;
    targetFreq = IDLE_FREQ;
    targetAmp = IDLE_AMP;
  }

  // Debounced resize
  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      paint();
      if (!running && reducedMotion.matches) updateReadout(performance.now());
    }, 80);
  });
  ro.observe(canvas);

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      syncLoop();
    },
    { threshold: 0.05 }
  );
  io.observe(host);

  document.addEventListener("visibilitychange", () => {
    pageHidden = document.hidden;
    syncLoop();
  });

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", syncLoop);
  } else if (typeof reducedMotion.addListener === "function") {
    reducedMotion.addListener(syncLoop);
  }

  // Theme changes retint the wave
  const themeObserver = new MutationObserver(() => {
    paint();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerenter", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.style.touchAction = "none";

  resize();
  paint();
  updateReadout(performance.now());
  syncLoop();
}
