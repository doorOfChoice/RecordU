const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const STEP = 0.25;

let active = null;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function closeImagePreview() {
  if (!active) return;
  const { overlay, onKey } = active;
  document.removeEventListener("keydown", onKey);
  overlay.classList.remove("show");
  setTimeout(() => overlay.remove(), 200);
  active = null;
}

/**
 * Fullscreen screenshot preview with zoom / pan.
 * @param {string} src data URL or blob URL
 */
export function openImagePreview(src) {
  if (!src) return;
  closeImagePreview();

  let scale = 1;
  let x = 0;
  let y = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const overlay = document.createElement("div");
  overlay.className = "rv-lightbox";
  overlay.innerHTML = `
    <div class="rv-lightbox-toolbar">
      <button type="button" class="rv-lightbox-btn" data-act="out" title="缩小">−</button>
      <span class="rv-lightbox-scale">100%</span>
      <button type="button" class="rv-lightbox-btn" data-act="in" title="放大">+</button>
      <button type="button" class="rv-lightbox-btn" data-act="reset" title="重置">1:1</button>
      <button type="button" class="rv-lightbox-btn rv-lightbox-close" data-act="close" title="关闭" aria-label="关闭">×</button>
    </div>
    <div class="rv-lightbox-stage">
      <img class="rv-lightbox-img" alt="截图预览" draggable="false">
    </div>
    <p class="rv-lightbox-hint">滚轮缩放 · 拖拽移动 · Esc 关闭</p>
  `;

  const img = overlay.querySelector(".rv-lightbox-img");
  const stage = overlay.querySelector(".rv-lightbox-stage");
  const scaleLabel = overlay.querySelector(".rv-lightbox-scale");
  img.src = src;

  function applyTransform() {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    stage.classList.toggle("is-zoomed", scale > 1.01);
  }

  function zoomBy(delta, cx, cy) {
    const prev = scale;
    scale = clamp(scale + delta, MIN_SCALE, MAX_SCALE);
    if (scale === prev) return;
    // Zoom toward cursor when possible.
    if (typeof cx === "number" && typeof cy === "number") {
      const rect = stage.getBoundingClientRect();
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      x = px - ((px - x) * scale) / prev;
      y = py - ((py - y) * scale) / prev;
    }
    applyTransform();
  }

  function reset() {
    scale = 1;
    x = 0;
    y = 0;
    applyTransform();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeImagePreview();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(STEP);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(-STEP);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      reset();
    }
  }

  overlay.querySelector(".rv-lightbox-toolbar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "close") closeImagePreview();
    else if (act === "in") zoomBy(STEP);
    else if (act === "out") zoomBy(-STEP);
    else if (act === "reset") reset();
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -STEP : STEP;
      zoomBy(dir, e.clientX, e.clientY);
    },
    { passive: false }
  );

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("is-dragging");
  });

  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    x += e.clientX - lastX;
    y += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === stage) closeImagePreview();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  document.addEventListener("keydown", onKey);
  active = { overlay, onKey };
  applyTransform();
}

/** Wire click-to-preview on a .rv-shot container after its img is ready. */
export function bindShotPreview(shotEl, dataUrl) {
  if (!shotEl || !dataUrl) return;
  shotEl.classList.add("is-clickable");
  shotEl.title = "点击预览";
  shotEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openImagePreview(dataUrl);
  });
}
