/**
 * The build loop as a physics-lite graph.
 *
 * Six nodes sit on a circle and are held there by a spring. The pointer pushes
 * nearby nodes away, nodes push each other apart when they overlap, and any
 * node can be dragged and released to swing back. Edges are quadratic beziers
 * whose control point is bowed outward from the centre, so they flex as the
 * endpoints move. A pulse circuits the loop continuously along those same
 * paths. Pure SVG and one rAF loop — no library.
 */

import {
  clamp,
  prefersReducedMotion,
  onReducedMotionChange,
  whenNear,
} from "./util.js";

const NS = "http://www.w3.org/2000/svg";

const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = 168;
const NODE_R = 42;

const SPRING = 0.055;
const DAMPING = 0.86;
const POINTER_RADIUS = 155;
const POINTER_FORCE = 2.2;
const SEPARATION = NODE_R * 2 + 8;
const PULSE_LOOPS_PER_SECOND = 0.16;
const FLOAT_AMP = 5.5;
const FLOAT_SPEED = 0.55;

const NODES = [
  {
    id: "sketch",
    label: "SKETCH",
    caption: "Observational drawing. I can record a form accurately from life.",
    detail:
      "Three years of woodworking taught me to look at a form before cutting " +
      "it. Observational drawing is the same habit with a pencil.",
    links: [
      { href: "#project-deskpulse", label: "DeskPulse" },
      { href: "#project-casio-fx-cg50", label: "Casio fx-CG50 Replica" },
    ],
  },
  {
    id: "cad",
    label: "CAD",
    caption: "Learning now. The missing link between the sketch and the part.",
    detail:
      "The missing link, and the thing I am learning right now. Until it is " +
      "there I can only print what someone else designed.",
    links: [],
  },
  {
    id: "print",
    label: "3D PRINT",
    caption: "Certified on Prusa Mini+ at the Brandeis MakerLab.",
    detail: "Certified on the Prusa Mini+ at the Brandeis MakerLab.",
    links: [],
  },
  {
    id: "solder",
    label: "SOLDER",
    caption: "Hands-on. Most CS students have never held an iron.",
    detail:
      "Hands-on, mostly repair under time pressure. Most CS students have " +
      "never held an iron.",
    links: [{ href: "#teaching", label: "AV Squad, The Scindia School" }],
  },
  {
    id: "program",
    label: "PROGRAM",
    caption: "ESP32 and WLED for anything that needs to light up, move or sense.",
    detail:
      "ESP32 and WLED for anything that needs to light up, move or sense.",
    links: [
      { href: "#project-deskpulse", label: "DeskPulse" },
      { href: "#project-lizi", label: "LIZI" },
      { href: "#project-snapback", label: "SnapBack" },
      { href: "#project-desktop-task-manager", label: "Desktop Task Manager" },
      { href: "#project-chess-coach", label: "Chess Coach" },
    ],
  },
  {
    id: "test",
    label: "TEST",
    caption: "I like breaking things more than building them. It is the same skill.",
    detail:
      "I enjoy breaking things more than building them. It is the same skill " +
      "pointed the other way.",
    links: [
      { href: "#project-chess-coach", label: "Chess Coach" },
      { href: "#project-from-dust-to-zenith", label: "From Dust to Zenith" },
      { href: "#project-deskpulse", label: "DeskPulse" },
    ],
  },
];

function polar(angleDeg, radius = RADIUS) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

export function initWorkbench(root = document) {
  const host = root.querySelector("[data-workbench]");
  if (!host) return;
  whenNear(host, () => mountWorkbench(host));
}

