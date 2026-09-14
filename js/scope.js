/**
 * Hero signal workbench.
 *
 * A real Web Audio graph drives every mode: seven partial oscillators sum into a
 * gain stage, through an AnalyserNode, then into a permanently silent gain before
 * the destination. Nothing is ever audible — the graph exists so the FFT is a
 * genuine FFT of a genuine signal rather than drawn maths.
 *
 *   oscA[1..7] -> partialGain -> ampA -> analyserA -+
 *   oscB[1..7] -> partialGain -> ampB -> delayB -> analyserB -+-> mute(0) -> out
 *
 * Channel B is channel A at a Lissajous ratio through a quarter-period delay, so
 * the X/Y plot traces a real phase figure instead of a straight line.
 *
 * The trace is driven by a math-generated additive series on load — no
 * AudioContext, no gesture. After the user interacts we optionally switch the
 * same buffers over to a silent AnalyserNode so the FFT is real. The rAF loop
 * always runs while the scope is on screen; the canvas is never left static
 * except under prefers-reduced-motion, which holds a single frame.
 */

import {
  clamp,
  cssVar,
  fitCanvas,
  cssSize,
  debounce,
  lerp,
  onReducedMotionChange,
  onThemeChange,
  prefersReducedMotion,
  store,
} from "./util.js";

const MODES = ["WAVEFORM", "SPECTRUM", "LISSAJOUS"];
const MODE_KEY = "scope:mode";

const PARTIALS_MAX = 7;
const FFT_SIZE = 2048;
const SPECTRUM_BARS = 48;
const SPECTRUM_TOP_HZ = 7000;
/* Log frequency axis, the way a real spectrum analyser lays out audio. */
const SPECTRUM_LO_HZ = 50;
const SPECTRUM_HI_HZ = 8000;

const FREQ_MIN = 55;
const FREQ_MAX = 880;
const AMP_MIN = 0.08;
const AMP_MAX = 1;

const IDLE_FREQ = 174;
const IDLE_AMP = 0.62;
const IDLE_PARTIALS = 3;

const EASE = 0.08;
const PHOSPHOR = 0.12;
const SAMPLE_RATE = 44100;
const DRAG_PX_PER_PARTIAL = 34;

/** Lissajous X:Y ratio for each harmonic count, 1 through 7. */
const LISSAJOUS_RATIO = [1, 3 / 2, 2, 5 / 3, 3, 5 / 2, 4];

const CONTROL_HINT =
  "Pointer position sets frequency and amplitude; drag vertically for harmonic count. " +
  "With keyboard focus, left and right arrows change frequency, up and down change " +
  "amplitude, shift with up or down changes harmonic count, and M cycles the mode.";

function bankNorm(count) {
  let sum = 0;
  for (let n = 1; n <= count; n += 1) sum += 1 / n;
  return sum;
}

/** Build a 7-partial bank on any BaseAudioContext. Amplitude falls as 1/n. */
function buildBank(ctx, baseFreq, amp, partials, ratio) {
  const out = ctx.createGain();
  out.gain.value = amp;
  const norm = bankNorm(partials);
  const oscillators = [];
  for (let n = 1; n <= PARTIALS_MAX; n += 1) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = baseFreq * ratio * n;
    const gain = ctx.createGain();
    gain.gain.value = n <= partials ? 1 / n / norm : 0;
    osc.connect(gain);
    gain.connect(out);
    oscillators.push({ osc, gain });
  }
  return { out, oscillators };
}

/**
 * Capture one frame of genuine analyser data without needing a user gesture.
 * OfflineAudioContext.suspend() lets us read the AnalyserNode mid-render.
 */
