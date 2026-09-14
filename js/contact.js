/**
 * Contact section — copy email with temporary confirmation.
 */

const EMAIL = "devarshbagla@gmail.com";

export function initContact(root = document) {
  const btn = root.querySelector("[data-copy-email]");
  if (!btn) return;

  let resetTimer = 0;
  const idleLabel = btn.textContent;

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = EMAIL;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    btn.textContent = "Copied";
    btn.classList.add("is-copied");
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      btn.textContent = idleLabel;
      btn.classList.remove("is-copied");
    }, 2000);
  });
}