function mountWorkbench(host) {
  const mount = host.querySelector("[data-workbench-svg]");
  const caption = host.querySelector("[data-workbench-caption]");
  const detailPanel = host.querySelector("[data-workbench-detail]");
  if (!mount) return;

  const idleCaption = caption ? caption.textContent.trim() : "";

  const bodies = NODES.map((node, i) => {
    const home = polar((360 / NODES.length) * i);
    return {
      ...node,
      home,
      x: home.x,
      y: home.y,
      vx: 0,
      vy: 0,
      phase: i * 1.17,
    };
  });

  const svg = svgEl("svg", {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    width: "100%",
    height: "100%",
    class: "workbench__svg",
    role: "group",
    "aria-label":
      "Build loop: Sketch, CAD, 3D Print, Solder, Program, Test. " +
      "Drag a node to move it, or press Enter to read its detail.",
  });

  const edgeLayer = svgEl("g", { class: "workbench__arrows" });
  const edges = bodies.map(() => {
    const path = svgEl("path", { class: "workbench__arrow", fill: "none" });
    edgeLayer.appendChild(path);
    return path;
  });
  svg.appendChild(edgeLayer);

  const pulse = svgEl("circle", { r: 4.5, class: "workbench__pulse" });
  const pulseGlow = svgEl("circle", { r: 9, class: "workbench__pulse-glow" });
  svg.appendChild(pulseGlow);
  svg.appendChild(pulse);

  const groups = bodies.map((body) => {
    const g = svgEl("g", {
      class: "workbench__node",
      tabindex: "0",
      role: "button",
      "aria-expanded": "false",
      "aria-label": `${body.label}. ${body.caption} Activate for detail.`,
    });
    g.dataset.nodeId = body.id;

    const disk = svgEl("circle", { r: NODE_R, class: "workbench__node-disk" });
    const text = svgEl("text", {
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      class: "workbench__node-label",
    });
    text.textContent = body.label;

    g.append(disk, text);
    svg.appendChild(g);
    return { g, disk, text, body };
  });

  mount.replaceChildren(svg);

  /* ------------------------------------------------------------- rendering */

  function edgePath(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let nx = mx - CENTER;
    let ny = my - CENTER;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const bow = span * 0.2;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${(mx + nx * bow).toFixed(1)} ${(my + ny * bow).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  let pulseProgress = 0;

  function render() {
    groups.forEach(({ disk, text, body }) => {
      disk.setAttribute("cx", body.x.toFixed(2));
      disk.setAttribute("cy", body.y.toFixed(2));
      text.setAttribute("x", body.x.toFixed(2));
      text.setAttribute("y", (body.y + 1).toFixed(2));
    });
    edges.forEach((path, i) => {
      path.setAttribute("d", edgePath(bodies[i], bodies[(i + 1) % bodies.length]));
    });
    placePulse();
  }

  function placePulse() {
    const count = edges.length;
    const scaled = pulseProgress * count;
    const index = Math.floor(scaled) % count;
    const t = scaled - Math.floor(scaled);
    const path = edges[index];
    let point;
    try {
      point = path.getPointAtLength(path.getTotalLength() * t);
    } catch {
      return;
    }
    pulse.setAttribute("cx", point.x.toFixed(2));
    pulse.setAttribute("cy", point.y.toFixed(2));
    pulseGlow.setAttribute("cx", point.x.toFixed(2));
    pulseGlow.setAttribute("cy", point.y.toFixed(2));
  }

  /* --------------------------------------------------------------- physics */

  let pointer = null;
  let dragging = null;
  let raf = 0;
  let running = false;
  let onScreen = true;
  let lastTime = 0;

  function step(now) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;

    const t = now / 1000;
    bodies.forEach((body) => {
      if (dragging === body) return;
      const floatX = Math.sin(t * FLOAT_SPEED + body.phase) * FLOAT_AMP;
      const floatY = Math.cos(t * (FLOAT_SPEED * 0.82) + body.phase * 1.35) * FLOAT_AMP;
      let ax = (body.home.x + floatX - body.x) * SPRING;
      let ay = (body.home.y + floatY - body.y) * SPRING;

      if (pointer) {
        const dx = body.x - pointer.x;
        const dy = body.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < POINTER_RADIUS && d > 0.01) {
          const force = (1 - d / POINTER_RADIUS) * POINTER_FORCE;
          ax += (dx / d) * force;
          ay += (dy / d) * force;
        }
      }

      bodies.forEach((other) => {
        if (other === body) return;
        const dx = body.x - other.x;
        const dy = body.y - other.y;
        const d = Math.hypot(dx, dy);
        if (d < SEPARATION && d > 0.01) {
          const force = (SEPARATION - d) * 0.028;
          ax += (dx / d) * force;
          ay += (dy / d) * force;
        }
      });

      body.vx = (body.vx + ax) * DAMPING;
      body.vy = (body.vy + ay) * DAMPING;
      body.x = clamp(body.x + body.vx, NODE_R + 2, SIZE - NODE_R - 2);
      body.y = clamp(body.y + body.vy, NODE_R + 2, SIZE - NODE_R - 2);
    });

    pulseProgress = (pulseProgress + dt * PULSE_LOOPS_PER_SECOND) % 1;
    render();
  }

  function start() {
    if (running || prefersReducedMotion() || !onScreen || document.hidden) return;
    running = true;
    lastTime = 0;
    raf = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function settle() {
    bodies.forEach((body) => {
      body.x = body.home.x;
      body.y = body.home.y;
      body.vx = 0;
      body.vy = 0;
    });
    render();
  }

  function sync() {
    if (prefersReducedMotion()) {
      stop();
      settle();
      svg.classList.add("is-static");
      return;
    }
    svg.classList.remove("is-static");
    if (onScreen && !document.hidden) start();
    else stop();
  }

  /* -------------------------------------------------------------- pointer */

  function toLocal(event) {
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return {
      x: ((event.clientX - box.left) / box.width) * SIZE,
      y: ((event.clientY - box.top) / box.height) * SIZE,
    };
  }

  svg.addEventListener("pointermove", (event) => {
    const local = toLocal(event);
    if (local) pointer = local;
  });

  svg.addEventListener("pointerleave", () => {
    if (!dragging) pointer = null;
  });

  // Drag is tracked on window rather than through setPointerCapture, because
  // capturing on an ancestor retargets the click and the detail panel dies.
  let dragOrigin = null;
  let dragMoved = false;

  function onDragMove(event) {
    if (!dragging) return;
    const local = toLocal(event);
    if (!local) return;
    pointer = local;
    if (dragOrigin && Math.hypot(local.x - dragOrigin.x, local.y - dragOrigin.y) > 5) {
      dragMoved = true;
    }
    dragging.x = clamp(local.x, NODE_R + 2, SIZE - NODE_R - 2);
    dragging.y = clamp(local.y, NODE_R + 2, SIZE - NODE_R - 2);
    dragging.vx = 0;
    dragging.vy = 0;
    if (!running) render();
  }

  function onDragEnd() {
    if (!dragging) return;
    groups.forEach(({ g }) => g.classList.remove("is-dragging"));
    dragging = null;
    dragOrigin = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (prefersReducedMotion()) settle();
  }

  groups.forEach(({ g, body }) => {
    g.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = body;
      dragMoved = false;
      dragOrigin = toLocal(event);
      g.classList.add("is-dragging");
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
      window.addEventListener("pointercancel", onDragEnd);
    });

    g.addEventListener("mouseenter", () => setActive(body.id));
    g.addEventListener("mouseleave", () => {
      if (document.activeElement !== g) setActive(openId);
    });
    g.addEventListener("focus", () => setActive(body.id));
    g.addEventListener("blur", () => setActive(openId));

    g.addEventListener("click", () => {
      if (dragMoved) return;
      toggleDetail(body.id);
    });

    g.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleDetail(body.id);
        return;
      }
      const index = bodies.indexOf(body);
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = (index + 1) % bodies.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = (index - 1 + bodies.length) % bodies.length;
      }
      if (next === null) return;
      event.preventDefault();
      groups[next].g.focus();
    });
  });

  /* ---------------------------------------------------------------- detail */

  let openId = null;

  function setActive(id) {
    groups.forEach(({ g, body }) => {
      const active = body.id === id;
      g.classList.toggle("is-active", active);
      g.classList.toggle("is-dimmed", Boolean(id) && !active);
    });
    svg.classList.toggle("has-active", Boolean(id));
    edges.forEach((path, i) => {
      const a = bodies[i].id;
      const b = bodies[(i + 1) % bodies.length].id;
      path.classList.toggle("is-lit", Boolean(id) && (a === id || b === id));
    });
    if (!caption) return;
    const node = NODES.find((n) => n.id === id);
    caption.textContent = node ? node.caption : idleCaption;
  }

  function closeDetail({ restoreFocus = false } = {}) {
    if (!detailPanel || !openId) return;
    const previous = openId;
    openId = null;
    detailPanel.hidden = true;
    detailPanel.replaceChildren();
    groups.forEach(({ g }) => g.setAttribute("aria-expanded", "false"));
    setActive(null);
    if (restoreFocus) {
      const target = groups.find(({ body }) => body.id === previous);
      if (target) target.g.focus();
    }
  }

  function toggleDetail(id) {
    if (!detailPanel) return;
    if (openId === id) {
      closeDetail({ restoreFocus: true });
      return;
    }
    const node = NODES.find((n) => n.id === id);
    if (!node) return;
    openId = id;

    const heading = document.createElement("h3");
    heading.className = "wb-detail__title";
    heading.tabIndex = -1;
    heading.textContent = node.label;

    const body = document.createElement("p");
    body.className = "wb-detail__body";
    body.textContent = node.detail;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "wb-detail__close";
    close.setAttribute("aria-label", `Close ${node.label} detail`);
    close.textContent = "×";
    close.addEventListener("click", () => closeDetail({ restoreFocus: true }));

    const frag = [heading, close, body];

    if (node.links.length) {
      const label = document.createElement("p");
      label.className = "wb-detail__legend";
      label.textContent = "Used in";
      const list = document.createElement("ul");
      list.className = "wb-detail__links";
      node.links.forEach((link) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = link.href;
        a.textContent = link.label;
        li.appendChild(a);
        list.appendChild(li);
      });
      frag.push(label, list);
    } else {
      const none = document.createElement("p");
      none.className = "wb-detail__legend";
      none.textContent = "Nothing has shipped from this node yet. That is why it is here.";
      frag.push(none);
    }

    detailPanel.replaceChildren(...frag);
    detailPanel.hidden = false;
    groups.forEach(({ g, body: b }) =>
      g.setAttribute("aria-expanded", b.id === id ? "true" : "false")
    );
    setActive(id);
    heading.focus({ preventScroll: true });
  }

  host.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !openId) return;
    event.preventDefault();
    closeDetail({ restoreFocus: true });
  });

  /* ------------------------------------------------------------ lifecycle */

  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      sync();
    },
    { threshold: 0.05 }
  );
  io.observe(host);

  document.addEventListener("visibilitychange", sync);
  onReducedMotionChange(sync);

  render();
  sync();
}
