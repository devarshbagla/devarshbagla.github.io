/**
 * A small but real shell.
 *
 * Virtual filesystem, path resolution with . and .., tab completion on both
 * commands and paths, persisted history, and character-by-character output.
 *
 * Screen-reader handling: output lines are inserted empty, typed into an
 * aria-hidden span (mutations inside an aria-hidden subtree are not announced),
 * then replaced in one go by the finished text — so the polite live region on
 * the screen announces each line exactly once, as a whole line.
 */

import {
  ROOT,
  countFiles,
  formatPath,
  listDir,
  nodeAt,
  resolvePath,
} from "./fs.js";
import { prefersReducedMotion, store } from "./util.js";
import { getTheme, setTheme } from "./theme.js";

const HISTORY_KEY = "terminal:history";
const HISTORY_MAX = 120;
const TYPE_MS_PER_CHAR = 8;
const BOOT_TIME = Date.now();

const LINKS = {
  github: "https://github.com/devarshbagla",
  linkedin: "https://www.linkedin.com/in/devarshbagla",
  paper: "https://dx.doi.org/10.70729/SE251005174007",
  bees: "https://bees.in",
  dust: "https://fromdusttozenith.in",
  fueladream: "https://www.fueladream.com/home/campaign/73792",
};

const COMMANDS = [
  ["ls", "list a directory"],
  ["cd", "change directory"],
  ["cat", "print a file"],
  ["pwd", "print working directory"],
  ["tree", "recursive listing"],
  ["whoami", "identity"],
  ["neofetch", "system-style summary"],
  ["history", "commands you have run"],
  ["echo", "print arguments"],
  ["date", "current date and time"],
  ["open", "open a url or shortcut in a new tab"],
  ["theme", "theme dark | theme light"],
  ["credits", "who actually wrote this site"],
  ["clear", "clear the screen"],
  ["help", "this list"],
  ["sudo", "you know"],
  ["exit", "close the terminal"],
];

const ALIASES = {
  projects: "ls /projects",
  research: "ls /research",
  teaching: "ls /teaching",
  paper: "cat /research/churn-paper.md",
  skills: "cat /about/stack.md",
  contact: "cat /contact/email.txt",
  about: "cat /about/bio.md",
  ll: "ls",
  dir: "ls",
  "?": "help",
};

/** Draw a sine as ASCII so the logo is generated, not pasted. */
function waveLogo(rows = 6, cols = 28, cycles = 2) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));
  let prevY = null;
  for (let x = 0; x < cols; x += 1) {
    const v = Math.sin((x / (cols - 1)) * Math.PI * 2 * cycles);
    const y = Math.round(((1 - v) / 2) * (rows - 1));
    if (prevY !== null) {
      const lo = Math.min(prevY, y);
      const hi = Math.max(prevY, y);
      for (let fill = lo; fill <= hi; fill += 1) grid[fill][x] = "█";
    } else {
      grid[y][x] = "█";
    }
    prevY = y;
  }
  return grid.map((row) => row.join(""));
}

