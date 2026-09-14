/**
 * Command palette — Cmd/Ctrl+K, fuzzy match, focus trap.
 */

import { toggleTheme } from "./theme.js";
import { openTerminal } from "./terminal.js";
import { togglePerfHud } from "./perf.js";

const EMAIL = "devarshbagla@gmail.com";
const PAPER_DOI = "https://dx.doi.org/10.70729/SE251005174007";
const GITHUB = "https://github.com/devarshbagla";
const LINKEDIN = "https://www.linkedin.com/in/devarshbagla";

const COMMANDS = [
  { id: "sec-about", category: "Sections", label: "About", keywords: "about bio", action: { type: "scroll", target: "#about" } },
  { id: "sec-now", category: "Sections", label: "Now", keywords: "now cad lm studio gpu", action: { type: "scroll", target: "#now" } },
  { id: "sec-work", category: "Sections", label: "Work", keywords: "work experience bees", action: { type: "scroll", target: "#work" } },
  { id: "sec-projects", category: "Sections", label: "Projects", keywords: "projects", action: { type: "scroll", target: "#projects" } },
  { id: "sec-research", category: "Sections", label: "Research", keywords: "research paper churn", action: { type: "scroll", target: "#research" } },
  { id: "sec-teaching", category: "Sections", label: "Teaching", keywords: "teaching community", action: { type: "scroll", target: "#teaching" } },
  { id: "sec-before", category: "Sections", label: "Before this", keywords: "ib diploma scindia harmonium finance nse", action: { type: "scroll", target: "#before" } },
  { id: "sec-workbench", category: "Sections", label: "The Workbench", keywords: "workbench loop sketch cad", action: { type: "scroll", target: "#workbench" } },
  { id: "sec-stack", category: "Sections", label: "Stack", keywords: "stack languages python tools", action: { type: "scroll", target: "#stack" } },
  { id: "sec-contact", category: "Sections", label: "Contact", keywords: "contact email", action: { type: "scroll", target: "#contact" } },

  { id: "proj-deskpulse", category: "Projects", label: "DeskPulse", keywords: "haptic audio", action: { type: "scroll", target: "#projects" } },
  { id: "proj-lizi", category: "Projects", label: "LIZI", keywords: "voice assistant", action: { type: "scroll", target: "#projects" } },
  { id: "proj-snapback", category: "Projects", label: "SnapBack", keywords: "tabs chrome", action: { type: "scroll", target: "#projects" } },
  { id: "proj-dtm", category: "Projects", label: "Desktop Task Manager", keywords: "workerw windows", action: { type: "scroll", target: "#projects" } },
  { id: "proj-agentic", category: "Projects", label: "Agentic Workflow", keywords: "cursor method", action: { type: "scroll", target: "#projects" } },
  { id: "proj-chess", category: "Projects", label: "Chess Coach", keywords: "chess", action: { type: "scroll", target: "#projects" } },
  { id: "proj-dust", category: "Projects", label: "From Dust to Zenith", keywords: "editorial vercel", action: { type: "scroll", target: "#projects" } },
  { id: "proj-casio", category: "Projects", label: "Casio fx-CG50 Replica", keywords: "calculator", action: { type: "scroll", target: "#projects" } },

  { id: "act-theme", category: "Actions", label: "Toggle theme", keywords: "dark light mode", action: { type: "theme" } },
  { id: "act-email", category: "Actions", label: "Copy email", keywords: "email clipboard", action: { type: "copy-email" } },
  { id: "act-github", category: "Actions", label: "Open GitHub", keywords: "github", action: { type: "open", url: GITHUB } },
  { id: "act-linkedin", category: "Actions", label: "Open LinkedIn", keywords: "linkedin", action: { type: "open", url: LINKEDIN } },
  { id: "act-paper", category: "Actions", label: "Read the paper", keywords: "doi research churn", action: { type: "open", url: PAPER_DOI } },
  { id: "act-terminal", category: "Actions", label: "Open terminal", keywords: "shell console backtick", action: { type: "terminal" } },
  { id: "act-perf", category: "Actions", label: "Toggle perf HUD", keywords: "fps memory performance hud", action: { type: "perf" } },
  { id: "act-print", category: "Actions", label: "Print / Save as PDF", keywords: "print pdf resume", action: { type: "print" } },
];

