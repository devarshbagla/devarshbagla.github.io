/**
 * Research metrics chart — pure SVG, no chart library.
 * Horizontal grouped bars by metric; animate once on scroll into view.
 */

const METRICS = ["Accuracy", "Precision", "Recall", "F1", "ROC-AUC"];
const AXIS_MIN = 70;
const AXIS_MAX = 100;

const MODELS = [
  {
    name: "Logistic Regression",
    colorVar: "--ink-muted",
    values: {
      Accuracy: 83.6,
      Precision: 81.9,
      Recall: 77.2,
      F1: 79.5,
      "ROC-AUC": 84.3,
    },
  },
  {
    name: "Random Forest",
    colorVar: "--cool",
    values: {
      Accuracy: 90.3,
      Precision: 88.7,
      Recall: 87.9,
      F1: 88.1,
      "ROC-AUC": 91.8,
    },
  },
  {
    name: "Deep Neural Network",
    colorVar: "--accent",
    values: {
      Accuracy: 94.1,
      Precision: 93.2,
      Recall: 91.4,
      F1: 92.3,
      "ROC-AUC": 95.7,
    },
  },
];

function readColor(varName) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(varName).trim() ||
    "#888888"
  );
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function debounce(fn, wait) {
  let id = 0;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...args), wait);
  };
}

export function initResearchChart(root = document) {
  const host = root.querySelector("[data-research-chart]");
  if (!host) return;

  const mount = host.querySelector("[data-research-chart-host]");
  const frame = host.querySelector("[data-research-chart-frame]");
  const tooltip = host.querySelector("[data-research-chart-tooltip]");
  if (!mount || !frame) return;

  let hasAnimated = false;
  let barNodes = [];

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.textContent = "";
  }

  function showTooltip(barEl, text) {
    if (!tooltip) return;
    const frameRect = frame.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.textContent = text;

    const tipW = tooltip.offsetWidth || 120;
    const tipH = tooltip.offsetHeight || 28;
    let left = barRect.left - frameRect.left + barRect.width / 2 - tipW / 2;
    let top = barRect.top - frameRect.top - tipH - 8;
    left = Math.max(4, Math.min(left, frameRect.width - tipW - 4));
    if (top < 4) top = barRect.bottom - frameRect.top + 8;
    tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function draw(animate) {
    const width = Math.max(280, Math.floor(mount.clientWidth || frame.clientWidth || 640));
    const pad = { top: 12, right: 20, bottom: 22, left: 92 };
    const groupGap = 20;
    const barH = 11;
    const barGap = 5;
    const groupH = MODELS.length * barH + (MODELS.length - 1) * barGap;
    const height =
      pad.top + pad.bottom + METRICS.length * groupH + (METRICS.length - 1) * groupGap;

    const plotW = width - pad.left - pad.right;
    const toX = (v) => ((v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * plotW;

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(height));
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Grouped bar chart comparing Logistic Regression, Random Forest, and Deep Neural Network across Accuracy, Precision, Recall, F1, and ROC-AUC. Axis begins at 70."
    );
    svg.classList.add("research-chart__svg");

    for (const tick of [70, 80, 90, 100]) {
      const x = pad.left + toX(tick);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(x));
      line.setAttribute("x2", String(x));
      line.setAttribute("y1", String(pad.top - 4));
      line.setAttribute("y2", String(height - pad.bottom));
      line.setAttribute("class", "research-chart__grid");
      svg.appendChild(line);

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(height - 6));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "research-chart__tick");
      label.textContent = String(tick);
      svg.appendChild(label);
    }

    barNodes = [];
    let stagger = 0;
    const doAnimate = Boolean(animate) && !reducedMotion();

    METRICS.forEach((metric, mi) => {
      const groupY = pad.top + mi * (groupH + groupGap);

      const metricLabel = document.createElementNS(NS, "text");
      metricLabel.setAttribute("x", String(pad.left - 12));
      metricLabel.setAttribute("y", String(groupY + groupH / 2 + 4));
      metricLabel.setAttribute("text-anchor", "end");
      metricLabel.setAttribute("class", "research-chart__metric");
      metricLabel.textContent = metric;
      svg.appendChild(metricLabel);

      MODELS.forEach((model, bi) => {
        const value = model.values[metric];
        const y = groupY + bi * (barH + barGap);
        const fullW = Math.max(0, toX(value));
        const color = readColor(model.colorVar);

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", String(pad.left));
        rect.setAttribute("y", String(y));
        rect.setAttribute("height", String(barH));
        rect.setAttribute("rx", "1.5");
        rect.setAttribute("ry", "1.5");
        rect.setAttribute("fill", color);
        rect.setAttribute("class", "research-chart__bar");
        rect.setAttribute("role", "img");
        rect.setAttribute("tabindex", "0");
        rect.setAttribute(
          "aria-label",
          `${model.name}, ${metric}, ${value} percent`
        );
        rect.dataset.tip = `${model.name} · ${metric} · ${value}%`;
        rect.dataset.targetWidth = String(fullW);

        if (doAnimate) {
          rect.setAttribute("width", "0");
          rect.style.transition = `width 720ms cubic-bezier(0.22, 1, 0.36, 1) ${stagger * 48}ms`;
        } else {
          rect.setAttribute("width", String(fullW));
        }

        rect.addEventListener("mouseenter", () => showTooltip(rect, rect.dataset.tip));
        rect.addEventListener("mouseleave", hideTooltip);
        rect.addEventListener("focus", () => showTooltip(rect, rect.dataset.tip));
        rect.addEventListener("blur", hideTooltip);

        svg.appendChild(rect);
        barNodes.push(rect);
        stagger += 1;
      });
    });

    mount.replaceChildren(svg);
    hideTooltip();

    if (doAnimate) {
      void svg.getBoundingClientRect();
      requestAnimationFrame(() => {
        barNodes.forEach((bar) => {
          bar.setAttribute("width", bar.dataset.targetWidth);
        });
      });
    }
  }

  draw(false);

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || hasAnimated) continue;
        hasAnimated = true;
        draw(true);
        io.disconnect();
      }
    },
    { threshold: 0.35 }
  );
  io.observe(host);

  window.addEventListener(
    "resize",
    debounce(() => draw(false), 140)
  );

  const mo = new MutationObserver(() => draw(false));
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
