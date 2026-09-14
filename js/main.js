import { initTheme } from "./theme.js";
import { initScope } from "./scope.js";
import { initReveal, initScrollProgress } from "./reveal.js";
import { initDeskPulse, initProjectCards } from "./deskpulse.js";
import { initResearchChart } from "./chart.js";
import { initWorkbench } from "./workbench.js";
import { initTerminal } from "./terminal.js";
import { initPalette } from "./palette.js";
import { initContact } from "./contact.js";

function initHeaderScroll() {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;

  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 40);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

function initMobileNav() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-site-nav]");
  if (!toggle || !nav) return;

  const focusableSelector =
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let lastFocused = null;

  const getFocusable = () =>
    Array.from(nav.querySelectorAll(focusableSelector)).filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      return el.getClientRects().length > 0;
    });

  const getTrap = () => {
    const themeBtn = document.querySelector("[data-theme-toggle]");
    const items = getFocusable();
    const trap = [toggle];
    if (themeBtn) trap.push(themeBtn);
    trap.push(...items);
    return trap;
  };

  const open = () => {
    lastFocused = document.activeElement;
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");

    const items = getFocusable();
    if (items.length) items[0].focus();
  };

  const close = () => {
    if (!document.body.classList.contains("nav-open")) return;
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    } else {
      toggle.focus();
    }
  };

  const isOpen = () => document.body.classList.contains("nav-open");

  toggle.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isOpen()) close();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab") return;

    const trap = getTrap();
    if (!trap.length) return;

    const first = trap[0];
    const last = trap[trap.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const mq = window.matchMedia("(min-width: 769px)");
  const onBreakpoint = (e) => {
    if (e.matches && isOpen()) close();
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onBreakpoint);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(onBreakpoint);
  }
}

document.documentElement.setAttribute("data-hydrated", "true");

initTheme();
initHeaderScroll();
initMobileNav();
initScope();
initReveal();
initScrollProgress();
initDeskPulse();
initProjectCards();
initResearchChart();
initWorkbench();
initTerminal();
initPalette();
initContact();