function uptime() {
  const seconds = Math.floor((Date.now() - BOOT_TIME) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function commonPrefix(list) {
  if (!list.length) return "";
  let prefix = list[0];
  for (const item of list) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

let api = { open: () => {}, close: () => {}, isOpen: () => false };

export function openTerminal() {
  api.open();
}

export function closeTerminal() {
  api.close();
}

export function initTerminal(root = document) {
  const panel = root.querySelector("[data-terminal]");
  const screen = root.querySelector("[data-terminal-screen]");
  const form = root.querySelector("[data-terminal-form]");
  const input = root.querySelector("[data-terminal-input]");
  const promptEl = root.querySelector("[data-terminal-prompt]");
  const titleEl = root.querySelector("[data-terminal-title]");
  const live = root.querySelector("[data-terminal-live]");
  if (!panel || !screen || !form || !input) return;

  let open = false;
  let cwd = [];
  let history = store.getJSON(HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];
  let historyIndex = history.length;
  let draft = "";
  let lastTrigger = null;

  /* ------------------------------------------------------------ printing */

  const queue = [];
  let draining = false;
  let skip = false;
  let typeTimer = 0;

  function scrollToEnd() {
    screen.scrollTop = screen.scrollHeight;
  }

  function typeLine({ text, className }) {
    return new Promise((resolve) => {
      const pre = document.createElement("pre");
      pre.className = className;
      screen.appendChild(pre);

      const finish = () => {
        window.clearTimeout(typeTimer);
        typeTimer = 0;
        pre.replaceChildren(document.createTextNode(text));
        scrollToEnd();
        resolve();
      };

      if (skip || !text || prefersReducedMotion()) {
        finish();
        return;
      }

      const cursor = document.createElement("span");
      cursor.setAttribute("aria-hidden", "true");
      pre.appendChild(cursor);

      let index = 0;
      let last = performance.now();
      const step = () => {
        if (skip) {
          finish();
          return;
        }
        const now = performance.now();
        const chars = Math.max(1, Math.floor((now - last) / TYPE_MS_PER_CHAR));
        last = now;
        index = Math.min(text.length, index + chars);
        cursor.textContent = text.slice(0, index);
        scrollToEnd();
        if (index >= text.length) {
          finish();
          return;
        }
        typeTimer = window.setTimeout(step, TYPE_MS_PER_CHAR);
      };
      step();
    });
  }

  async function drain() {
    if (draining) return;
    draining = true;
    panel.classList.add("is-typing");
    while (queue.length) {
      /* eslint-disable-next-line no-await-in-loop */
      await typeLine(queue.shift());
    }
    draining = false;
    skip = false;
    panel.classList.remove("is-typing");
  }

  function print(text, className = "terminal__line") {
    String(text)
      .split("\n")
      .forEach((line) => {
        queue.push({
          text: line,
          className: line ? className : `${className} terminal__line--blank`,
        });
      });
    drain();
  }

  function announce(text) {
    if (!live) return;
    live.textContent = "";
    window.requestAnimationFrame(() => {
      live.textContent = text;
    });
  }

  function clearScreen() {
    queue.length = 0;
    skip = false;
    window.clearTimeout(typeTimer);
    screen.replaceChildren();
    announce("Terminal cleared.");
  }

  /* --------------------------------------------------------------- prompt */

  function promptText() {
    const path = cwd.length ? `~/${cwd.join("/")}` : "~";
    return `devarsh@workbench:${path}$`;
  }

  function syncPrompt() {
    if (promptEl) promptEl.textContent = promptText();
    if (titleEl) titleEl.textContent = promptText().replace(/\$$/, "");
  }

  /* ------------------------------------------------------------- commands */

  function neofetch() {
    const logo = waveLogo();
    const info = [
      "devarsh@workbench",
      "-".repeat(17),
      `name       Devarsh Bagla`,
      `location   Waltham, MA / Kolkata, India`,
      `studying   B.S. Computer Science, B.S. Economics`,
      `languages  English, Hindi, Bengali, French`,
      `uptime     ${uptime()}`,
      `projects   ${listDir(nodeAt(["projects"])).length}`,
      `files      ${countFiles(ROOT)}`,
      `theme      ${getTheme()}`,
      `shell      hand-written, no framework`,
    ];
    const rows = Math.max(logo.length, info.length);
    const pad = logo[0].length + 4;
    const out = [];
    for (let i = 0; i < rows; i += 1) {
      out.push(`${(logo[i] || "").padEnd(pad, " ")}${info[i] || ""}`);
    }
    return out.join("\n");
  }

  function treeOf(node, prefix = "") {
    const names = listDir(node);
    return names
      .map((name, i) => {
        const last = i === names.length - 1;
        const child = node.children[name];
        const branch = `${prefix}${last ? "└── " : "├── "}${name}${child.type === "dir" ? "/" : ""}`;
        if (child.type !== "dir") return branch;
        return `${branch}\n${treeOf(child, `${prefix}${last ? "    " : "│   "}`)}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  function run(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const expanded = ALIASES[trimmed.toLowerCase()] || trimmed;
    const parts = expanded.split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (name) {
      case "help":
        print(
          [
            "COMMAND    WHAT IT DOES",
            ...COMMANDS.map(([cmd, desc]) => `${cmd.padEnd(11)}${desc}`),
            "",
            "Shortcuts: projects, research, teaching, paper, skills, contact, about",
            "TAB completes commands and paths. ↑ and ↓ walk history. Ctrl+L clears.",
          ].join("\n")
        );
        break;

      case "pwd":
        print(formatPath(cwd));
        break;

      case "ls": {
        const target = resolvePath(cwd, args[0] || ".");
        const node = nodeAt(target);
        if (!node) {
          print(`ls: ${args[0] || "."}: no such file or directory`, "terminal__line terminal__line--err");
          break;
        }
        if (node.type === "file") {
          print(formatPath(target));
          break;
        }
        const names = listDir(node);
        if (!names.length) {
          print("(empty)");
          break;
        }
        print(
          names
            .map((entry) => (node.children[entry].type === "dir" ? `${entry}/` : entry))
            .join("\n")
        );
        break;
      }

      case "cd": {
        const target = resolvePath(cwd, args[0] || "/");
        const node = nodeAt(target);
        if (!node) {
          print(`cd: ${args[0]}: no such file or directory`, "terminal__line terminal__line--err");
          break;
        }
        if (node.type !== "dir") {
          print(`cd: ${args[0]}: not a directory`, "terminal__line terminal__line--err");
          break;
        }
        cwd = target;
        syncPrompt();
        break;
      }

      case "cat": {
        if (!args.length) {
          print("cat: needs a file. Try `ls` first.", "terminal__line terminal__line--err");
          break;
        }
        const target = resolvePath(cwd, args[0]);
        const node = nodeAt(target);
        if (!node) {
          print(`cat: ${args[0]}: no such file or directory`, "terminal__line terminal__line--err");
          break;
        }
        if (node.type === "dir") {
          print(`cat: ${args[0]}: is a directory`, "terminal__line terminal__line--err");
          break;
        }
        print(node.body);
        break;
      }

      case "tree": {
        const target = resolvePath(cwd, args[0] || ".");
        const node = nodeAt(target);
        if (!node || node.type !== "dir") {
          print(`tree: ${args[0] || "."}: not a directory`, "terminal__line terminal__line--err");
          break;
        }
        print(`${formatPath(target)}\n${treeOf(node)}`);
        break;
      }

      case "whoami":
        print("Devarsh Bagla. CS and Economics, Brandeis 2030. Kolkata to Waltham.");
        break;

      case "neofetch":
        print(neofetch());
        break;

      case "history":
        if (!history.length) {
          print("(no history yet)");
          break;
        }
        print(
          history
            .map((entry, i) => `${String(i + 1).padStart(4)}  ${entry}`)
            .join("\n")
        );
        break;

      case "echo":
        print(args.join(" "));
        break;

      case "date":
        print(
          new Date().toLocaleString(undefined, {
            weekday: "short", year: "numeric", month: "short", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          })
        );
        break;

      case "open": {
        const arg = args[0];
        if (!arg) {
          print(`open: needs a url or one of: ${Object.keys(LINKS).join(", ")}`, "terminal__line terminal__line--err");
          break;
        }
        const url = LINKS[arg.toLowerCase()] || arg;
        if (!/^https?:\/\//i.test(url)) {
          print(`open: ${arg}: only http and https are allowed`, "terminal__line terminal__line--err");
          break;
        }
        print(`opening ${url}`);
        window.open(url, "_blank", "noopener,noreferrer");
        break;
      }

      case "theme": {
        const next = (args[0] || "").toLowerCase();
        if (next !== "dark" && next !== "light") {
          print(`theme: currently ${getTheme()}. Usage: theme dark | theme light`);
          break;
        }
        setTheme(next);
        print(`theme set to ${next}`);
        break;
      }

      case "credits":
        print(CREDITS);
        break;

      case "clear":
        clearScreen();
        break;

      case "sudo":
        print("Nice try.");
        break;

      case "exit":
        setOpen(false);
        break;

      default:
        print(
          `command not found: ${name}. Try \`help\`.`,
          "terminal__line terminal__line--err"
        );
    }
  }

  /* ----------------------------------------------------------- completion */

  function complete() {
    const value = input.value;
    const caretAtEnd = input.selectionStart === value.length;
    if (!caretAtEnd) return;

    const tokens = value.split(/\s+/);
    const isFirst = tokens.length === 1;
    const token = tokens[tokens.length - 1];

    let candidates;
    let replaceFrom;

    if (isFirst) {
      const pool = [...COMMANDS.map(([c]) => c), ...Object.keys(ALIASES)];
      candidates = pool.filter((c) => c.startsWith(token.toLowerCase())).sort();
      replaceFrom = "";
    } else {
      const slash = token.lastIndexOf("/");
      const dirPart = slash === -1 ? "" : token.slice(0, slash + 1);
      const leaf = slash === -1 ? token : token.slice(slash + 1);
      const node = nodeAt(resolvePath(cwd, dirPart || "."));
      if (!node || node.type !== "dir") return;
      candidates = listDir(node)
        .filter((entry) => entry.startsWith(leaf))
        .map((entry) => (node.children[entry].type === "dir" ? `${entry}/` : entry));
      replaceFrom = dirPart;
    }

    if (!candidates.length) return;

    const stripped = candidates.map((c) => c.replace(/\/$/, ""));
    const prefix = candidates.length === 1 ? candidates[0] : commonPrefix(stripped);
    tokens[tokens.length - 1] = `${replaceFrom}${prefix}`;
    const joined = tokens.join(" ");
    input.value = candidates.length === 1 && !prefix.endsWith("/") ? `${joined} ` : joined;

    if (candidates.length > 1) {
      print(`${promptText()} ${value}`, "terminal__line terminal__line--cmd");
      print(candidates.join("   "));
    }
  }

  /* ---------------------------------------------------------- open / close */

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    panel.classList.toggle("is-open", open);
    document.body.classList.toggle("terminal-open", open);
    if (open) {
      lastTrigger = document.activeElement;
      if (!screen.childElementCount) {
        print(BANNER);
      }
      window.requestAnimationFrame(() => input.focus());
    } else if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  }

  api = { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => open };

  /* ---------------------------------------------------------------- events */

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value;
    print(`${promptText()} ${raw}`, "terminal__line terminal__line--cmd");
    const trimmed = raw.trim();
    if (trimmed) {
      history.push(raw);
      if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
      store.setJSON(HISTORY_KEY, history);
      historyIndex = history.length;
      draft = "";
      run(raw);
    }
    input.value = "";
  });

  input.addEventListener("keydown", (event) => {
    // Any key skips pending typing, and is swallowed so it does not also type.
    if (draining && !event.metaKey && !event.ctrlKey && !event.altKey) {
      skip = true;
      event.preventDefault();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      complete();
      return;
    }

    if (event.key === "l" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      clearScreen();
      return;
    }

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
      input.value = historyIndex === history.length ? draft : history[historyIndex] || "";
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
    // Keep focus inside the dialog: screen and input are the only stops.
    const stops = [screen, input, panel.querySelector("[data-terminal-close]")].filter(Boolean);
    const index = stops.indexOf(document.activeElement);
    if (index === -1) {
      event.preventDefault();
      input.focus();
      return;
    }
    if (document.activeElement === input) return;
    event.preventDefault();
    const next = event.shiftKey
      ? stops[(index - 1 + stops.length) % stops.length]
      : stops[(index + 1) % stops.length];
    next.focus();
  });

  const closeBtn = panel.querySelector("[data-terminal-close]");
  if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));

  panel.addEventListener("click", (event) => {
    if (event.target === panel) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (open) return;
    if (event.key === "`" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setOpen(true);
    }
  });

  syncPrompt();
}

const BANNER = `devsh — a small shell with a small filesystem.
Type \`help\` for commands, \`neofetch\` for the tour, \`exit\` or Esc to leave.`;

const CREDITS = `WHO WROTE WHAT

I would rather be honest about this than not.

  Written by me
    every word of copy on this site, and the decisions behind it
    the research, the projects, the teaching, all of it actually happened
    the design direction: instrumentation, mono labels, amber on near-black
    the architecture call: no framework, no bundler, no build step

  Written with AI assistance, reviewed and owned by me
    most of the implementation code in css/ and js/
    the DSP parameter ranges, the FFT and Lissajous plumbing
    the illustrative churn coefficients, which are representative
      and explicitly not the trained weights from the paper

  Not mine
    Inter, JetBrains Mono and Space Grotesk, served by Google Fonts

The workflow itself is a project of its own: run \`cat /projects/agentic-workflow.md\`.`;
