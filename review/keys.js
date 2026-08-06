import { clampFocus, focusedCapture, focusedWord, state } from "./state.js";

/**
 * @param {object} handlers
 * @param {() => void} handlers.onNavigate
 * @param {(id: string) => Promise<void>} handlers.onDrop
 * @param {(id: string) => Promise<void>} [handlers.onEdit]
 * @param {(id: string) => Promise<void>|null} [handlers.onLearn]
 */
export function bindKeys({ onNavigate, onDrop, onEdit, onLearn }) {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (document.querySelector(".rc-modal-overlay, .rv-lightbox")) return;
    if (state.mode === "settings") return;

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

    // Site capture view / settings: no item keyboard actions.
    if (state.mode === "settings") return;
    if (state.mode === "queue" && state.captureView === "site") return;

    const focus = state.mode === "words" ? focusedWord() : focusedCapture();
    if (!focus) return;

    if (key === "e" || key === "E") {
      if (onEdit) {
        e.preventDefault();
        onEdit(focus.id);
      }
      return;
    }
    if ((key === "l" || key === "L") && state.mode === "words") {
      if (onLearn) {
        e.preventDefault();
        onLearn(focus.id);
      }
      return;
    }
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
