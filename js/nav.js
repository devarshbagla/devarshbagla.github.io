/**
 * Navigation and motion system.
 *
 * - Scroll-spy driving both the header nav and a right-edge section rail
 * - The nav underline moves with FLIP: it is placed at the new link first, then
 *   inverted back to where it was and played forward, so the slide is one
 *   compositor-friendly transform rather than a class swap
 * - Magnetic hover on primary buttons, pointer-fine only
 * - Headings resolve out of random mono glyphs the first time they appear
 */

import { clamp, prefersReducedMotion, onReducedMotionChange } from "./util.js";

const SPY_LINE = 0.34; // fraction of viewport height used as the "current" line
const MAGNET_PX = 4;
const SCRAMBLE_MS = 400;
const GLYPHS = "01</>[]{}#%&*+=~^|\\/░▒▓▚▞";

/* ------------------------------------------------------------------ scroll */

function sectionsInOrder() {
  return Array.from(document.querySelectorAll("main > section[id]")).filter(
    (section) => section.id !== "hero"
  );
}

function sectionName(section) {
  const label = section.querySelector(".section__label");
  // initScramble splits the label into a real span plus an aria-hidden copy,
  // so prefer the stashed original over the doubled textContent.
  const raw = label ? label.dataset.label || label.textContent : section.id;
  return raw
    .replace(/^\s*\d+\s*\/\s*/, "")
    .replace(/\s+and\s+.*$/i, "")
    .replace(/^the\s+/i, "")
    .trim()
    .toUpperCase();
}

