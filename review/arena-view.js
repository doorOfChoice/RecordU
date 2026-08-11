import { escapeHtml } from "../shared/dom.js";
import {
  DETECTIVE_DEFAULT_COUNT,
  SPRINT_DURATION_SEC,
  answerDetective,
  answerSprint,
  createDetectiveSession,
  createSprintSession,
  nextSprintQuestion,
  normalizeSprintDirection
} from "../shared/arena.js";
import {
  burstLabelFromCombo,
  burstWaitMs,
  spawnBurst
} from "../shared/fx-burst.js";
import { quizWordPool } from "../shared/quiz.js";
import { state } from "./state.js";

/** @type {ReturnType<typeof setInterval> | null} */
let sprintTimer = null;

function clearSprintTimer() {
  if (sprintTimer != null) {
    clearInterval(sprintTimer);
    sprintTimer = null;
  }
}

function poolEmptyHtml() {
  return `<p class="rv-arena-empty">还没有可练习的未学会单词（需有释义）。先在网页上划词标记，再回来玩。</p>`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {() => void} opts.onRefresh
 */
export function renderArena({ root, progressEl, onRefresh }) {
  clearSprintTimer();
  const mode = state.activeArenaMode;
  if (mode === "sprint") {
    renderSprint({ root, progressEl, onRefresh });
    return;
  }
  if (mode === "detective") {
    renderDetective({ root, progressEl, onRefresh });
    return;
  }
  renderArenaHub({ root, progressEl, onRefresh });
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {() => void} opts.onRefresh
 */
function renderArenaHub({ root, progressEl, onRefresh }) {
  state.activeArenaMode = null;
  state.arenaSession = null;
  const pool = quizWordPool(state.words || []);
  const n = pool.length;
  progressEl.textContent = `练习场 · ${n} 个可练词`;

  root.innerHTML = `
    <div class="rv-arena-hub">
      <p class="rv-arena-hub-lead">短局练习，不生成试卷。用你划过的词热身。</p>
      ${
        n
          ? `<div class="rv-arena-cards">
          <article class="rv-arena-card">
            <h3 class="rv-arena-card-title">语境侦探</h3>
            <p class="rv-arena-card-desc">从你当初划词的原文里挖空，凭语境填回单词。没有原文时改为看释义填词。</p>
            <button type="button" class="btn btn-primary" data-arena-start="detective">开始</button>
          </article>
          <article class="rv-arena-card">
            <h3 class="rv-arena-card-title">六十秒闪回</h3>
            <p class="rv-arena-card-desc">限时抢答：认词或认义，四选一。连对会安静地叠 combo。</p>
            <div class="rv-arena-card-opts" role="group" aria-label="出题方向">
              <label class="rv-arena-radio">
                <input type="radio" name="rv-sprint-dir" value="en2zh" checked>
                <span>英 → 义</span>
              </label>
              <label class="rv-arena-radio">
                <input type="radio" name="rv-sprint-dir" value="zh2en">
                <span>义 → 英</span>
              </label>
            </div>
            <button type="button" class="btn btn-primary" data-arena-start="sprint">开始</button>
          </article>
        </div>`
          : poolEmptyHtml()
      }
    </div>
  `;

  root.querySelectorAll("[data-arena-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-arena-start");
      if (kind === "detective") {
        if (!quizWordPool(state.words || []).length) return;
        state.arenaSession = createDetectiveSession(
          state.words || [],
          state.captures || [],
          DETECTIVE_DEFAULT_COUNT
        );
        state.activeArenaMode = "detective";
        onRefresh();
        return;
      }
      if (kind === "sprint") {
        if (!quizWordPool(state.words || []).length) return;
        const dirEl = root.querySelector('input[name="rv-sprint-dir"]:checked');
        const direction = normalizeSprintDirection(dirEl && dirEl.value);
        const session = createSprintSession(state.words || [], direction);
        nextSprintQuestion(session);
        state.arenaSession = session;
        state.activeArenaMode = "sprint";
        onRefresh();
      }
    });
  });
}

