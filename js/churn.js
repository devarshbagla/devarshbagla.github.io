/**
 * Interactive churn explorer.
 *
 * Logistic regression inference in plain JavaScript. The coefficients are
 * representative, not the trained weights from the IJSER paper — they are here
 * so the *shape* of the decision is explorable, and the copy in the markup says
 * so plainly.
 *
 *   logit = b0 + Σ βᵢ·zᵢ + contractOffset,  where zᵢ = (xᵢ − μᵢ) / σᵢ
 *   p     = 1 / (1 + e^−logit)
 *
 * The confusion-matrix tab scores a deterministic synthetic population with the
 * same model, so the precision/recall tradeoff shown is genuinely the tradeoff
 * of this model rather than a table of invented numbers.
 */

import { clamp, lerp, mulberry32, prefersReducedMotion, whenNear } from "./util.js";

const INTERCEPT = -1.05;

const FEATURES = [
  { key: "tenure", label: "TENURE", unit: "mo", mean: 32, sd: 18, beta: -0.62 },
  { key: "calls", label: "SUPPORT CALLS", unit: "", mean: 5, sd: 3, beta: 1.35 },
  { key: "delay", label: "PAYMENT DELAY", unit: "d", mean: 15, sd: 9, beta: 0.88 },
  { key: "spend", label: "TOTAL SPEND", unit: "", mean: 650, sd: 300, beta: -0.74 },
  { key: "recency", label: "LAST CONTACT", unit: "d", mean: 15, sd: 9, beta: 0.95 },
  { key: "usage", label: "USAGE FREQ", unit: "/mo", mean: 16, sd: 9, beta: -0.41 },
];

const CONTRACT_BETA = { monthly: 1.1, quarterly: -0.15, annual: -0.85 };
const CONTRACT_LABEL = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };

const POPULATION_SIZE = 2000;
const POPULATION_SEED = 20251013;
const HIST_BINS = 26;

const NS = "http://www.w3.org/2000/svg";

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function contributions(values, contract) {
  const rows = FEATURES.map((f) => ({
    label: f.label,
    value: f.beta * ((values[f.key] - f.mean) / f.sd),
  }));
  rows.push({ label: "CONTRACT", value: CONTRACT_BETA[contract] ?? 0 });
  return rows;
}

function predict(values, contract) {
  const rows = contributions(values, contract);
  const logit = rows.reduce((sum, row) => sum + row.value, INTERCEPT);
  return { logit, p: sigmoid(logit), rows };
}

/** Deterministic synthetic sample: features drawn, labels drawn from the model. */
function buildPopulation() {
  const rand = mulberry32(POPULATION_SEED);
  const gauss = () => {
    // Box–Muller, clipped so no sample sits absurdly far from the mean.
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return clamp(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), -2.6, 2.6);
  };
  const contracts = Object.keys(CONTRACT_BETA);
  const rows = [];
  for (let i = 0; i < POPULATION_SIZE; i += 1) {
    const values = {};
    FEATURES.forEach((f) => {
      values[f.key] = f.mean + gauss() * f.sd;
    });
    const contract = contracts[Math.floor(rand() * contracts.length)];
    const { p } = predict(values, contract);
    rows.push({ score: p, actual: rand() < p ? 1 : 0 });
  }
  return rows;
}

function confusion(population, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of population) {
    const predicted = row.score >= threshold;
    if (row.actual === 1) {
      if (predicted) tp += 1;
      else fn += 1;
    } else if (predicted) fp += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const accuracy = (tp + tn) / population.length;
  return { tp, fp, tn, fn, precision, recall, f1, accuracy };
}

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initChurn(root = document) {
  const host = root.querySelector("[data-churn]");
  if (!host) return;
  whenNear(host, () => mountChurn(host));
}

