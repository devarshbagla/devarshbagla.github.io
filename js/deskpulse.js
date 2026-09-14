/**
 * DeskPulse playground.
 *
 * Short low-frequency bursts through a lowpass filter, driving the voice coil
 * hard enough that the chassis moves. Every burst is built from the same six
 * numbers the sliders expose, and the envelope canvas is drawn from those same
 * numbers — what you see is exactly what is scheduled.
 *
 *   osc(wave, freq) -> lowpass(cutoff) -> gain(attack/decay envelope) -> master
 */

import {
  clamp,
  cssVar,
  fitCanvas,
  cssSize,
  prefersReducedMotion,
  whenNear,
} from "./util.js";

const PEAK_GAIN = 0.85;
const TAIL_S = 0.06;

const PARAM_META = {
  freq: { unit: "Hz", spoken: (v) => `base frequency ${v} hertz` },
  bursts: { unit: "", spoken: (v) => `${v} ${v === 1 ? "burst" : "bursts"}` },
  spacing: { unit: "ms", spoken: (v) => `burst spacing ${v} milliseconds` },
  attack: { unit: "ms", spoken: (v) => `attack ${v} milliseconds` },
  decay: { unit: "ms", spoken: (v) => `decay ${v} milliseconds` },
  cutoff: { unit: "Hz", spoken: (v) => `lowpass cutoff ${v} hertz` },
};

/**
 * Each preset is nothing but the six slider values, so the visualisation and
 * the audio can never drift apart from what the controls say.
 */
const PRESETS = {
  notification: { freq: 55, bursts: 2, spacing: 90, attack: 6, decay: 140, cutoff: 120 },
  call: { freq: 45, bursts: 4, spacing: 210, attack: 12, decay: 260, cutoff: 100 },
  email: { freq: 72, bursts: 1, spacing: 120, attack: 3, decay: 90, cutoff: 160 },
  error: { freq: 36, bursts: 3, spacing: 60, attack: 2, decay: 220, cutoff: 70 },
  heartbeat: { freq: 42, bursts: 2, spacing: 170, attack: 12, decay: 300, cutoff: 65 },
};

const PRESET_NAMES = {
  notification: "Notification",
  call: "Incoming call",
  email: "New email",
  error: "Error",
  heartbeat: "Heartbeat",
};

/** Envelope as a polyline in seconds, identical to what the audio graph runs. */
function buildEnvelope(p) {
  const attack = p.attack / 1000;
  const decay = p.decay / 1000;
  const spacing = p.spacing / 1000;
  const points = [{ t: 0, v: 0 }];
  for (let i = 0; i < p.bursts; i += 1) {
    const start = i * spacing;
    points.push({ t: start, v: 0 });
    points.push({ t: start + attack, v: 1 });
    // Exponential-ish decay, sampled so the curve reads as a curve.
    const steps = 14;
    for (let s = 1; s <= steps; s += 1) {
      const k = s / steps;
      points.push({
        t: start + attack + decay * k,
        v: Math.exp(-4.2 * k),
      });
    }
    points.push({ t: start + attack + decay, v: 0 });
  }
  const duration = (p.bursts - 1) * spacing + attack + decay + TAIL_S;
  points.push({ t: duration, v: 0 });
  return { points, duration };
}

let mounted = false;
let hostRef = null;

function ensureMounted() {
  if (mounted || !hostRef) return;
  mounted = true;
  mountDeskPulse(hostRef);
}

export function initDeskPulse(root = document) {
  hostRef = root.querySelector("[data-deskpulse]");
  if (!hostRef) return;
  whenNear(hostRef, ensureMounted);
}