function backToHub(onRefresh) {
  clearSprintTimer();
  state.activeArenaMode = null;
  state.arenaSession = null;
  onRefresh();
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {() => void} opts.onRefresh
 */
function renderSprint({ root, progressEl, onRefresh }) {
  let session = state.arenaSession;
  if (!session || session.mode !== "sprint") {
    state.activeArenaMode = null;
    renderArenaHub({ root, progressEl, onRefresh });
    return;
  }

  if (session.finished) {
    progressEl.textContent = `闪回 · 结束`;
    const answered = session.answered || 0;
    const correct = session.correctCount || 0;
    const rate = answered ? Math.round((correct / answered) * 100) : 0;
    root.innerHTML = `
      <div class="rv-arena-play">
        <div class="rv-arena-top">
          <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        </div>
        <div class="rv-arena-result">
          <h3 class="rv-arena-result-title">六十秒结束</h3>
          <ul class="rv-arena-stats">
            <li><span class="rv-arena-stat-label">答对</span><span class="rv-arena-stat-val">${correct}</span></li>
            <li><span class="rv-arena-stat-label">作答</span><span class="rv-arena-stat-val">${answered}</span></li>
            <li><span class="rv-arena-stat-label">正确率</span><span class="rv-arena-stat-val">${rate}%</span></li>
            <li><span class="rv-arena-stat-label">最长连对</span><span class="rv-arena-stat-val">${session.maxCombo || 0}</span></li>
          </ul>
          <div class="rv-arena-result-actions">
            <button type="button" class="btn btn-primary" data-arena-again="sprint">再来一局</button>
            <button type="button" class="btn" data-arena-back>返回</button>
          </div>
        </div>
      </div>
    `;
    bindArenaChrome(root, onRefresh, session.direction);
    return;
  }

  if (!session.current) nextSprintQuestion(session);
  const q = session.current;
  if (!q) {
    session.finished = true;
    renderSprint({ root, progressEl, onRefresh });
    return;
  }

  progressEl.textContent = `闪回 · ${session.remainingSec}s · 连对 ${session.combo}`;

  root.innerHTML = `
    <div class="rv-arena-play" data-sprint-play>
      <div class="rv-arena-top">
        <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        <div class="rv-arena-timer" aria-live="polite">
          <span class="rv-arena-timer-num">${session.remainingSec}</span>
          <span class="rv-arena-timer-unit">秒</span>
        </div>
        <span class="rv-arena-combo${session.combo >= 2 ? " is-on" : ""}" data-combo aria-live="polite">${
          session.combo >= 2 ? `×${session.combo}` : ""
        }</span>
      </div>
      <div class="rv-arena-timer-bar" aria-hidden="true">
        <div class="rv-arena-timer-fill" style="width:${Math.max(
          0,
          Math.min(100, (session.remainingSec / SPRINT_DURATION_SEC) * 100)
        )}%"></div>
      </div>
      <p class="rv-arena-prompt" data-prompt>${escapeHtml(q.prompt)}</p>
      ${
        q.phonetic
          ? `<p class="rv-arena-phonetic">${escapeHtml(q.phonetic)}</p>`
          : ""
      }
      <p class="rv-arena-prompt-hint">${
        session.direction === "zh2en" ? "选出对应英文" : "选出对应释义"
      }</p>
      <div class="rv-arena-options" role="group" aria-label="选项">
        ${q.options
          .map(
            (opt, i) => `
          <button type="button" class="rv-arena-option" data-opt="${i}">${escapeHtml(opt)}</button>`
          )
          .join("")}
      </div>
      <p class="rv-arena-feedback" data-feedback hidden></p>
    </div>
  `;

  bindArenaChrome(root, onRefresh, session.direction);

  const play = root.querySelector("[data-sprint-play]");
  const feedback = root.querySelector("[data-feedback]");
  const comboEl = root.querySelector("[data-combo]");
  const promptEl = root.querySelector("[data-prompt]");
  let locked = false;

  root.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (locked || !state.arenaSession || state.arenaSession.finished) return;
      locked = true;
      const idx = Number(btn.getAttribute("data-opt"));
      const result = answerSprint(state.arenaSession, idx);
      const s = state.arenaSession;
      btn.classList.add(result.ok ? "is-ok" : "is-bad");
      root.querySelectorAll("[data-opt]").forEach((b) => {
        b.disabled = true;
        const bi = Number(b.getAttribute("data-opt"));
        if (bi === s.current.answerIndex) b.classList.add("is-ok");
      });
      if (feedback) {
        feedback.hidden = false;
        feedback.className = `rv-arena-feedback ${result.ok ? "is-ok" : "is-bad"}`;
        feedback.textContent = result.ok ? "对" : `答案：${result.correctText}`;
      }
      if (result.ok) {
        if (play) play.classList.add("is-hit");
        if (btn) btn.classList.add("is-hit");
        if (promptEl) promptEl.classList.add("is-hit");
        spawnBurst({
          container: play,
          origin: btn,
          combo: s.combo || 0,
          label: burstLabelFromCombo(s.combo || 0),
          shake: true
        });
        if (comboEl) {
          if (s.combo >= 2) {
            comboEl.textContent = `×${s.combo}`;
            comboEl.classList.add("is-on", "is-pop");
          } else {
            comboEl.textContent = "";
            comboEl.classList.remove("is-on");
          }
        }
        progressEl.textContent = `闪回 · ${s.remainingSec}s · 连对 ${s.combo}`;
      }
      const wait = result.ok ? burstWaitMs(s.combo || 0) : 700;
      window.setTimeout(() => {
        if (!state.arenaSession || state.arenaSession.finished) {
          onRefresh();
          return;
        }
        nextSprintQuestion(state.arenaSession);
        onRefresh();
      }, wait);
    });
  });

  clearSprintTimer();
  sprintTimer = setInterval(() => {
    const s = state.arenaSession;
    if (!s || s.mode !== "sprint" || s.finished) {
      clearSprintTimer();
      return;
    }
    s.remainingSec = Math.max(0, (s.remainingSec || 0) - 1);
    if (s.remainingSec <= 0) {
      s.finished = true;
      clearSprintTimer();
      onRefresh();
      return;
    }
    const num = root.querySelector(".rv-arena-timer-num");
    const fill = root.querySelector(".rv-arena-timer-fill");
    const combo = root.querySelector(".rv-arena-combo");
    if (num) num.textContent = String(s.remainingSec);
    if (fill) {
      fill.style.width = `${Math.max(0, Math.min(100, (s.remainingSec / SPRINT_DURATION_SEC) * 100))}%`;
    }
    if (combo) {
      if (s.combo >= 2) {
        combo.textContent = `×${s.combo}`;
        combo.classList.add("is-on");
      } else {
        combo.textContent = "";
        combo.classList.remove("is-on");
      }
    }
    progressEl.textContent = `闪回 · ${s.remainingSec}s · 连对 ${s.combo}`;
  }, 1000);
}