function mountChurn(host) {
  const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  const inputs = Array.from(host.querySelectorAll("[data-churn-input]"));
  const contractSel = host.querySelector("[data-churn-contract]");
  const gaugeHost = host.querySelector("[data-churn-gauge]");
  const logitEl = host.querySelector("[data-churn-logit]");
  const contribList = host.querySelector("[data-churn-contrib]");
  const statusEl = host.querySelector("[data-churn-status]");

  const thresholdInput = host.querySelector("[data-churn-threshold]");
  const thresholdOut = host.querySelector("[data-churn-threshold-out]");
  const histHost = host.querySelector("[data-churn-hist]");
  const matrixHost = host.querySelector("[data-churn-matrix]");
  const tradeoffEl = host.querySelector("[data-churn-tradeoff]");
  const matrixStatus = host.querySelector("[data-churn-matrix-status]");

  /* ------------------------------------------------------------------ tabs */

  function selectTab(index, { focus = true } = {}) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.classList.toggle("is-active", active);
      if (active) tab.removeAttribute("tabindex");
      else tab.setAttribute("tabindex", "-1");
      if (panels[i]) panels[i].hidden = !active;
    });
    if (focus && tabs[index]) tabs[index].focus();
    if (index === 1) drawMatrixTab();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(i, { focus: false }));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      selectTab(next);
    });
  });

  /* ---------------------------------------------------------------- gauge */

  const GAUGE_R = 82;
  const ARC_LEN = Math.PI * GAUGE_R;

  const gaugeSvg = el("svg", {
    viewBox: "0 0 200 128",
    class: "gauge",
    role: "img",
    "aria-label": "Predicted churn probability gauge.",
  });
  const arcPath = `M ${100 - GAUGE_R} 104 A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${100 + GAUGE_R} 104`;
  gaugeSvg.appendChild(el("path", { d: arcPath, class: "gauge__track", fill: "none" }));
  const gaugeValue = el("path", {
    d: arcPath,
    class: "gauge__value",
    fill: "none",
    "stroke-dasharray": ARC_LEN,
    "stroke-dashoffset": ARC_LEN,
  });
  gaugeSvg.appendChild(gaugeValue);
  for (let t = 0; t <= 4; t += 1) {
    const angle = Math.PI - (Math.PI * t) / 4;
    const x1 = 100 + Math.cos(angle) * (GAUGE_R - 12);
    const y1 = 104 - Math.sin(angle) * (GAUGE_R - 12);
    const x2 = 100 + Math.cos(angle) * (GAUGE_R - 19);
    const y2 = 104 - Math.sin(angle) * (GAUGE_R - 19);
    gaugeSvg.appendChild(el("line", { x1, y1, x2, y2, class: "gauge__tick" }));
  }
  // A marker riding the arc reads more cleanly than a needle through the number.
  const marker = el("circle", { cx: 18, cy: 104, r: 5, class: "gauge__marker" });
  gaugeSvg.appendChild(marker);
  const gaugeNumber = el("text", {
    x: 100, y: 86, "text-anchor": "middle", class: "gauge__number",
  }, "—");
  gaugeSvg.appendChild(gaugeNumber);
  gaugeSvg.appendChild(
    el("text", { x: 100, y: 101, "text-anchor": "middle", class: "gauge__caption" }, "CHURN RISK")
  );
  gaugeSvg.appendChild(el("text", { x: 18, y: 120, "text-anchor": "middle", class: "gauge__tick-label" }, "0"));
  gaugeSvg.appendChild(el("text", { x: 182, y: 120, "text-anchor": "middle", class: "gauge__tick-label" }, "1"));
  if (gaugeHost) gaugeHost.replaceChildren(gaugeSvg);

  let shownP = 0;
  let targetP = 0;
  let gaugeRaf = 0;

  function riskClass(p) {
    if (p < 0.34) return "is-low";
    if (p < 0.66) return "is-mid";
    return "is-high";
  }

  function paintGauge(p) {
    gaugeValue.setAttribute("stroke-dashoffset", String(ARC_LEN * (1 - p)));
    const angle = Math.PI - Math.PI * p;
    marker.setAttribute("cx", String(100 + Math.cos(angle) * GAUGE_R));
    marker.setAttribute("cy", String(104 - Math.sin(angle) * GAUGE_R));
    gaugeNumber.textContent = `${(p * 100).toFixed(1)}%`;
    gaugeSvg.classList.remove("is-low", "is-mid", "is-high");
    gaugeSvg.classList.add(riskClass(p));
  }

  function animateGauge() {
    gaugeRaf = 0;
    shownP = lerp(shownP, targetP, 0.18);
    if (Math.abs(shownP - targetP) < 0.0015) shownP = targetP;
    paintGauge(shownP);
    if (shownP !== targetP) gaugeRaf = requestAnimationFrame(animateGauge);
  }

  function setGauge(p) {
    targetP = p;
    if (prefersReducedMotion()) {
      shownP = p;
      paintGauge(p);
      return;
    }
    if (!gaugeRaf) gaugeRaf = requestAnimationFrame(animateGauge);
  }

  /* ------------------------------------------------------------ predictor */

  function readValues() {
    const values = {};
    inputs.forEach((input) => {
      values[input.dataset.churnInput] = Number(input.value);
    });
    return values;
  }

  function formatInput(input) {
    const key = input.dataset.churnInput;
    const feature = FEATURES.find((f) => f.key === key);
    const value = Number(input.value);
    const unit = feature && feature.unit ? ` ${feature.unit}` : "";
    return { text: `${value}${unit}`, spoken: `${feature.label.toLowerCase()} ${value}${unit}` };
  }

  function paintContributions(rows) {
    if (!contribList) return;
    const sorted = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const max = Math.max(...sorted.map((r) => Math.abs(r.value)), 0.001);
    contribList.replaceChildren(
      ...sorted.map((row) => {
        const li = document.createElement("li");
        li.className = `contrib__row ${row.value >= 0 ? "is-up" : "is-down"}`;

        const name = document.createElement("span");
        name.className = "contrib__label";
        name.textContent = row.label;

        const track = document.createElement("span");
        track.className = "contrib__track";
        const bar = document.createElement("span");
        bar.className = "contrib__bar";
        bar.style.width = `${(Math.abs(row.value) / max) * 100}%`;
        track.appendChild(bar);

        const value = document.createElement("span");
        value.className = "contrib__value";
        value.textContent = `${row.value >= 0 ? "+" : "−"}${Math.abs(row.value).toFixed(2)}`;

        li.append(name, track, value);
        return li;
      })
    );
  }

  function updatePredictor({ announce = false, source = "" } = {}) {
    const values = readValues();
    const contract = contractSel ? contractSel.value : "monthly";
    inputs.forEach((input) => {
      const { text, spoken } = formatInput(input);
      const out = host.querySelector(`[data-churn-out="${input.dataset.churnInput}"]`);
      if (out) out.textContent = text;
      input.setAttribute("aria-valuetext", spoken);
      const min = Number(input.min);
      const max = Number(input.max);
      input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
    });

    const { p, logit, rows } = predict(values, contract);
    setGauge(p);
    paintContributions(rows);
    if (logitEl) {
      logitEl.textContent =
        `LOG-ODDS ${logit >= 0 ? "+" : "−"}${Math.abs(logit).toFixed(2)}` +
        `   ·   CONTRACT ${CONTRACT_LABEL[contract].toUpperCase()}`;
    }
    gaugeSvg.setAttribute(
      "aria-label",
      `Predicted churn probability ${(p * 100).toFixed(1)} percent.`
    );
    if (announce && statusEl) {
      statusEl.textContent = `${source} Churn probability ${(p * 100).toFixed(1)} percent.`;
    }
  }

  inputs.forEach((input) => {
    input.addEventListener("input", () => updatePredictor());
    input.addEventListener("change", () =>
      updatePredictor({ announce: true, source: `${formatInput(input).spoken}.` })
    );
  });
  if (contractSel) {
    contractSel.addEventListener("change", () =>
      updatePredictor({
        announce: true,
        source: `Contract ${CONTRACT_LABEL[contractSel.value].toLowerCase()}.`,
      })
    );
  }

  /* ------------------------------------------------------- confusion tab */

  let population = null;
  let histogram = null;

  function ensurePopulation() {
    if (population) return;
    population = buildPopulation();
    histogram = { churn: new Array(HIST_BINS).fill(0), stay: new Array(HIST_BINS).fill(0) };
    for (const row of population) {
      const bin = clamp(Math.floor(row.score * HIST_BINS), 0, HIST_BINS - 1);
      if (row.actual === 1) histogram.churn[bin] += 1;
      else histogram.stay[bin] += 1;
    }
  }

  function drawHistogram(threshold) {
    if (!histHost || !histogram) return;
    const width = 320;
    const height = 104;
    const mid = height / 2;
    const slot = width / HIST_BINS;
    // Each class is scaled to its own peak; the two groups are very different
    // sizes and a shared scale flattens the churners into nothing.
    const stayPeak = Math.max(...histogram.stay, 1);
    const churnPeak = Math.max(...histogram.churn, 1);

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "hist",
      role: "img",
      "aria-label":
        "Model score distribution. Customers who stayed are drawn above the axis and " +
        "customers who churned below it, each scaled to its own peak, with the current " +
        "decision threshold marked.",
    });

    for (let b = 0; b < HIST_BINS; b += 1) {
      const x = b * slot + 0.5;
      const w = Math.max(1, slot - 1);
      const stayH = (histogram.stay[b] / stayPeak) * (mid - 10);
      const churnH = (histogram.churn[b] / churnPeak) * (mid - 10);
      if (stayH > 0) {
        svg.appendChild(el("rect", { x, y: mid - stayH, width: w, height: stayH, class: "hist__stay" }));
      }
      if (churnH > 0) {
        svg.appendChild(el("rect", { x, y: mid, width: w, height: churnH, class: "hist__churn" }));
      }
    }

    svg.appendChild(el("line", { x1: 0, y1: mid, x2: width, y2: mid, class: "hist__axis" }));
    svg.appendChild(el("text", { x: 2, y: 8, class: "hist__label" }, "STAYED"));
    svg.appendChild(el("text", { x: 2, y: height - 2, class: "hist__label" }, "CHURNED"));
    svg.appendChild(
      el("text", { x: width - 2, y: height - 2, "text-anchor": "end", class: "hist__label" }, "SCORE 0 → 1")
    );

    const tx = threshold * width;
    svg.appendChild(el("line", { x1: tx, y1: 0, x2: tx, y2: height, class: "hist__threshold" }));
    histHost.replaceChildren(svg);
  }

  function drawMatrix(stats) {
    if (!matrixHost) return;
    const width = 320;
    const height = 190;
    const left = 74;
    const top = 34;
    const cellW = (width - left - 4) / 2;
    const cellH = (height - top - 4) / 2;
    const peak = Math.max(stats.tp, stats.fp, stats.tn, stats.fn, 1);

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "matrix",
      role: "img",
      "aria-label":
        `Confusion matrix. True positives ${stats.tp}, false negatives ${stats.fn}, ` +
        `false positives ${stats.fp}, true negatives ${stats.tn}.`,
    });

    svg.appendChild(el("text", { x: left + cellW / 2, y: 12, "text-anchor": "middle", class: "matrix__head" }, "PRED CHURN"));
    svg.appendChild(el("text", { x: left + cellW * 1.5, y: 12, "text-anchor": "middle", class: "matrix__head" }, "PRED STAY"));
    svg.appendChild(el("text", { x: left - 8, y: top + cellH / 2, "text-anchor": "end", class: "matrix__head" }, "ACTUAL CHURN"));
    svg.appendChild(el("text", { x: left - 8, y: top + cellH * 1.5, "text-anchor": "end", class: "matrix__head" }, "ACTUAL STAY"));

    const cells = [
      { key: "tp", label: "TP", value: stats.tp, col: 0, row: 0, good: true },
      { key: "fn", label: "FN", value: stats.fn, col: 1, row: 0, good: false },
      { key: "fp", label: "FP", value: stats.fp, col: 0, row: 1, good: false },
      { key: "tn", label: "TN", value: stats.tn, col: 1, row: 1, good: true },
    ];

    cells.forEach((cell) => {
      const x = left + cell.col * cellW + 2;
      const y = top + cell.row * cellH + 2;
      const g = el("g", { class: `matrix__cell ${cell.good ? "is-good" : "is-bad"}` });
      g.appendChild(
        el("rect", {
          x, y, width: cellW - 4, height: cellH - 4, rx: 2,
          class: "matrix__fill",
          "fill-opacity": (0.08 + (cell.value / peak) * 0.42).toFixed(3),
        })
      );
      g.appendChild(el("text", { x: x + 10, y: y + 18, class: "matrix__tag" }, cell.label));
      g.appendChild(
        el("text", {
          x: x + (cellW - 4) / 2, y: y + cellH / 2 + 10,
          "text-anchor": "middle", class: "matrix__count",
        }, String(cell.value))
      );
      svg.appendChild(g);
    });

    matrixHost.replaceChildren(svg);
  }

  function pct(n) {
    return `${(n * 100).toFixed(1)}%`;
  }

  function drawMatrixTab({ announce = false } = {}) {
    ensurePopulation();
    const threshold = thresholdInput ? Number(thresholdInput.value) : 0.5;
    if (thresholdOut) thresholdOut.textContent = threshold.toFixed(2);
    if (thresholdInput) {
      thresholdInput.setAttribute("aria-valuetext", `decision threshold ${threshold.toFixed(2)}`);
      thresholdInput.style.setProperty("--fill", `${threshold * 100}%`);
    }

    const stats = confusion(population, threshold);
    drawHistogram(threshold);
    drawMatrix(stats);

    const set = (key, value) => {
      const node = host.querySelector(`[data-churn-metric="${key}"]`);
      if (node) node.textContent = value;
    };
    set("precision", pct(stats.precision));
    set("recall", pct(stats.recall));
    set("f1", pct(stats.f1));
    set("accuracy", pct(stats.accuracy));

    if (tradeoffEl) {
      tradeoffEl.textContent =
        threshold <= 0.02
          ? "Flag everyone: recall is perfect and precision collapses to the base rate."
          : threshold >= 0.98
            ? "Flag almost nobody: the few flags are mostly right, and nearly every churner is missed."
            : `At ${threshold.toFixed(2)} you catch ${stats.tp} of ${stats.tp + stats.fn} churners ` +
              `and wrongly chase ${stats.fp} customers who were never leaving.`;
    }

    if (announce && matrixStatus) {
      matrixStatus.textContent =
        `Threshold ${threshold.toFixed(2)}. Precision ${pct(stats.precision)}, ` +
        `recall ${pct(stats.recall)}, F1 ${pct(stats.f1)}.`;
    }
  }

  if (thresholdInput) {
    thresholdInput.addEventListener("input", () => drawMatrixTab());
    thresholdInput.addEventListener("change", () => drawMatrixTab({ announce: true }));
  }

  window.addEventListener("resize", () => {
    if (panels[1] && !panels[1].hidden) drawMatrixTab();
  });

  updatePredictor();
  paintGauge(0);
  setGauge(predict(readValues(), contractSel ? contractSel.value : "monthly").p);
}