async function coldCapture(params) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const sampleRate = 44100;
  const length = 8192;
  let ctx;
  try {
    ctx = new OfflineCtx(2, length, sampleRate);
  } catch {
    return null;
  }

  const ratio = LISSAJOUS_RATIO[params.partials - 1] || 1;
  const bankA = buildBank(ctx, params.freq, params.amp, params.partials, 1);
  const bankB = buildBank(ctx, params.freq, params.amp, params.partials, ratio);

  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = clamp(0.25 / (params.freq * ratio), 0, 0.09);

  const analyserA = ctx.createAnalyser();
  analyserA.fftSize = FFT_SIZE;
  analyserA.smoothingTimeConstant = 0;
  const analyserB = ctx.createAnalyser();
  analyserB.fftSize = FFT_SIZE;
  analyserB.smoothingTimeConstant = 0;

  bankA.out.connect(analyserA);
  bankB.out.connect(delay);
  delay.connect(analyserB);

  const merger = ctx.createChannelMerger(2);
  analyserA.connect(merger, 0, 0);
  analyserB.connect(merger, 0, 1);
  merger.connect(ctx.destination);

  bankA.oscillators.forEach(({ osc }) => osc.start(0));
  bankB.oscillators.forEach(({ osc }) => osc.start(0));

  let captured = null;
  const captureAt = 4096 / sampleRate;
  if (typeof ctx.suspend === "function") {
    ctx
      .suspend(captureAt)
      .then(() => {
        const time = new Uint8Array(analyserA.fftSize);
        const timeB = new Uint8Array(analyserB.fftSize);
        const freq = new Uint8Array(analyserA.frequencyBinCount);
        analyserA.getByteTimeDomainData(time);
        analyserB.getByteTimeDomainData(timeB);
        analyserA.getByteFrequencyData(freq);
        captured = { time, timeB, freq, sampleRate };
        return ctx.resume();
      })
      .catch(() => {
        /* suspend unsupported — fall back to the rendered buffer below */
      });
  }

  let buffer;
  try {
    buffer = await ctx.startRendering();
  } catch {
    return null;
  }
  if (captured) return captured;

  // Fallback: read the rendered buffer directly. Time domain only.
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const time = new Uint8Array(FFT_SIZE);
  const timeB = new Uint8Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    time[i] = clamp(Math.round(left[i] * 128 + 128), 0, 255);
    timeB[i] = clamp(Math.round(right[i] * 128 + 128), 0, 255);
  }
  return { time, timeB, freq: null, sampleRate };
}