/**
 * @param {HTMLElement} root
 * @param {() => void} onRefresh
 * @param {"en2zh"|"zh2en"} [sprintDirection]
 */
function bindArenaChrome(root, onRefresh, sprintDirection) {
  root.querySelectorAll("[data-arena-back]").forEach((btn) => {
    btn.addEventListener("click", () => backToHub(onRefresh));
  });
  root.querySelectorAll("[data-arena-again]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-arena-again");
      if (kind === "sprint") {
        const session = createSprintSession(
          state.words || [],
          sprintDirection || "en2zh"
        );
        nextSprintQuestion(session);
        state.arenaSession = session;
        state.activeArenaMode = "sprint";
        onRefresh();
        return;
      }
      if (kind === "detective") {
        state.arenaSession = createDetectiveSession(
          state.words || [],
          state.captures || [],
          DETECTIVE_DEFAULT_COUNT
        );
        state.activeArenaMode = "detective";
        onRefresh();
      }
    });
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {() => void} opts.onRefresh
 */
function renderDetective({ root, progressEl, onRefresh }) {
  clearSprintTimer();
  const session = state.arenaSession;
  if (!session || session.mode !== "detective") {
    state.activeArenaMode = null;
    renderArenaHub({ root, progressEl, onRefresh });
    return;
  }

  const total = session.items.length;
  if (!total) {
    root.innerHTML = `
      <div class="rv-arena-play">
        <div class="rv-arena-top">
          <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        </div>
        ${poolEmptyHtml()}
      </div>
    `;
    bindArenaChrome(root, onRefresh);
    return;
  }

  if (session.finished || session.index >= total) {
    session.finished = true;
    progressEl.textContent = `侦探 · 结束`;
    root.innerHTML = `
      <div class="rv-arena-play">
        <div class="rv-arena-top">
          <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        </div>
        <div class="rv-arena-result">
          <h3 class="rv-arena-result-title">本局结束</h3>
          <ul class="rv-arena-stats">
            <li><span class="rv-arena-stat-label">答对</span><span class="rv-arena-stat-val">${session.correctCount}/${total}</span></li>
            <li><span class="rv-arena-stat-label">最长连对</span><span class="rv-arena-stat-val">${session.maxCombo || 0}</span></li>
          </ul>
          <div class="rv-arena-result-actions">
            <button type="button" class="btn btn-primary" data-arena-again="detective">再来一局</button>
            <button type="button" class="btn" data-arena-back>返回</button>
          </div>
        </div>
      </div>
    `;
    bindArenaChrome(root, onRefresh);
    return;
  }

  const item = session.items[session.index];
  const step = session.index + 1;
  progressEl.textContent = `侦探 · ${step}/${total}`;

  const source =
    item.pageTitle || item.pageUrl
      ? `<p class="rv-arena-source">${escapeHtml(item.pageTitle || item.pageUrl)}</p>`
      : "";

  const answered = item.correct != null;
  root.innerHTML = `
    <div class="rv-arena-play" data-detective-play>
      <div class="rv-arena-top">
        <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        <span class="rv-arena-step">${step} / ${total}</span>
        <span class="rv-arena-combo${session.combo >= 2 ? " is-on" : ""}" data-combo>${
          session.combo >= 2 ? `×${session.combo}` : ""
        }</span>
      </div>
      <p class="rv-arena-mode-tag">${item.mode === "context" ? "原文挖空" : "释义填词"}</p>
      ${
        item.mode === "context"
          ? `<blockquote class="rv-arena-cloze">${escapeHtml(item.promptText)}</blockquote>`
          : `<p class="rv-arena-gloss">${escapeHtml(item.promptText || "（无释义）")}</p>`
      }
      ${
        item.phonetic
          ? `<p class="rv-arena-phonetic">${escapeHtml(item.phonetic)}</p>`
          : ""
      }
      ${source}
      <form class="rv-arena-form" id="rv-arena-detective-form">
        <label class="rv-arena-label" for="rv-arena-answer">填入单词</label>
        <div class="rv-arena-input-row">
          <input type="text" id="rv-arena-answer" class="rv-arena-input" autocomplete="off" spellcheck="false"
            ${answered ? "disabled" : ""}
            value="${escapeHtml(item.userAnswer || "")}"
            placeholder="输入英文词">
        </div>
        ${
          answered
            ? `<p class="rv-arena-feedback ${item.correct ? "is-ok" : "is-bad"}">${
                item.correct
                  ? "对"
                  : `答案：${escapeHtml(item.word)}${
                      item.translation ? ` · ${escapeHtml(item.translation)}` : ""
                    }`
              }</p>
               <button type="button" class="btn btn-primary" data-detective-next>${
                 step >= total ? "查看结果" : "下一题"
               }</button>`
            : `<button type="submit" class="btn btn-primary" data-detective-submit>确认</button>`
        }
      </form>
    </div>
  `;

  bindArenaChrome(root, onRefresh);

  const play = root.querySelector("[data-detective-play]");
  const comboEl = root.querySelector("[data-combo]");

  const form = root.querySelector("#rv-arena-detective-form");
  const input = root.querySelector("#rv-arena-answer");
  if (input && !answered) {
    requestAnimationFrame(() => input.focus());
  }

  if (form && !answered) {
    let submitting = false;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (submitting) return;
      submitting = true;
      const val = input ? input.value : "";
      const result = answerDetective(session, val);
      const submitBtn = form.querySelector("[data-detective-submit]");
      if (input) input.disabled = true;
      if (submitBtn) submitBtn.disabled = true;

      if (result.ok) {
        if (input) input.classList.add("is-ok", "is-hit");
        if (comboEl && session.combo >= 2) {
          comboEl.textContent = `×${session.combo}`;
          comboEl.classList.add("is-on", "is-pop");
        }
        spawnBurst({
          container: play,
          origin: input || submitBtn || form,
          combo: session.combo || 0,
          label: burstLabelFromCombo(session.combo || 0),
          shake: true
        });
        window.setTimeout(() => onRefresh(), burstWaitMs(session.combo || 0));
        return;
      }
      onRefresh();
    });
  }

  const nextBtn = root.querySelector("[data-detective-next]");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      session.index += 1;
      if (session.index >= total) session.finished = true;
      onRefresh();
    });
  }
}
