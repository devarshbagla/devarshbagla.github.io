/**
 * Workbench loop — SVG cycle with hover/focus captions and dashed arrow motion.
 */

const NODES = [
  {
    id: "sketch",
    label: "SKETCH",
    caption: "Observational drawing. I can record a form accurately from life.",
  },
  {
    id: "cad",
    label: "CAD",
    caption: "Learning now. The missing link between the sketch and the part.",
  },
  {
    id: "print",
    label: "3D PRINT",
    caption: "Certified on Prusa Mini+ at the Brandeis MakerLab.",
  },
  {
    id: "solder",
    label: "SOLDER",
    caption: "Hands-on. Most CS students have never held an iron.",
  },
  {
    id: "program",
    label: "PROGRAM",
    caption:
      "ESP32 and WLED for anything that needs to light up, move or sense.",
  },
  {
    id: "test",
    label: "TEST",
    caption:
      "I like breaking things more than building them. It is the same skill.",
  },
];

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function initWorkbench(root = document) {
  const host = root.querySelector("[data-workbench]");
  if (!host) return;

  const svgHost = host.querySelector("[data-workbench-svg]");
  const caption = host.querySelector("[data-workbench-caption]");
  if (!svgHost) return;

  const size = 520;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 168;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const points = NODES.map((node, i) => {
    const angle = (360 / NODES.length) * i;
    return { ...node, ...polar(cx, cy, radius, angle), angle };
  });

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "group");
  svg.setAttribute(
    "aria-label",
    "Build loop: Sketch, CAD, 3D Print, Solder, Program, Test"
  );
  svg.classList.add("workbench__svg");

  const arrows = document.createElementNS(NS, "g");
  arrows.classList.add("workbench__arrows");
  if (!reduced) arrows.classList.add("is-animated");

  points.forEach((from, i) => {
    const to = points[(i + 1) % points.length];
    const midAngle =
      (from.angle + (((to.angle - from.angle + 360) % 360) / 2)) % 360;
    const mid = polar(cx, cy, radius, midAngle);
    const path = document.createElementNS(NS, "path");
    path.setAttribute(
      "d",
      `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`
    );
    path.setAttribute("class", "workbench__arrow");
    path.setAttribute("fill", "none");
    arrows.appendChild(path);
  });
  svg.appendChild(arrows);

  const nodeEls = [];

  function setActive(id) {
    nodeEls.forEach((el) => {
      const active = el.dataset.nodeId === id;
      el.classList.toggle("is-active", active);
      el.classList.toggle("is-dimmed", Boolean(id) && !active);
      el.setAttribute("aria-pressed", active ? "true" : "false");
    });
    svg.classList.toggle("has-active", Boolean(id));
    if (caption) {
      const node = NODES.find((n) => n.id === id);
      caption.textContent = node
        ? node.caption
        : "Hover or focus a node to read the caption.";
    }
  }

  points.forEach((node) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "workbench__node");
    g.dataset.nodeId = node.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${node.label}. ${node.caption}`);
    g.setAttribute("aria-pressed", "false");

    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", String(node.x));
    circle.setAttribute("cy", String(node.y));
    circle.setAttribute("r", "42");
    circle.setAttribute("class", "workbench__node-disk");
    g.appendChild(circle);

    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(node.x));
    text.setAttribute("y", String(node.y + 1));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "workbench__node-label");
    text.textContent = node.label;
    g.appendChild(text);

    g.addEventListener("mouseenter", () => setActive(node.id));
    g.addEventListener("mouseleave", () => {
      if (document.activeElement !== g) setActive(null);
    });
    g.addEventListener("focus", () => setActive(node.id));
    g.addEventListener("blur", () => setActive(null));
    g.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(node.id);
      }
    });

    svg.appendChild(g);
    nodeEls.push(g);
  });

  svgHost.replaceChildren(svg);
  if (caption) {
    caption.textContent = "Hover or focus a node to read the caption.";
  }
}
