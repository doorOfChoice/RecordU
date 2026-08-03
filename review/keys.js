import { clampFocus, focusedCapture, state } from "./state.js";

/**
 * @param {object} handlers
 * @param {() => void} handlers.onNavigate
 * @param {(id: string) => Promise<void>} handlers.onDrop
 */
export function bindKeys({ onNavigate, onDrop }) {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (document.querySelector(".rc-modal-overlay")) return;

    const key = e.key;
    if (key === "j" || key === "J" || key === "ArrowDown") {
      e.preventDefault();
      state.focusIndex += 1;
      clampFocus();
      onNavigate();
      return;
    }
    if (key === "k" || key === "K" || key === "ArrowUp") {
      e.preventDefault();
      state.focusIndex -= 1;
      clampFocus();
      onNavigate();
      return;
    }

    // Site mode: rail is sites; item actions are mouse-only in the pane.
    if (state.mode === "site") return;

    const focus = focusedCapture();
    if (!focus) return;

    if (key === "Backspace" || key === "d" || key === "D") {
      e.preventDefault();
      onDrop(focus.id);
      return;
    }
    if (key === "o" || key === "O") {
      if (focus.pageUrl) {
        e.preventDefault();
        window.open(focus.pageUrl, "_blank", "noopener");
      }
    }
  });
}
