/**
 * Fake terminal easter egg — palette action or Konami code.
 */

const EMAIL = "devarshbagla@gmail.com";
const PAPER_DOI = "https://dx.doi.org/10.70729/SE251005174007";
const GITHUB = "https://github.com/devarshbagla";
const LINKEDIN = "https://www.linkedin.com/in/devarshbagla";

const PROJECTS = [
  ["DeskPulse", "PROTOTYPE"],
  ["LIZI", "IN DEVELOPMENT"],
  ["SnapBack", "IN DEVELOPMENT"],
  ["Desktop Task Manager", "IN DEVELOPMENT"],
  ["Agentic Workflow", "SHIPPED"],
  ["Chess Coach", "IN DEVELOPMENT"],
  ["From Dust to Zenith", "SHIPPED"],
  ["Casio fx-CG50 Replica", "PROTOTYPE"],
];

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

let api = {
  open: () => {},
  close: () => {},
};

export function openTerminal() {
  api.open();
}

export function closeTerminal() {
  api.close();
}

function runCommand(name, args, write) {
  switch (name) {
    case "help":
      write(
        [
          "help      list commands",
          "whoami    identity",
          "projects  project roster",
          "paper     citation + open DOI",
          "skills    tools and languages",
          "contact   email and links",
          "clear     clear the screen",
          "sudo      you know",
          "exit      close the terminal",
        ].join("\n")
      );
      break;
    case "whoami":
      write(
        "Devarsh Bagla. CS and Economics, Brandeis 2030. Kolkata to Waltham."
      );
      break;
    case "projects":
      write(
        PROJECTS.map(([title, status]) => `${title.padEnd(24)} ${status}`).join(
          "\n"
        )
      );
      break;
    case "paper":
      write(
        [
          "Bagla, D. (2025). Deep Learning Approaches for Churn Prediction:",
          "An Empirical Evaluation on Real-World Business Datasets.",
          "International Journal of Scientific Engineering and Research,",
          "13(10). DOI: 10.70729/SE251005174007",
          "",
          "Opening DOI…",
        ].join("\n")
      );
      window.open(PAPER_DOI, "_blank", "noopener,noreferrer");
      break;
    case "skills":
      write(
        [
          "Languages   Python · HTML/CSS · Hindi · Bengali · French",
          "Data        WEKA",
          "Hardware    ESP32 · soldering · 3D printing · AV systems",
        ].join("\n")
      );
      break;
    case "contact":
      write(
        [
          `email     ${EMAIL}`,
          `github    ${GITHUB}`,
          `linkedin  ${LINKEDIN}`,
        ].join("\n")
      );
      break;
    case "clear":
      write("__CLEAR__");
      break;
    case "sudo":
      write("Nice try.");
      break;
    case "exit":
      write("__EXIT__");
      break;
    case "":
      break;
    default:
      write(
        `command not found: ${name}${args.length ? " " + args.join(" ") : ""}`
      );
      break;
  }
}

export function initTerminal(root = document) {
  const panel = root.querySelector("[data-terminal]");
  const screen = root.querySelector("[data-terminal-screen]");
  const form = root.querySelector("[data-terminal-form]");
  const input = root.querySelector("[data-terminal-input]");
  const live = root.querySelector("[data-terminal-live]");
  if (!panel || !screen || !form || !input) return;

  let open = false;
  let history = [];
  let historyIndex = -1;
  let draft = "";
  let konamiIndex = 0;
  let lastTrigger = null;

  function announce(text) {
    if (!live) return;
    live.textContent = "";
    requestAnimationFrame(() => {
      live.textContent = text;
    });
  }

  function appendLine(text, className = "terminal__line") {
    if (text === "__CLEAR__") {
      screen.replaceChildren();
      announce("Terminal cleared.");
      return;
    }
    if (text === "__EXIT__") {
      setOpen(false);
      return;
    }
    const pre = document.createElement("pre");
    pre.className = className;
    pre.textContent = text;
    screen.appendChild(pre);
    screen.scrollTop = screen.scrollHeight;
    announce(text);
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    panel.classList.toggle("is-open", open);
    document.body.classList.toggle("terminal-open", open);
    if (open) {
      lastTrigger = document.activeElement;
      if (!screen.childElementCount) {
        appendLine("Type `help` for commands. Esc closes.");
      }
      requestAnimationFrame(() => input.focus());
    } else if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  }

  api = { open: () => setOpen(true), close: () => setOpen(false) };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value;
    const trimmed = raw.trim();
    appendLine(
      `devarsh@workbench:~$ ${raw}`,
      "terminal__line terminal__line--cmd"
    );
    if (trimmed) {
      history.push(raw);
      historyIndex = history.length;
      draft = "";
      const parts = trimmed.split(/\s+/);
      const name = parts[0].toLowerCase();
      const args = parts.slice(1);
      runCommand(name, args, appendLine);
    }
    input.value = "";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!history.length) return;
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || "";
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value =
        historyIndex === history.length ? draft : history[historyIndex] || "";
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    input.focus();
  });

  const closeBtn = panel.querySelector("[data-terminal-close]");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => setOpen(false));
  }

  document.addEventListener("keydown", (event) => {
    if (open) return;
    const tag = (event.target && event.target.tagName) || "";
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      event.target?.isContentEditable
    ) {
      konamiIndex = 0;
      return;
    }
    const expected = KONAMI[konamiIndex];
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === expected || key === expected.toLowerCase()) {
      konamiIndex += 1;
      if (konamiIndex >= KONAMI.length) {
        konamiIndex = 0;
        setOpen(true);
      }
    } else {
      konamiIndex = key === KONAMI[0] ? 1 : 0;
    }
  });
}
