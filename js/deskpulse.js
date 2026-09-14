/**
 * DeskPulse live demo — Web Audio haptic burst through laptop speakers.
 * Lazy AudioContext (gesture-gated), three 55Hz envelope bursts, envelope canvas,
 * mute control, graceful fallback. Audio still plays under prefers-reduced-motion.
 */

const BURST_COUNT = 3;
const BURST_GAP_MS = 90;
const ATTACK_S = 0.008;
const DECAY_S = 0.18;
const FREQ_HZ = 55;
const FILTER_HZ = 120;
const PEAK_GAIN = 0.85;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cssAccent() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
    "#e2703a"
  );
}

export function initDeskPulse(root = document) {
  const host = root.querySelector("[data-deskpulse]");
  if (!host) return;

  const playBtn = host.querySelector("[data-deskpulse-play]");
  const muteBtn = host.querySelector("[data-deskpulse-mute]");
  const canvas = host.querySelector("[data-deskpulse-canvas]");
  const note = host.querySelector("[data-deskpulse-note]");
  if (!playBtn || !canvas) return;

  const ctx2d = canvas.getContext("2d");
  let audioCtx = null;
  let masterGain = null;
  let muted = false;
  let playing = false;
  let raf = 0;
  let envelope = []; // {t, v} samples in seconds from burst start
  let animStart = 0;
  let animDuration = 0;

  function setNote(text, isError = false) {
    if (!note) return;
    note.textContent = text;
    note.classList.toggle("is-error", isError);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawEnvelope(1);
  }

  function drawEnvelope(progress) {
    if (!ctx2d) return;
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx2d.clearRect(0, 0, w, h);

    // Baseline
    ctx2d.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--line")
      .trim() || "#2a2622";
    ctx2d.globalAlpha = 0.7;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, h - 0.5);
    ctx2d.lineTo(w, h - 0.5);
    ctx2d.stroke();

    if (!envelope.length || animDuration <= 0) {
      ctx2d.globalAlpha = 1;
      return;
    }

    const accent = cssAccent();
    ctx2d.globalAlpha = 1;
    ctx2d.strokeStyle = accent;
    ctx2d.fillStyle = accent;
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();

    const visibleT = Math.min(animDuration, progress * animDuration);
    let started = false;
    for (const sample of envelope) {
      if (sample.t > visibleT) break;
      const x = (sample.t / animDuration) * w;
      const y = h - sample.v * (h - 4) - 1;
      if (!started) {
        ctx2d.moveTo(x, y);
        started = true;
      } else {
        ctx2d.lineTo(x, y);
      }
    }
    if (started) {
      ctx2d.stroke();

      // Soft fill under the visible envelope
      ctx2d.beginPath();
      let fillStarted = false;
      for (const sample of envelope) {
        if (sample.t > visibleT) break;
        const x = (sample.t / animDuration) * w;
        const y = h - sample.v * (h - 4) - 1;
        if (!fillStarted) {
          ctx2d.moveTo(x, h);
          ctx2d.lineTo(x, y);
          fillStarted = true;
        } else {
          ctx2d.lineTo(x, y);
        }
      }
      if (fillStarted) {
        ctx2d.lineTo((visibleT / animDuration) * w, h);
        ctx2d.closePath();
        ctx2d.globalAlpha = 0.15;
        ctx2d.fill();
        ctx2d.globalAlpha = 1;
      }
    }
  }

  function buildEnvelopeTimeline() {
    const samples = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      const start = (i * BURST_GAP_MS) / 1000;
      // Attack
      samples.push({ t: start, v: 0 });
      samples.push({ t: start + ATTACK_S, v: 1 });
      // Decay
      samples.push({ t: start + ATTACK_S + DECAY_S, v: 0 });
      // Flat between bursts
      if (i < BURST_COUNT - 1) {
        samples.push({ t: start + BURST_GAP_MS / 1000, v: 0 });
      }
    }
    envelope = samples;
    animDuration =
      ((BURST_COUNT - 1) * BURST_GAP_MS) / 1000 + ATTACK_S + DECAY_S + 0.05;
  }

  function animateEnvelope(now) {
    if (!playing) return;
    const elapsed = (now - animStart) / 1000;
    const progress = Math.min(1, elapsed / animDuration);
    if (!prefersReducedMotion()) {
      drawEnvelope(progress);
    } else {
      // Static final envelope frame under reduced motion
      drawEnvelope(1);
    }
    if (progress < 1) {
      raf = requestAnimationFrame(animateEnvelope);
    } else {
      playing = false;
      playBtn.disabled = false;
    }
  }

  async function ensureAudio() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      throw new Error("Web Audio is not supported in this browser.");
    }
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  }

  function scheduleBurst(ctx, when) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = FREQ_HZ;

    filter.type = "lowpass";
    filter.frequency.value = FILTER_HZ;
    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, when + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + ATTACK_S + DECAY_S);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(when);
    osc.stop(when + ATTACK_S + DECAY_S + 0.02);
  }

  async function play() {
    if (playing) return;
    playBtn.disabled = true;

    try {
      const ctx = await ensureAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state !== "running") {
        throw new Error("AudioContext could not start. Check browser permissions.");
      }

      setNote(
        "Best on a laptop with the volume up. You should feel it more than hear it."
      );

      const startAt = ctx.currentTime + 0.02;
      for (let i = 0; i < BURST_COUNT; i++) {
        scheduleBurst(ctx, startAt + (i * BURST_GAP_MS) / 1000);
      }

      buildEnvelopeTimeline();
      playing = true;
      animStart = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(animateEnvelope);
    } catch (err) {
      playing = false;
      playBtn.disabled = false;
      const message =
        err && err.message
          ? err.message
          : "Could not start audio. Try another browser or check site permissions.";
      setNote(message, true);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.01);
    }
    if (muteBtn) {
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      muteBtn.setAttribute("aria-label", muted ? "Unmute DeskPulse demo" : "Mute DeskPulse demo");
      muteBtn.title = muted ? "Unmute" : "Mute";
      const onIcon = muteBtn.querySelector(".deskpulse__mute-on");
      const offIcon = muteBtn.querySelector(".deskpulse__mute-off");
      if (onIcon) onIcon.toggleAttribute("hidden", muted);
      if (offIcon) offIcon.toggleAttribute("hidden", !muted);
    }
  }

  playBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    play();
  });

  if (muteBtn) {
    muteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMute();
    });
  }

  resizeCanvas();
  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(canvas);

  // Retint idle canvas on theme change
  const mo = new MutationObserver(() => drawEnvelope(playing ? 1 : 1));
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
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
