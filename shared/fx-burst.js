/**
 * Reusable hit / explosion burst FX for review UI.
 * Pair with styles/fx-burst.css (`.ru-burst*`).
 */

export const BURST_MS = 650;

/**
 * @param {number} combo
 * @returns {"base"|"combo"|"hot"}
 */
export function burstTierFromCombo(combo) {
  const n = Number(combo) || 0;
  if (n >= 5) return "hot";
  if (n >= 3) return "combo";
  return "base";
}

/**
 * @param {number} combo
 * @returns {string}
 */
export function burstLabelFromCombo(combo) {
  const n = Number(combo) || 0;
  return n >= 3 ? `×${n}` : "对";
}

/**
 * Suggested wait before navigating away after a correct burst.
 * @param {number} combo
 */
export function burstWaitMs(combo) {
  const n = Number(combo) || 0;
  if (n >= 5) return 620;
  if (n >= 3) return 560;
  return 500;
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ensurePositioned(el) {
  if (!el || typeof getComputedStyle !== "function") return;
  const pos = getComputedStyle(el).position;
  if (pos === "static" || !pos) {
    el.style.position = "relative";
  }
}

/**
 * Resolve burst origin in container local coordinates.
 * @param {HTMLElement} container
 * @param {HTMLElement | null | undefined} origin
 * @param {{ x: number, y: number } | null | undefined} at
 */
function resolvePoint(container, origin, at) {
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    return { x: at.x, y: at.y };
  }
  const cRect = container.getBoundingClientRect();
  if (origin && typeof origin.getBoundingClientRect === "function") {
    const oRect = origin.getBoundingClientRect();
    return {
      x: oRect.left + oRect.width / 2 - cRect.left,
      y: oRect.top + oRect.height / 2 - cRect.top
    };
  }
  return { x: cRect.width / 2, y: cRect.height / 2 };
}

/**
 * Spawn a particle explosion inside `container`.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container — positioning context (should allow overflow visible)
 * @param {HTMLElement} [opts.origin] — burst from this element's center
 * @param {{ x: number, y: number }} [opts.at] — or explicit coords relative to container
 * @param {number} [opts.combo] — maps to tier + default label
 * @param {"base"|"combo"|"hot"} [opts.tier] — override combo tier
 * @param {string|false} [opts.label] — floating text; false to hide; default from combo
 * @param {boolean} [opts.shake=true] — brief shake on container
 * @returns {{ duration: number, tier: string }}
 */
export function spawnBurst(opts = {}) {
  const container = opts.container;
  if (!container) return { duration: 0, tier: "base" };

  const combo = Number(opts.combo) || 0;
  const tier = opts.tier || burstTierFromCombo(combo);
  const reduced = prefersReducedMotion();
  ensurePositioned(container);

  const { x, y } = resolvePoint(container, opts.origin, opts.at);

  if (opts.shake !== false && !reduced) {
    container.classList.remove("ru-burst-shake");
    // restart animation if already playing
    void container.offsetWidth;
    container.classList.add("ru-burst-shake");
    window.setTimeout(() => container.classList.remove("ru-burst-shake"), 420);
  }

  const layer = document.createElement("div");
  layer.className = `ru-burst${tier === "hot" ? " is-hot" : tier === "combo" ? " is-combo" : ""}`;
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  layer.setAttribute("aria-hidden", "true");

  const core = document.createElement("span");
  core.className = "ru-burst-core";
  layer.appendChild(core);

  const ring = document.createElement("span");
  ring.className = "ru-burst-ring";
  layer.appendChild(ring);

  const ring2 = document.createElement("span");
  ring2.className = "ru-burst-ring is-delayed";
  layer.appendChild(ring2);

  const labelOpt = opts.label;
  const labelText =
    labelOpt === false ? "" : labelOpt != null ? String(labelOpt) : burstLabelFromCombo(combo);
  if (labelText) {
    const label = document.createElement("span");
    label.className = `ru-burst-label${tier === "hot" ? " is-hot" : tier === "combo" ? " is-combo" : ""}`;
    label.textContent = labelText;
    layer.appendChild(label);
  }

  if (!reduced) {
    const count = tier === "hot" ? 28 : tier === "combo" ? 22 : 16;
    const colors =
      tier === "hot"
        ? ["var(--ru-accent)", "var(--ru-ok)", "var(--ru-warm)", "#ffffff"]
        : tier === "combo"
          ? ["var(--ru-accent)", "var(--ru-ok)", "#ffffff"]
          : ["var(--ru-ok)", "var(--ru-accent)", "#ffffff"];
    const distExtra = tier === "hot" ? 110 : 86;

    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const dist = 48 + Math.random() * distExtra;
      const size = 3 + Math.random() * (tier === "base" ? 5 : 7);
      const isStreak = i % 4 === 0;
      const deg = (angle * 180) / Math.PI;
      p.className = isStreak ? "ru-burst-bit is-streak" : "ru-burst-bit";
      p.style.setProperty("--bx", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--by", `${Math.sin(angle) * dist}px`);
      p.style.setProperty("--bs", `${size}px`);
      p.style.setProperty("--brot", `${deg}deg`);
      p.style.setProperty("--bdelay", `${Math.floor(Math.random() * 40)}ms`);
      p.style.setProperty("--bcolor", colors[i % colors.length]);
      if (isStreak) {
        p.style.setProperty("--blen", `${12 + Math.random() * 18}px`);
      }
      layer.appendChild(p);
    }
  }

  container.appendChild(layer);
  window.setTimeout(() => {
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  }, BURST_MS);

  return { duration: BURST_MS, tier };
}