function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q) * 0.1;

  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        score += 1 + streak;
        streak += 1;
        ti += 1;
        found = true;
        break;
      }
      streak = 0;
      ti += 1;
    }
    if (!found) return 0;
  }
  return score;
}

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(EMAIL);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = EMAIL;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function runAction(action) {
  switch (action.type) {
    case "scroll": {
      const el = document.querySelector(action.target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
    case "theme":
      toggleTheme();
      break;
    case "copy-email":
      copyEmail();
      break;
    case "open":
      window.open(action.url, "_blank", "noopener,noreferrer");
      break;
    case "terminal":
      openTerminal();
      break;
    case "perf":
      togglePerfHud();
      break;
    case "print":
      window.print();
      break;
    default:
      break;
  }
}

export function initPalette(root = document) {
  const dialog = root.querySelector("[data-palette]");
  const input = root.querySelector("[data-palette-input]");
  const list = root.querySelector("[data-palette-list]");
  const hint = root.querySelector("[data-palette-hint]");
  if (!dialog || !input || !list) return;

  let open = false;
  let activeIndex = 0;
  let results = [];
  let lastTrigger = null;

  const backdrop = dialog.querySelector("[data-palette-backdrop]");

  function render() {
    const query = input.value;
    const scored = COMMANDS.map((cmd) => {
      const hay = `${cmd.label} ${cmd.keywords} ${cmd.category}`;
      return { cmd, score: fuzzyScore(query, hay) };
    })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label));

    results = scored.map((row) => row.cmd);
    if (activeIndex >= results.length) activeIndex = Math.max(0, results.length - 1);

    if (!results.length) {
      list.innerHTML = `<p class="palette__empty">No matches.</p>`;
      return;
    }

    const groups = new Map();
    results.forEach((cmd) => {
      if (!groups.has(cmd.category)) groups.set(cmd.category, []);
      groups.get(cmd.category).push(cmd);
    });

    const parts = [];
    let flatIndex = 0;
    groups.forEach((items, category) => {
      parts.push(`<p class="palette__group" role="presentation">${category}</p>`);
      items.forEach((cmd) => {
        const selected = flatIndex === activeIndex ? " is-active" : "";
        parts.push(
          `<button type="button" class="palette__item${selected}" role="option" data-palette-index="${flatIndex}" aria-selected="${flatIndex === activeIndex ? "true" : "false"}">${cmd.label}</button>`
        );
        flatIndex += 1;
      });
    });
    list.innerHTML = parts.join("");
  }

  function setOpen(next) {
    open = next;
    dialog.hidden = !open;
    dialog.classList.toggle("is-open", open);
    document.body.classList.toggle("palette-open", open);
    if (open) {
      lastTrigger = document.activeElement;
      input.value = "";
      activeIndex = 0;
      render();
      requestAnimationFrame(() => input.focus());
    } else if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  }

  function selectActive() {
    const cmd = results[activeIndex];
    if (!cmd) return;
    setOpen(false);
    runAction(cmd.action);
  }

  function onKeydown(event) {
    const isPaletteChord =
      (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
    if (isPaletteChord) {
      event.preventDefault();
      setOpen(!open);
      return;
    }

    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex + 1) % results.length;
      render();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      render();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectActive();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const focusables = [input, ...list.querySelectorAll(".palette__item")];
      if (!focusables.length) return;
      const idx = focusables.indexOf(document.activeElement);
      if (event.shiftKey) {
        const prev = idx <= 0 ? focusables.length - 1 : idx - 1;
        focusables[prev].focus();
      } else {
        const next = idx >= focusables.length - 1 ? 0 : idx + 1;
        focusables[next].focus();
      }
    }
  }

  input.addEventListener("input", () => {
    activeIndex = 0;
    render();
  });

  list.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-palette-index]");
    if (!btn) return;
    activeIndex = Number(btn.getAttribute("data-palette-index"));
    selectActive();
  });

  if (backdrop) {
    backdrop.addEventListener("click", () => setOpen(false));
  }

  if (hint) {
    hint.addEventListener("click", () => setOpen(true));
  }

  document.addEventListener("keydown", onKeydown);
}