function mountDeskPulse(host) {
  const playBtn = host.querySelector("[data-deskpulse-play]");
  const muteBtn = host.querySelector("[data-deskpulse-mute]");
  const tuneBtn = host.querySelector("[data-deskpulse-toggle]");
  const lab = host.querySelector("[data-deskpulse-lab]");
  const canvas = host.querySelector("[data-deskpulse-canvas]");
  const note = host.querySelector("[data-deskpulse-note]");
  const statusEl = host.querySelector("[data-dsp-status]");
  const ranges = Array.from(host.querySelectorAll("[data-dsp-param]"));
  const chips = Array.from(host.querySelectorAll("[data-dsp-preset]"));
  if (!playBtn || !canvas) return;

  const ctx2d = canvas.getContext("2d");
  const idleNote = note ? note.textContent.trim() : "";

  let audioCtx = null;
  let masterGain = null;
  let muted = false;
  let playing = false;
  let raf = 0;
  let playStart = 0;

  const WAVES = ["sine", "triangle", "square"];
  const waveBtns = Array.from(host.querySelectorAll("[data-dsp-wave]"));
  const bandEl = host.querySelector("[data-dsp-band]");
  let wave = "sine";

  function bandCopy(hz) {
    if (hz < 90) return "mostly felt, nearly inaudible";
    if (hz <= 150) return "felt and faintly heard, the useful band";
    return "increasingly audible, less tactile";
  }

  function readParams() {
    const next = {};
    ranges.forEach((input) => {
      next[input.dataset.dspParam] = Number(input.value);
    });
    return {
      freq: next.freq ?? 125,
      bursts: next.bursts ?? 3,
      spacing: next.spacing ?? 90,
      attack: next.attack ?? 8,
      decay: next.decay ?? 180,
      cutoff: next.cutoff ?? 120,
      wave,
    };
  }

  let params = readParams();
  let envelope = buildEnvelope(params);

  function syncOutputs() {
    ranges.forEach((input) => {
      const key = input.dataset.dspParam;
      const meta = PARAM_META[key];
      const value = Number(input.value);
      const text = meta.unit ? `${value} ${meta.unit}` : String(value);
      const out = host.querySelector(`[data-dsp-out="${key}"]`);
      if (out) out.textContent = text;
      input.setAttribute("aria-valuetext", meta.spoken(value));
      input.style.setProperty(
        "--fill",
        `${((value - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`
      );
    });
    if (bandEl) bandEl.textContent = bandCopy(Number(host.querySelector("[data-dsp-param=freq]")?.value || 125));
    waveBtns.forEach((btn) => {
      const on = btn.dataset.dspWave === wave;
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.classList.toggle("is-active", on);
    });
  }

  function announce(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function refresh({ fromPreset = null } = {}) {
    params = readParams();
    envelope = buildEnvelope(params);
    syncOutputs();
    chips.forEach((chip) => {
      const active = chip.dataset.dspPreset === fromPreset;
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      chip.classList.toggle("is-active", active);
    });
    if (!playing) drawEnvelope(1);
  }

  /* --------------------------------------------------------------- canvas */

  function drawEnvelope(progress) {
    if (!ctx2d) return;
    const { width, height } = cssSize(canvas);
    ctx2d.clearRect(0, 0, width, height);

    const line = cssVar("--line", "#2a2622");
    const accent = cssVar("--accent", "#e2703a");
    const floor = height - 1;
    const top = 4;

    ctx2d.save();
    ctx2d.strokeStyle = line;
    ctx2d.globalAlpha = 0.8;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, floor - 0.5);
    ctx2d.lineTo(width, floor - 0.5);
    ctx2d.stroke();

    // One faint tick per burst onset.
    ctx2d.globalAlpha = 0.6;
    ctx2d.setLineDash([2, 3]);
    ctx2d.beginPath();
    for (let i = 0; i < params.bursts; i += 1) {
      const x = Math.round(((i * params.spacing) / 1000 / envelope.duration) * width) + 0.5;
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, floor);
    }
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.restore();

    const toX = (t) => (t / envelope.duration) * width;
    const toY = (v) => floor - v * (floor - top);
    const visible = progress * envelope.duration;

    const path = new Path2D();
    let started = false;
    for (const point of envelope.points) {
      if (point.t > visible) break;
      const x = toX(point.t);
      const y = toY(point.v);
      if (!started) {
        path.moveTo(x, y);
        started = true;
      } else {
        path.lineTo(x, y);
      }
    }
    if (!started) return;

    ctx2d.save();
    const fill = new Path2D(path);
    fill.lineTo(toX(Math.min(visible, envelope.duration)), floor);
    fill.lineTo(0, floor);
    fill.closePath();
    ctx2d.fillStyle = accent;
    ctx2d.globalAlpha = 0.14;
    ctx2d.fill(fill);

    ctx2d.globalAlpha = 1;
    ctx2d.strokeStyle = accent;
    ctx2d.lineWidth = 1.5;
    ctx2d.lineJoin = "round";
    ctx2d.stroke(path);

    if (playing && progress < 1) {
      const x = toX(visible);
      ctx2d.globalAlpha = 0.85;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(x + 0.5, 0);
      ctx2d.lineTo(x + 0.5, floor);
      ctx2d.stroke();
    }
    ctx2d.restore();
  }

  function resizeCanvas() {
    fitCanvas(canvas, ctx2d);
    drawEnvelope(playing ? 1 : 1);
  }

  /* ---------------------------------------------------------------- audio */

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Web Audio is not supported in this browser.");
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  }

  function scheduleBurst(ctx, when, p) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = WAVES.includes(p.wave) ? p.wave : "sine";
    osc.frequency.value = p.freq;

    filter.type = "lowpass";
    filter.frequency.value = p.cutoff;
    filter.Q.value = 0.7;

    const attack = p.attack / 1000;
    const decay = p.decay / 1000;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(when);
    osc.stop(when + attack + decay + 0.02);
  }

  function animate(now) {
    if (!playing) return;
    const elapsed = (now - playStart) / 1000;
    const progress = clamp(elapsed / envelope.duration, 0, 1);
    drawEnvelope(prefersReducedMotion() ? 1 : progress);
    if (progress < 1) {
      raf = requestAnimationFrame(animate);
    } else {
      playing = false;
      playBtn.disabled = false;
      drawEnvelope(1);
    }
  }

  async function play(label) {
    if (playing) return;
    playBtn.disabled = true;
    try {
      const ctx = ensureAudio();
      if (ctx.state === "suspended") await ctx.resume();
      if (ctx.state !== "running") {
        throw new Error("AudioContext could not start. Check browser permissions.");
      }

      if (note) {
        note.textContent = idleNote;
        note.classList.remove("is-error");
      }

      const startAt = ctx.currentTime + 0.03;
      for (let i = 0; i < params.bursts; i += 1) {
        scheduleBurst(ctx, startAt + (i * params.spacing) / 1000, params);
      }
      announce(`${label || "Pattern"} playing. ${describe()}`);

      playing = true;
      playStart = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(animate);
    } catch (err) {
      playing = false;
      playBtn.disabled = false;
      if (note) {
        note.textContent =
          err && err.message
            ? err.message
            : "Could not start audio. Try another browser or check site permissions.";
        note.classList.add("is-error");
      }
    }
  }

  function describe() {
    return (
      `${params.bursts} ${params.bursts === 1 ? "burst" : "bursts"} at ${params.freq} hertz, ` +
      `${params.spacing} millisecond spacing, ${params.attack} millisecond attack, ` +
      `${params.decay} millisecond decay, lowpass at ${params.cutoff} hertz.`
    );
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.01);
    }
    if (!muteBtn) return;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    const label = muted ? "Unmute DeskPulse demo" : "Mute DeskPulse demo";
    muteBtn.setAttribute("aria-label", label);
    muteBtn.title = muted ? "Unmute" : "Mute";
    const onIcon = muteBtn.querySelector(".deskpulse__mute-on");
    const offIcon = muteBtn.querySelector(".deskpulse__mute-off");
    if (onIcon) onIcon.toggleAttribute("hidden", muted);
    if (offIcon) offIcon.toggleAttribute("hidden", !muted);
    announce(muted ? "Output muted." : "Output unmuted.");
  }

  /* -------------------------------------------------------------- wiring */

  playBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    play("Current settings");
  });

  if (muteBtn) {
    muteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMute();
    });
  }

  if (tuneBtn && lab) {
    tuneBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = tuneBtn.getAttribute("aria-expanded") === "true";
      tuneBtn.setAttribute("aria-expanded", open ? "false" : "true");
      lab.hidden = open;
      tuneBtn.textContent = open ? "Tune it" : "Hide controls";
      if (!open) {
        resizeCanvas();
        const first = lab.querySelector("[data-dsp-preset]");
        if (first) first.focus();
      }
    });
  }

  function setWave(next) {
    if (!WAVES.includes(next)) return;
    wave = next;
    refresh();
    announce(`${wave} waveform.`);
  }

  waveBtns.forEach((btn, index) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setWave(btn.dataset.dspWave);
    });
    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = (index + dir + waveBtns.length) % waveBtns.length;
      waveBtns[next].focus();
      setWave(waveBtns[next].dataset.dspWave);
    });
  });

  ranges.forEach((input) => {
    input.addEventListener("input", (event) => {
      event.stopPropagation();
      refresh();
    });
    input.addEventListener("change", () => {
      const key = input.dataset.dspParam;
      announce(PARAM_META[key].spoken(Number(input.value)));
    });
    input.addEventListener("keydown", (event) => event.stopPropagation());
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const preset = PRESETS[chip.dataset.dspPreset];
      if (!preset) return;
      ranges.forEach((input) => {
        const key = input.dataset.dspParam;
        if (preset[key] !== undefined) input.value = String(preset[key]);
      });
      refresh({ fromPreset: chip.dataset.dspPreset });
      play(PRESET_NAMES[chip.dataset.dspPreset]);
    });
  });

  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(canvas);

  const mo = new MutationObserver(() => drawEnvelope(1));
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  syncOutputs();
  resizeCanvas();
  refresh();
}

function bindCardEnter(card) {
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.target !== card) return;
    const link = card.querySelector(
      "[data-project-link], .project-card__link, .work-card__link"
    );
    if (!link) return;
    event.preventDefault();
    link.click();
  });
}

export function initProjectCards(root = document) {
  root.querySelectorAll("[data-project-card], [data-work-card]").forEach(bindCardEnter);
}

/** Used by the "deskpulse" typing easter egg and the command palette. */
export function triggerDeskPulse() {
  ensureMounted();
  const btn = document.querySelector("[data-deskpulse-play]");
  if (!btn) return false;
  btn.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  btn.click();
  return true;
}
