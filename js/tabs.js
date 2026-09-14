/**
 * Keyboard-operable ARIA tabs. Used by the churn explorer and Before This.
 */

export function initTablist(host) {
  if (!host) return;
  const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  if (!tabs.length) return;

  function select(index, { focus = true } = {}) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.classList.toggle("is-active", active);
      if (active) tab.removeAttribute("tabindex");
      else tab.setAttribute("tabindex", "-1");
      if (panels[i]) panels[i].hidden = !active;
    });
    if (focus && tabs[index]) tabs[index].focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i, { focus: false }));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      select(next);
    });
  });

  return { select };
}