export function initScrollSpy() {
  const sections = sectionsInOrder();
  if (!sections.length) return;

  const list = document.querySelector("[data-site-nav] .site-nav__list");
  const links = list ? Array.from(list.querySelectorAll(".site-nav__link")) : [];
  const linkById = new Map();
  links.forEach((link) => {
    const id = (link.getAttribute("href") || "").replace(/^#/, "");
    if (id) linkById.set(id, link);
  });

  let underline = null;
  if (list && links.length) {
    underline = document.createElement("span");
    underline.className = "site-nav__underline";
    underline.setAttribute("aria-hidden", "true");
    list.appendChild(underline);
  }

  const rail = buildRail(sections);
  let current = "";
  let lastPlacement = null;
  let ticking = false;

  function placeUnderline(link) {
    if (!underline || !list) return;
    if (!link) {
      underline.classList.remove("is-visible");
      lastPlacement = null;
      return;
    }
    const listBox = list.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    const left = linkBox.left - listBox.left;
    const width = linkBox.width;

    // First: where it currently sits. Last: where it is going.
    const previous = lastPlacement;
    underline.classList.add("is-visible");
    underline.style.width = `${width}px`;
    underline.style.transform = `translateX(${left}px)`;

    if (
      previous &&
      width > 0 &&
      previous.width > 0 &&
      !prefersReducedMotion() &&
      typeof underline.animate === "function"
    ) {
      // Invert, then play.
      underline.animate(
        [
          {
            transform: `translateX(${previous.left}px) scaleX(${previous.width / width})`,
          },
          { transform: `translateX(${left}px) scaleX(1)` },
        ],
        { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }

    lastPlacement = { left, width };
  }

  function setCurrent(id) {
    if (id === current) return;
    current = id;

    links.forEach((link) => {
      const active = linkById.get(id) === link;
      link.classList.toggle("is-current", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    placeUnderline(linkById.get(id) || null);
    rail.setCurrent(id);
  }

  function measure() {
    const line = window.innerHeight * SPY_LINE;
    let active = "";
    for (const section of sections) {
      const box = section.getBoundingClientRect();
      if (box.top <= line && box.bottom > line) {
        active = section.id;
        break;
      }
      if (box.top > line) break;
      active = section.id;
    }
    // Near the very bottom the last section should win even if it is short.
    const doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) {
      active = sections[sections.length - 1].id;
    }
    // Above the first section, nothing is current.
    if (sections[0].getBoundingClientRect().top > line) active = "";
    setCurrent(active);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      measure();
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    lastPlacement = null;
    const link = linkById.get(current);
    if (link) placeUnderline(link);
    onScroll();
  });
  // Fonts land after first paint and shift link widths.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      lastPlacement = null;
      const link = linkById.get(current);
      if (link) placeUnderline(link);
    });
  }

  measure();
}

/* -------------------------------------------------------------- dot rail */

function buildRail(sections) {
  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.setAttribute("aria-label", "Section navigation");

  const buttons = new Map();
  sections.forEach((section) => {
    const name = sectionName(section);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail__dot";
    button.dataset.railTarget = section.id;

    const label = document.createElement("span");
    label.className = "rail__label";
    label.textContent = name;
    button.appendChild(label);

    button.setAttribute("aria-label", `Jump to ${name.toLowerCase()}`);
    button.addEventListener("click", () => {
      section.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      section.setAttribute("tabindex", "-1");
      section.focus({ preventScroll: true });
    });

    rail.appendChild(button);
    buttons.set(section.id, button);
  });

  document.body.appendChild(rail);

  return {
    setCurrent(id) {
      buttons.forEach((button, key) => {
        const active = key === id;
        button.classList.toggle("is-current", active);
        if (active) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
    },
  };
}

/* ------------------------------------------------------------- magnetics */

export function initMagnetic(root = document) {
  const targets = Array.from(root.querySelectorAll(".btn--primary"));
  if (!targets.length) return;

  // pointerType is the honest touch test: a touch contact never reports "mouse",
  // and a tablet with a mouse attached should still get the effect.
  let enabled = !prefersReducedMotion();

  function release(el) {
    el.classList.remove("is-magnet");
    el.style.removeProperty("--mx");
    el.style.removeProperty("--my");
  }

  targets.forEach((el) => {
    el.addEventListener("pointermove", (event) => {
      if (!enabled || event.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
      el.classList.add("is-magnet");
      el.style.setProperty("--mx", `${clamp(dx * MAGNET_PX, -MAGNET_PX, MAGNET_PX).toFixed(2)}px`);
      el.style.setProperty("--my", `${clamp(dy * MAGNET_PX, -MAGNET_PX, MAGNET_PX).toFixed(2)}px`);
    });
    el.addEventListener("pointerleave", () => release(el));
    el.addEventListener("blur", () => release(el));
  });

  onReducedMotionChange(() => {
    enabled = !prefersReducedMotion();
    if (!enabled) targets.forEach(release);
  });
}

/* -------------------------------------------------------------- scramble */

function scrambleTo(node, text, done) {
  const length = text.length;
  const start = performance.now();
  const seeds = Array.from({ length }, (_, i) => ({
    at: (i / Math.max(1, length)) * SCRAMBLE_MS * 0.55,
    until: (i / Math.max(1, length)) * SCRAMBLE_MS * 0.55 + SCRAMBLE_MS * 0.45,
  }));

  function frame(now) {
    const elapsed = now - start;
    let out = "";
    let settled = 0;
    for (let i = 0; i < length; i += 1) {
      const char = text[i];
      if (char === " ") {
        out += " ";
        settled += 1;
        continue;
      }
      if (elapsed >= seeds[i].until) {
        out += char;
        settled += 1;
      } else if (elapsed >= seeds[i].at) {
        out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      } else {
        out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
    }
    node.textContent = out;
    if (settled < length) requestAnimationFrame(frame);
    else if (done) done();
  }
  requestAnimationFrame(frame);
}

export function initScramble(root = document) {
  const labels = Array.from(root.querySelectorAll(".section__label"));
  if (!labels.length) return;

  // Split each label so the accessible name never changes while glyphs churn.
  const targets = labels.map((label) => {
    const text = label.textContent.trim();
    label.dataset.label = text;
    const real = document.createElement("span");
    real.className = "visually-hidden";
    real.textContent = text;
    const visual = document.createElement("span");
    visual.setAttribute("aria-hidden", "true");
    visual.textContent = text;
    label.replaceChildren(real, visual);
    return { label, visual, text };
  });

  if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const target = targets.find((t) => t.label === entry.target);
        if (!target) return;
        scrambleTo(target.visual, target.text);
      });
    },
    { threshold: 0.6, rootMargin: "0px 0px -10% 0px" }
  );

  targets.forEach((target) => io.observe(target.label));
}