export function initScope(root = document) {
  const host = root.querySelector("[data-scope]");
  const frame = root.querySelector("[data-scope-frame]");
  const gridCanvas = root.querySelector("[data-scope-grid]");
  const traceCanvas = root.querySelector("[data-scope-canvas]");
  const readout = root.querySelector("[data-scope-readout]");
  const statusEl = root.querySelector("[data-scope-status]");
  const modeBtn = root.querySelector("[data-scope-mode]");
  const modeLabel = root.querySelector("[data-scope-mode-label]");
  const stateEl = root.querySelector("[data-scope-state]");
  if (!host || !frame || !gridCanvas || !traceCanvas) return;

  const gridCtx = gridCanvas.getContext("2d");
  const traceCtx = traceCanvas.getContext("2d", { alpha: true });
  if (!gridCtx || !traceCtx) return;

  const stored = store.get(MODE_KEY, "");
  let mode = MODES.includes(stored) ? stored : MODES[0];

  let freq = IDLE_FREQ;
  let amp = IDLE_AMP;
  let partials = IDLE_PARTIALS;
  let targetFreq = IDLE_FREQ;
  let targetAmp = IDLE_AMP;

  let audio = null;
  let armed = false;
  let armPending = false;
  let cold = null;
  let peakHz = 0;
  let peakBin = 0;

  let raf = 0;
  let running = false;
  let onScreen = true;
  let lastNow = 0;
  let signalTime = 0;
  let displayFreq = IDLE_FREQ;
  let displayAmp = IDLE_AMP;
  let displayPeak = IDLE_FREQ;
  let displayBin = Math.round((IDLE_FREQ * FFT_SIZE) / SAMPLE_RATE);

  const mathTime = new Uint8Array(FFT_SIZE);
  const mathTimeB = new Uint8Array(FFT_SIZE);
  const mathFreq = new Uint8Array(FFT_SIZE / 2);

  /* ---------------------------------------------------------------- canvas */

  function paintGrid() {
    const { width, height } = cssSize(gridCanvas);
    const line = cssVar("--line", "#2a2622");
    const ink = cssVar("--ink-muted", "#b0a89e");

    gridCtx.clearRect(0, 0, width, height);
    gridCtx.save();
    gridCtx.lineWidth = 1;
    gridCtx.strokeStyle = line;
    gridCtx.globalAlpha = 0.6;

    const divX = 10;
    const divY = 8;
    gridCtx.beginPath();
    for (let i = 1; i < divX; i += 1) {
      const x = Math.round((width / divX) * i) + 0.5;
      gridCtx.moveTo(x, 0);
      gridCtx.lineTo(x, height);
    }
    for (let i = 1; i < divY; i += 1) {
      const y = Math.round((height / divY) * i) + 0.5;
      gridCtx.moveTo(0, y);
      gridCtx.lineTo(width, y);
    }
    gridCtx.stroke();

    gridCtx.globalAlpha = 0.85;
    gridCtx.strokeStyle = ink;
    const midY = Math.round(height / 2) + 0.5;
    const midX = Math.round(width / 2) + 0.5;
    gridCtx.beginPath();
    gridCtx.moveTo(0, midY);
    gridCtx.lineTo(width, midY);
    gridCtx.moveTo(midX, 0);
    gridCtx.lineTo(midX, height);
    gridCtx.stroke();

    // Minor ticks along the centre axes, five per division.
    gridCtx.globalAlpha = 0.5;
    gridCtx.beginPath();
    const stepX = width / divX / 5;
    for (let x = stepX; x < width; x += stepX) {
      const px = Math.round(x) + 0.5;
      gridCtx.moveTo(px, midY - 3);
      gridCtx.lineTo(px, midY + 3);
    }
    const stepY = height / divY / 5;
    for (let y = stepY; y < height; y += stepY) {
      const py = Math.round(y) + 0.5;
      gridCtx.moveTo(midX - 3, py);
      gridCtx.lineTo(midX + 3, py);
    }
    gridCtx.stroke();
    gridCtx.restore();
  }

  function colorWithAlpha(color, alpha) {
    const value = (color || "").trim();
    if (value[0] === "#") {
      let hex = value.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
    return `rgba(11, 10, 9, ${alpha})`;
  }

  function fadeTrace() {
    const { width, height } = cssSize(traceCanvas);
    const bg = cssVar("--bg", "#0B0A09");
    traceCtx.save();
    traceCtx.globalCompositeOperation = "source-over";
    traceCtx.fillStyle = colorWithAlpha(bg, PHOSPHOR);
    traceCtx.fillRect(0, 0, width, height);
    traceCtx.restore();
  }

  function clearTrace() {
    const { width, height } = cssSize(traceCanvas);
    traceCtx.clearRect(0, 0, width, height);
  }

  function strokeTrace(build, glow = true) {
    const accent = cssVar("--accent", "#e2703a");
    traceCtx.save();
    traceCtx.lineJoin = "round";
    traceCtx.lineCap = "round";
    traceCtx.strokeStyle = accent;
    if (glow) {
      traceCtx.globalAlpha = 0.32;
      traceCtx.lineWidth = 3.5;
      traceCtx.shadowColor = accent;
      traceCtx.shadowBlur = 14;
      traceCtx.beginPath();
      build(traceCtx);
      traceCtx.stroke();
      traceCtx.shadowBlur = 0;
    }
    traceCtx.globalAlpha = 1;
    traceCtx.lineWidth = 1.4;
    traceCtx.beginPath();
    build(traceCtx);
    traceCtx.stroke();
    traceCtx.restore();
  }

  /* ------------------------------------------------------------ mode draws */

  /** Rising-edge trigger, so the trace sits still like a real scope. */
  function triggerOffset(data) {
    const limit = Math.floor(data.length / 2);
    for (let i = 1; i < limit; i += 1) {
      if (data[i - 1] < 128 && data[i] >= 128) return i;
    }
    return 0;
  }

  function drawWaveform(time) {
    if (!time) return;
    const { width, height } = cssSize(traceCanvas);
    const mid = height / 2;
    const scale = height * 0.42;
    const start = triggerOffset(time);
    const span = Math.min(time.length - start, Math.floor(time.length / 2));
    strokeTrace((ctx) => {
      for (let px = 0; px <= width; px += 1) {
        const idx = start + Math.floor((px / width) * (span - 1));
        const v = (time[idx] - 128) / 128;
        const y = mid - v * scale;
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
    });
  }

  function findPeak(freqData, sampleRate) {
    if (!freqData) {
      peakHz = freq;
      peakBin = Math.max(1, Math.round((freq * FFT_SIZE) / sampleRate));
      return;
    }
    const binHz = sampleRate / FFT_SIZE;
    const topBin = Math.min(freqData.length, Math.ceil(SPECTRUM_TOP_HZ / binHz));
    let best = 0;
    let bestBin = 0;
    for (let i = 1; i < topBin; i += 1) {
      if (freqData[i] > best) {
        best = freqData[i];
        bestBin = i;
      }
    }
    const nextHz = best > 0 ? bestBin * binHz : freq;
    peakHz = lerp(peakHz || nextHz, nextHz, EASE);
    peakBin = bestBin || Math.max(1, Math.round((freq * FFT_SIZE) / sampleRate));
  }

  function fillMathBuffers() {
    const ratio = LISSAJOUS_RATIO[partials - 1] || 1;
    const norm = bankNorm(partials);
    const dt = 1 / SAMPLE_RATE;
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const t = signalTime + i * dt;
      let a = 0;
      let b = 0;
      for (let n = 1; n <= partials; n += 1) {
        const w = 1 / n;
        a += Math.sin(Math.PI * 2 * freq * n * t) * w;
        b += Math.sin(Math.PI * 2 * freq * ratio * n * t) * w;
      }
      mathTime[i] = clamp(Math.round(128 + 128 * amp * (a / norm)), 0, 255);
      mathTimeB[i] = clamp(Math.round(128 + 128 * amp * (b / norm)), 0, 255);
    }

    mathFreq.fill(0);
    const binHz = SAMPLE_RATE / FFT_SIZE;
    for (let n = 1; n <= partials; n += 1) {
      const hz = freq * n;
      const bin = hz / binHz;
      const level = 255 * amp * (1 / n / bankNorm(partials)) * 1.55;
      const i0 = Math.floor(bin);
      for (let i = i0 - 2; i <= i0 + 2; i += 1) {
        if (i <= 0 || i >= mathFreq.length) continue;
        const w = 1 - Math.abs(i - bin) / 2.2;
        if (w <= 0) continue;
        mathFreq[i] = clamp(Math.round(mathFreq[i] + level * w), 0, 255);
      }
    }
  }

  function drawSpectrum(freqData, sampleRate) {
    if (!freqData) return;
    const { width, height } = cssSize(traceCanvas);
    const binHz = sampleRate / FFT_SIZE;
    const maxBin = freqData.length - 1;
    const logLo = Math.log(SPECTRUM_LO_HZ);
    const logSpan = Math.log(SPECTRUM_HI_HZ) - logLo;
    const accent = cssVar("--accent", "#e2703a");
    const gap = 2;
    const barW = Math.max(1, width / SPECTRUM_BARS - gap);

    traceCtx.save();
    traceCtx.fillStyle = accent;
    traceCtx.shadowColor = accent;
    for (let b = 0; b < SPECTRUM_BARS; b += 1) {
      const fLo = Math.exp(logLo + (logSpan * b) / SPECTRUM_BARS);
      const fHi = Math.exp(logLo + (logSpan * (b + 1)) / SPECTRUM_BARS);
      const iLo = clamp(Math.round(fLo / binHz), 0, maxBin);
      const iHi = clamp(Math.max(iLo, Math.round(fHi / binHz) - 1), 0, maxBin);
      let level = 0;
      for (let i = iLo; i <= iHi; i += 1) level = Math.max(level, freqData[i]);
      const v = level / 255;
      // Leave headroom at the top so bars never collide with the readout.
      const h = Math.max(v > 0.01 ? 1.5 : 0, v * height * 0.78);
      if (h <= 0) continue;
      const x = (width / SPECTRUM_BARS) * b + gap / 2;
      traceCtx.globalAlpha = 0.28;
      traceCtx.shadowBlur = 10;
      traceCtx.fillRect(x, height - h, barW, h);
      traceCtx.globalAlpha = 0.95;
      traceCtx.shadowBlur = 0;
      traceCtx.fillRect(x, height - h, barW, h);
    }
    traceCtx.restore();
  }

  function drawLissajous(timeX, timeY) {
    if (!timeX || !timeY) return;
    const { width, height } = cssSize(traceCanvas);
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.42;
    const count = Math.min(timeX.length, timeY.length, 1024);
    strokeTrace((ctx) => {
      for (let i = 0; i < count; i += 1) {
        const x = cx + ((timeX[i] - 128) / 128) * scale;
        const y = cy - ((timeY[i] - 128) / 128) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
  }

  /* ----------------------------------------------------------- audio graph */

  function createAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    let ctx;
    try {
      ctx = new AudioCtx({ latencyHint: "interactive" });
    } catch {
      return null;
    }

    const ratio = LISSAJOUS_RATIO[partials - 1] || 1;
    const bankA = buildBank(ctx, freq, amp, partials, 1);
    const bankB = buildBank(ctx, freq, amp, partials, ratio);

    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = clamp(0.25 / (freq * ratio), 0, 0.09);

    const analyserA = ctx.createAnalyser();
    analyserA.fftSize = FFT_SIZE;
    analyserA.smoothingTimeConstant = 0.72;
    const analyserB = ctx.createAnalyser();
    analyserB.fftSize = FFT_SIZE;
    analyserB.smoothingTimeConstant = 0;

    // The only path to the speakers runs through a gain pinned at zero.
    const mute = ctx.createGain();
    mute.gain.value = 0;

    bankA.out.connect(analyserA);
    bankB.out.connect(delay);
    delay.connect(analyserB);
    analyserA.connect(mute);
    analyserB.connect(mute);
    mute.connect(ctx.destination);

    bankA.oscillators.forEach(({ osc }) => osc.start());
    bankB.oscillators.forEach(({ osc }) => osc.start());

    return {
      ctx,
      bankA,
      bankB,
      delay,
      analyserA,
      analyserB,
      time: new Uint8Array(analyserA.fftSize),
      timeB: new Uint8Array(analyserB.fftSize),
      freq: new Uint8Array(analyserA.frequencyBinCount),
    };
  }

  let pushedFreq = -1;
  let pushedAmp = -1;
  let pushedPartials = -1;

  function pushParams() {
    if (!audio) return;
    const settled =
      Math.abs(freq - pushedFreq) < 0.05 &&
      Math.abs(amp - pushedAmp) < 0.002 &&
      partials === pushedPartials;
    if (settled) return;
    pushedFreq = freq;
    pushedAmp = amp;
    pushedPartials = partials;
    const { ctx, bankA, bankB, delay } = audio;
    const now = ctx.currentTime;
    const ratio = LISSAJOUS_RATIO[partials - 1] || 1;
    const norm = bankNorm(partials);
    for (let i = 0; i < PARTIALS_MAX; i += 1) {
      const n = i + 1;
      const level = n <= partials ? 1 / n / norm : 0;
      bankA.oscillators[i].osc.frequency.setTargetAtTime(freq * n, now, 0.02);
      bankB.oscillators[i].osc.frequency.setTargetAtTime(freq * ratio * n, now, 0.02);
      bankA.oscillators[i].gain.gain.setTargetAtTime(level, now, 0.03);
      bankB.oscillators[i].gain.gain.setTargetAtTime(level, now, 0.03);
    }
    bankA.out.gain.setTargetAtTime(amp, now, 0.03);
    bankB.out.gain.setTargetAtTime(amp, now, 0.03);
    delay.delayTime.setTargetAtTime(clamp(0.25 / (freq * ratio), 0, 0.09), now, 0.03);
  }

  async function arm() {
    if (armed || armPending) return;
    armPending = true;
    if (!audio) audio = createAudio();
    if (!audio) {
      armPending = false;
      return;
    }
    try {
      if (audio.ctx.state !== "running") await audio.ctx.resume();
    } catch {
      /* blocked — stay cold */
    }
    armPending = false;
    armed = audio.ctx.state === "running";
    if (armed) {
      clearTrace();
      setState();
      syncLoop();
    }
  }

  /** Only touch an AudioContext once the browser has seen a real gesture. */
  function armOnGesture() {
    if (prefersReducedMotion()) return;
    arm();
  }

  function watchForActivation() {
    const activation = navigator.userActivation;
    if (activation && activation.hasBeenActive) {
      armOnGesture();
      return;
    }
    const opts = { passive: true };
    const once = () => {
      document.removeEventListener("pointerdown", once, opts);
      document.removeEventListener("keydown", once, opts);
      document.removeEventListener("touchstart", once, opts);
      armOnGesture();
    };
    document.addEventListener("pointerdown", once, opts);
    document.addEventListener("keydown", once, opts);
    document.addEventListener("touchstart", once, opts);
  }

  /* -------------------------------------------------------------- readouts */

  function setState() {
    if (!stateEl) return;
    const live = running || (!prefersReducedMotion() && onScreen);
    stateEl.textContent = prefersReducedMotion() ? "HOLD" : live ? "LIVE" : "IDLE";
    stateEl.classList.toggle("is-live", live && !prefersReducedMotion());
  }

  function writeReadout() {
    if (!readout) return;
    displayFreq = lerp(displayFreq, freq, EASE);
    displayAmp = lerp(displayAmp, amp, EASE);
    displayPeak = lerp(displayPeak, peakHz || freq, EASE);
    displayBin = Math.round(lerp(displayBin, peakBin || displayBin, EASE));
    const peak = `${Math.round(displayPeak)} Hz · B${Math.max(1, displayBin)}`;
    readout.textContent =
      `FREQ ${displayFreq.toFixed(1).padStart(5, " ")} Hz` +
      `   AMP ${displayAmp.toFixed(2)}` +
      `   HARM ${partials}` +
      `   PEAK ${peak}`;
  }

  function announce(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
  }

  /* ------------------------------------------------------------- cold path */

  const refreshCold = debounce(async () => {
    cold = await coldCapture({ freq, amp, partials });
    if (!armed) paintCold();
  }, 90);

  function paintCold() {
    clearTrace();
    if (cold) {
      findPeak(cold.freq, cold.sampleRate);
      if (mode === "SPECTRUM") drawSpectrum(cold.freq, cold.sampleRate);
      else if (mode === "LISSAJOUS") drawLissajous(cold.time, cold.timeB);
      else drawWaveform(cold.time);
    } else {
      fillMathBuffers();
      findPeak(mathFreq, SAMPLE_RATE);
      if (mode === "SPECTRUM") drawSpectrum(mathFreq, SAMPLE_RATE);
      else if (mode === "LISSAJOUS") drawLissajous(mathTime, mathTimeB);
      else drawWaveform(mathTime);
    }
    writeReadout();
    setState();
  }

  /* ------------------------------------------------------------- rAF frame */

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    signalTime += dt;

    freq = lerp(freq, targetFreq, EASE);
    amp = lerp(amp, targetAmp, EASE);
    pushParams();

    let time = mathTime;
    let timeB = mathTimeB;
    let freqData = mathFreq;
    let rate = SAMPLE_RATE;
    const useFft = armed && audio && audio.ctx.state === "running";
    if (useFft) {
      audio.analyserA.getByteTimeDomainData(audio.time);
      audio.analyserA.getByteFrequencyData(audio.freq);
      time = audio.time;
      freqData = audio.freq;
      rate = audio.ctx.sampleRate;
      if (mode === "LISSAJOUS") audio.analyserB.getByteTimeDomainData(audio.timeB);
      timeB = audio.timeB;
    } else {
      fillMathBuffers();
    }

    findPeak(freqData, rate);
    fadeTrace();

    if (mode === "SPECTRUM") drawSpectrum(freqData, rate);
    else if (mode === "LISSAJOUS") drawLissajous(time, timeB);
    else drawWaveform(time);

    writeReadout();
    setState();
  }

  function start() {
    if (running || !onScreen || document.hidden) return;
    if (prefersReducedMotion()) return;
    running = true;
    lastNow = 0;
    if (audio && audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
    raf = requestAnimationFrame(tick);
    setState();
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (audio && audio.ctx.state === "running") audio.ctx.suspend().catch(() => {});
    setState();
  }

  function syncLoop() {
    if (prefersReducedMotion()) {
      stop();
      refreshCold();
      return;
    }
    if (onScreen && !document.hidden) start();
    else stop();
  }

  /* --------------------------------------------------------------- controls */

  function setMode(next, { announceChange = true } = {}) {
    mode = MODES.includes(next) ? next : MODES[0];
    store.set(MODE_KEY, mode);
    if (modeLabel) modeLabel.textContent = mode;
    if (modeBtn) {
      modeBtn.setAttribute(
        "aria-label",
        `Visualisation mode: ${mode.toLowerCase()}. Activate to cycle modes.`
      );
    }
    frame.setAttribute("aria-label", `${describeMode()} ${CONTROL_HINT}`);
    peakHz = 0;
    peakBin = 0;
    clearTrace();
    if (!armed || prefersReducedMotion()) paintCold();
    if (announceChange) announce(`Mode ${mode.toLowerCase()}.`);
    if (!running && !prefersReducedMotion()) start();
  }

  function describeMode() {
    if (mode === "SPECTRUM") {
      return "Spectrum analyser: FFT bars of the generated harmonic series.";
    }
    if (mode === "LISSAJOUS") {
      return "Lissajous plot: the signal against a phase-shifted copy of itself.";
    }
    return "Oscilloscope trace of the generated waveform.";
  }

  function cycleMode() {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  function setPartials(next, { silent = false } = {}) {
    const clamped = clamp(Math.round(next), 1, PARTIALS_MAX);
    if (clamped === partials) return;
    partials = clamped;
    if (!silent) announce(`${partials} ${partials === 1 ? "partial" : "partials"}.`);
    writeReadout();
    if (!armed || prefersReducedMotion()) refreshCold();
  }

  function pointerToTargets(event) {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    targetFreq = lerp(FREQ_MIN, FREQ_MAX, x * x);
    targetAmp = lerp(AMP_MAX, AMP_MIN, y);
  }

  let dragId = null;
  let dragStartY = 0;
  let dragStartPartials = partials;

  frame.addEventListener("pointermove", (event) => {
    if (dragId !== null) {
      const dy = dragStartY - event.clientY;
      setPartials(dragStartPartials + dy / DRAG_PX_PER_PARTIAL, { silent: true });
      return;
    }
    pointerToTargets(event);
    if (prefersReducedMotion()) {
      freq = targetFreq;
      amp = targetAmp;
      refreshCold();
    }
  });

  frame.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragId = event.pointerId;
    dragStartY = event.clientY;
    dragStartPartials = partials;
    frame.setPointerCapture(event.pointerId);
    frame.classList.add("is-dragging");
  });

  function endDrag(event) {
    if (dragId === null) return;
    if (frame.hasPointerCapture(event.pointerId)) {
      frame.releasePointerCapture(event.pointerId);
    }
    dragId = null;
    frame.classList.remove("is-dragging");
    announce(`${partials} ${partials === 1 ? "partial" : "partials"}.`);
    if (!armed || prefersReducedMotion()) refreshCold();
  }

  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  frame.addEventListener("pointerleave", () => {
    if (dragId !== null) return;
    targetFreq = IDLE_FREQ;
    targetAmp = IDLE_AMP;
    if (prefersReducedMotion()) {
      freq = IDLE_FREQ;
      amp = IDLE_AMP;
      refreshCold();
    }
  });

  frame.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 1 : 0;
    let handled = true;
    switch (event.key) {
      case "ArrowRight":
        targetFreq = clamp(targetFreq * 1.09, FREQ_MIN, FREQ_MAX);
        break;
      case "ArrowLeft":
        targetFreq = clamp(targetFreq / 1.09, FREQ_MIN, FREQ_MAX);
        break;
      case "ArrowUp":
        if (step) setPartials(partials + 1);
        else targetAmp = clamp(targetAmp + 0.08, AMP_MIN, AMP_MAX);
        break;
      case "ArrowDown":
        if (step) setPartials(partials - 1);
        else targetAmp = clamp(targetAmp - 0.08, AMP_MIN, AMP_MAX);
        break;
      case "m":
      case "M":
        cycleMode();
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    if (!event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      announce(`Amplitude ${targetAmp.toFixed(2)}.`);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      announce(`Frequency ${Math.round(targetFreq)} hertz.`);
    }
    if (prefersReducedMotion()) {
      freq = targetFreq;
      amp = targetAmp;
      refreshCold();
    }
  });

  if (modeBtn) {
    modeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cycleMode();
    });
  }

  /* ------------------------------------------------------------ lifecycles */

  const resize = () => {
    const changedGrid = fitCanvas(gridCanvas, gridCtx);
    const changedTrace = fitCanvas(traceCanvas, traceCtx);
    if (changedGrid) paintGrid();
    if (changedTrace && (!armed || prefersReducedMotion())) paintCold();
  };

  const resizeDebounced = debounce(() => {
    resize();
    paintGrid();
  }, 90);

  const ro = new ResizeObserver(resizeDebounced);
  ro.observe(frame);

  let ioConfirmed = false;
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
      if (visible) ioConfirmed = true;
      // First paint is often a 0-height miss; keep running until we have
      // actually seen the scope on screen once.
      if (!ioConfirmed) return;
      onScreen = visible;
      syncLoop();
    },
    { threshold: 0, rootMargin: "80px" }
  );
  io.observe(host);

  document.addEventListener("visibilitychange", syncLoop);

  onReducedMotionChange(() => {
    if (prefersReducedMotion()) {
      stop();
      refreshCold();
    } else {
      watchForActivation();
      syncLoop();
    }
  });

  onThemeChange(() => {
    paintGrid();
    if (!armed || prefersReducedMotion()) paintCold();
  });

  /* ------------------------------------------------------------------ boot */

  traceCanvas.style.touchAction = "none";
  resize();
  paintGrid();
  setMode(mode, { announceChange: false });
  writeReadout();
  setState();
  if (prefersReducedMotion()) {
    fillMathBuffers();
    paintCold();
    coldCapture({ freq, amp, partials }).then((data) => {
      cold = data;
      if (prefersReducedMotion()) paintCold();
    });
  } else {
    watchForActivation();
    start();
  }
}
