import { escapeHtml } from "../shared/dom.js";
import {
  DETECTIVE_DEFAULT_COUNT,
  SPRINT_DURATION_DEFAULT,
  SPRINT_DURATION_MAX,
  SPRINT_DURATION_MIN,
  SPRINT_DURATION_STEP,
  answerDetective,
  answerSprint,
  clampSprintDuration,
  createDetectiveSession,
  createSprintSession,
  nextSprintQuestion,
  normalizeArenaDayKey,
  normalizeSprintDirection,
  sprintRemainingMs
} from "../shared/arena.js";
import {
  burstLabelFromCombo,
  burstWaitMs,
  spawnBurst
} from "../shared/fx-burst.js";
import { bindDayMultiselect, dayMultiselectHtml } from "../shared/day-multiselect.js";
import { dayFilterFromChecks, filterQuizPoolByDay, quizDayOptions, quizWordPool } from "../shared/quiz.js";
import { upsertArenaMisses } from "../shared/api.js";
import { state } from "./state.js";

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** @type {ReturnType<typeof setInterval> | null} */
let sprintTimer = null;
/** @type {number | null} */
let sprintRaf = null;

/**
 * Persist one arena miss (fire-and-forget).
 * @param {"sprint"|"detective"} source
 * @param {{ wordId?: string, word?: string, translation?: string, phonetic?: string } | null} miss
 */
function persistArenaMiss(source, miss) {
  if (!miss) return;
  const wordId = String(miss.wordId || "").trim();
  if (!wordId) return;
  upsertArenaMisses([
    {
      wordId,
      word: String(miss.word || "").trim(),
      translation: String(miss.translation || "").trim(),
      phonetic: String(miss.phonetic || "").trim(),
      source
    }
  ]).catch(() => {});
}

function missesResultHtml(misses) {
  const list = Array.isArray(misses) ? misses : [];
  if (!list.length) {
    return `<p class="rv-arena-misses-empty">本局没有做错，漂亮。</p>`;
  }
  return `<div class="rv-arena-misses">
    <h4 class="rv-arena-misses-title">本次做错 · ${list.length}</h4>
    <ul class="rv-arena-miss-list">
      ${list
        .map((m) => {
          const word = escapeHtml(m.word || "");
          const translation = escapeHtml(m.translation || "");
          const phonetic = m.phonetic
            ? `<span class="rv-arena-miss-phonetic">${escapeHtml(m.phonetic)}</span>`
            : "";
          const picked = m.picked
            ? `<span class="rv-arena-miss-picked">你选：${escapeHtml(m.picked)}</span>`
            : "";
          return `<li class="rv-arena-miss-item">
            <div class="rv-arena-miss-main">
              <span class="rv-arena-miss-word">${word}</span>
              ${phonetic}
            </div>
            <div class="rv-arena-miss-sub">
              <span class="rv-arena-miss-gloss">${translation || "—"}</span>
              ${picked}
            </div>
          </li>`;
        })
        .join("")}
    </ul>
  </div>`;
}

function clearSprintTimer() {
  if (sprintTimer != null) {
    clearInterval(sprintTimer);
    sprintTimer = null;
  }
  if (sprintRaf != null) {
    cancelAnimationFrame(sprintRaf);
    sprintRaf = null;
  }
}

function scopedArenaPool(dayKey) {
  return filterQuizPoolByDay(quizWordPool(state.words || []), normalizeArenaDayKey(dayKey));
}

function daySelectHtml(pool, which) {
  const options = [{ key: "all", label: "全部", count: pool.length }, ...quizDayOptions(pool)];
  return `<label class="rv-arena-field">
    <span class="rv-arena-field-label">时间</span>
    ${dayMultiselectHtml(options, {
      dataDay: which,
      wrapAttrs: `data-arena-days="${escapeHtml(which)}"`
    })}
  </label>`;
}

function durationFillPct(sec) {
  const span = SPRINT_DURATION_MAX - SPRINT_DURATION_MIN;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, ((sec - SPRINT_DURATION_MIN) / span) * 100));
}

function ringToneClass(remainSec) {
  if (remainSec <= 10) return " is-danger";
  if (remainSec <= 30) return " is-warn";
  return "";
}

function sprintRingHtml(remainSec, durationSec) {
  const dur = Math.max(1, Number(durationSec) || SPRINT_DURATION_DEFAULT);
  const frac = Math.max(0, Math.min(1, remainSec / dur));
  const offset = RING_C * (1 - frac);
  const display = Math.max(0, Math.ceil(remainSec));
  return `<div class="rv-arena-ring${ringToneClass(remainSec)}" data-sprint-ring aria-live="polite" aria-label="${display}秒">
    <svg class="rv-arena-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="rv-arena-ring-track" cx="32" cy="32" r="${RING_R}"></circle>
      <circle class="rv-arena-ring-arc" cx="32" cy="32" r="${RING_R}"
        stroke-dasharray="${RING_C.toFixed(3)}"
        stroke-dashoffset="${offset.toFixed(3)}"
        transform="rotate(-90 32 32)"></circle>
    </svg>
    <span class="rv-arena-ring-num">${display}</span>
  </div>`;
}

function applySprintRing(root, remainSec, durationSec) {
  const wrap = root.querySelector("[data-sprint-ring]");
  const arc = root.querySelector(".rv-arena-ring-arc");
  const num = root.querySelector(".rv-arena-ring-num");
  const dur = Math.max(1, Number(durationSec) || SPRINT_DURATION_DEFAULT);
  const frac = Math.max(0, Math.min(1, remainSec / dur));
  if (wrap) {
    wrap.classList.toggle("is-warn", remainSec <= 30 && remainSec > 10);
    wrap.classList.toggle("is-danger", remainSec <= 10);
    wrap.setAttribute("aria-label", `${Math.max(0, Math.ceil(remainSec))}秒`);
  }
  if (arc) arc.setAttribute("stroke-dashoffset", String((RING_C * (1 - frac)).toFixed(3)));
  if (num) num.textContent = String(Math.max(0, Math.ceil(remainSec)));
}

function startDetective(dayKey, onRefresh) {
  const scoped = scopedArenaPool(dayKey);
  if (!scoped.length) return;
  state.arenaSession = createDetectiveSession(
    scoped,
    state.captures || [],
    DETECTIVE_DEFAULT_COUNT,
    dayKey
  );
  state.activeArenaMode = "detective";
  onRefresh();
}

function startSprint({ dayKey, direction, durationSec, onRefresh }) {
  const scoped = scopedArenaPool(dayKey);
  if (!scoped.length) return;
  const session = createSprintSession(scoped, direction, durationSec, dayKey);
  nextSprintQuestion(session);
  state.arenaSession = session;
  state.activeArenaMode = "sprint";
  onRefresh();
}

function poolEmptyHtml() {
  return `<p class="rv-arena-empty">还没有可练习的未学会单词（需有释义）。先在网页上划词标记，再回来玩。</p>`;
}

/** Context detective: passage blank + loupe */
function iconDetective() {
  return `<svg class="rv-arena-card-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect x="6" y="7" width="20" height="26" rx="3" stroke="currentColor" stroke-width="1.75"/>
    <path d="M11 14h10M11 19h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M11 24h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-dasharray="2.2 2.4"/>
    <circle cx="27.5" cy="27.5" r="6" stroke="currentColor" stroke-width="1.75"/>
    <path d="M32 32l4.5 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
  </svg>`;
}

/** Flash sprint: stopwatch + spark */
function iconSprint() {
  return `<svg class="rv-arena-card-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M16 7h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M20 7v3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <circle cx="20" cy="23" r="11" stroke="currentColor" stroke-width="1.75"/>
    <path d="M20 23V15.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M20 23l6 3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M30.5 11.5l2.2-1.1M32.2 14.2l1.1-2.2M33.5 12.8l-1.8 1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
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
  const dur = SPRINT_DURATION_DEFAULT;
  const fillPct = durationFillPct(dur);

  root.innerHTML = `
    <div class="rv-arena-hub">
      <p class="rv-arena-hub-lead">短局练习，不生成试卷。用你划过的词热身。</p>
      ${
        n
          ? `<div class="rv-arena-cards">
          <article class="rv-arena-card">
            <div class="rv-arena-card-icon is-detective" aria-hidden="true">${iconDetective()}</div>
            <h3 class="rv-arena-card-title">语境侦探</h3>
            <p class="rv-arena-card-desc">从你当初划词的原文里挖空，凭语境填回单词。没有原文时改为看释义填词。</p>
            ${daySelectHtml(pool, "detective")}
            <button type="button" class="btn" data-arena-start="detective">开始</button>
          </article>
          <article class="rv-arena-card">
            <div class="rv-arena-card-icon is-sprint" aria-hidden="true">${iconSprint()}</div>
            <h3 class="rv-arena-card-title">六十秒闪回</h3>
            <p class="rv-arena-card-desc">限时抢答：认词或认义，四选一。连对会安静地叠 combo。</p>
            ${daySelectHtml(pool, "sprint")}
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
            <div class="rv-arena-duration">
              <div class="rv-arena-duration-head">
                <span class="rv-arena-field-label">时长</span>
                <span class="rv-arena-duration-val" data-sprint-duration-label>${dur}s</span>
              </div>
              <div class="rv-arena-duration-track">
                <div class="rv-arena-duration-fill" data-sprint-duration-fill style="width:${fillPct}%"></div>
                <input type="range" min="${SPRINT_DURATION_MIN}" max="${SPRINT_DURATION_MAX}"
                  step="${SPRINT_DURATION_STEP}" value="${dur}" data-sprint-duration aria-label="闪回时长">
              </div>
            </div>
            <button type="button" class="btn" data-arena-start="sprint">开始</button>
          </article>
        </div>`
          : poolEmptyHtml()
      }
    </div>
  `;

  function dayBoxes(which) {
    return root.querySelectorAll(`[data-arena-day="${which}"]`);
  }

  function selectedDayKey(which) {
    return dayFilterFromChecks(dayBoxes(which));
  }

  function syncStartEnabled(which) {
    const btn = root.querySelector(`[data-arena-start="${which}"]`);
    if (!btn) return;
    const count = scopedArenaPool(selectedDayKey(which)).length;
    btn.disabled = count < 1;
  }

  root.querySelectorAll("[data-arena-days]").forEach((wrap) => {
    const which = wrap.getAttribute("data-arena-days");
    bindDayMultiselect(wrap, () => syncStartEnabled(which));
    syncStartEnabled(which);
  });

  const durInput = root.querySelector("[data-sprint-duration]");
  const durLabel = root.querySelector("[data-sprint-duration-label]");
  const durFill = root.querySelector("[data-sprint-duration-fill]");
  if (durInput) {
    const syncDur = () => {
      const sec = clampSprintDuration(durInput.value);
      durInput.value = String(sec);
      if (durLabel) durLabel.textContent = `${sec}s`;
      if (durFill) durFill.style.width = `${durationFillPct(sec)}%`;
    };
    durInput.addEventListener("input", syncDur);
  }

  root.querySelectorAll("[data-arena-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-arena-start");
      if (kind === "detective") {
        startDetective(selectedDayKey("detective"), onRefresh);
        return;
      }
      if (kind === "sprint") {
        const dirEl = root.querySelector('input[name="rv-sprint-dir"]:checked');
        const durationEl = root.querySelector("[data-sprint-duration]");
        startSprint({
          dayKey: selectedDayKey("sprint"),
          direction: normalizeSprintDirection(dirEl && dirEl.value),
          durationSec: durationEl && durationEl.value,
          onRefresh
        });
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
 * Performance tone for sprint result stats.
 * @param {"correct"|"answered"|"rate"|"combo"} kind
 * @param {number} value
 * @returns {"weak"|"fair"|"good"|"great"}
 */
function sprintStatTone(kind, value) {
  const n = Number(value) || 0;
  if (kind === "rate") {
    if (n >= 90) return "great";
    if (n >= 75) return "good";
    if (n >= 55) return "fair";
    return "weak";
  }
  if (kind === "combo") {
    if (n >= 8) return "great";
    if (n >= 5) return "good";
    if (n >= 2) return "fair";
    return "weak";
  }
  if (kind === "correct") {
    if (n >= 20) return "great";
    if (n >= 12) return "good";
    if (n >= 6) return "fair";
    return "weak";
  }
  // answered volume in 60s
  if (n >= 24) return "great";
  if (n >= 14) return "good";
  if (n >= 7) return "fair";
  return "weak";
}

/**
 * @param {string} label
 * @param {string|number} display
 * @param {"weak"|"fair"|"good"|"great"} tone
 */
function sprintStatHtml(label, display, tone) {
  return `<li class="rv-arena-stat is-${escapeHtml(tone)}">
    <span class="rv-arena-stat-label">${escapeHtml(label)}</span>
    <span class="rv-arena-stat-val">${escapeHtml(String(display))}</span>
  </li>`;
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
    const maxCombo = session.maxCombo || 0;
    const durationSec = session.durationSec || SPRINT_DURATION_DEFAULT;
    const misses = Array.isArray(session.misses) ? session.misses : [];
    root.innerHTML = `
      <div class="rv-arena-play">
        <div class="rv-arena-top">
          <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        </div>
        <div class="rv-arena-result">
          <h3 class="rv-arena-result-title">${durationSec}秒结束</h3>
          <ul class="rv-arena-stats">
            ${sprintStatHtml("答对", correct, sprintStatTone("correct", correct))}
            ${sprintStatHtml("作答", answered, sprintStatTone("answered", answered))}
            ${sprintStatHtml("正确率", `${rate}%`, sprintStatTone("rate", rate))}
            ${sprintStatHtml("最长连对", maxCombo, sprintStatTone("combo", maxCombo))}
          </ul>
          ${missesResultHtml(misses)}
          <div class="rv-arena-result-actions">
            <button type="button" class="btn btn-primary" data-arena-again="sprint">再来一局</button>
            <button type="button" class="btn" data-arena-back>返回</button>
          </div>
        </div>
      </div>
    `;
    bindArenaChrome(root, onRefresh, session);
    return;
  }

  if (!session.current) nextSprintQuestion(session);
  const q = session.current;
  if (!q) {
    session.finished = true;
    renderSprint({ root, progressEl, onRefresh });
    return;
  }

  const remainMs = sprintRemainingMs(session);
  if (remainMs <= 0) {
    session.remainingSec = 0;
    session.finished = true;
    renderSprint({ root, progressEl, onRefresh });
    return;
  }
  const remainSec = remainMs / 1000;
  const durationSec = session.durationSec || SPRINT_DURATION_DEFAULT;
  session.remainingSec = Math.max(0, Math.ceil(remainSec));
  progressEl.textContent = `闪回 · ${session.remainingSec}s · 连对 ${session.combo}`;

  root.innerHTML = `
    <div class="rv-arena-play" data-sprint-play>
      <div class="rv-arena-top">
        <button type="button" class="rv-arena-back" data-arena-back>← 练习场</button>
        ${sprintRingHtml(remainSec, durationSec)}
        <span class="rv-arena-combo${session.combo >= 2 ? " is-on" : ""}" data-combo aria-live="polite">${
          session.combo >= 2 ? `×${session.combo}` : ""
        }</span>
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

  bindArenaChrome(root, onRefresh, session);

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
      if (!result.ok && s.current) {
        persistArenaMiss("sprint", {
          wordId: s.current.wordId,
          word: s.current.word,
          translation: s.current.translation,
          phonetic: s.current.phonetic
        });
      }
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
      const wait = result.ok ? burstWaitMs(s.combo || 0) : 1500;
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
  const tick = () => {
    const s = state.arenaSession;
    if (!s || s.mode !== "sprint" || s.finished) {
      sprintRaf = null;
      return;
    }
    const ms = sprintRemainingMs(s);
    const dur = s.durationSec || SPRINT_DURATION_DEFAULT;
    const remain = ms / 1000;
    s.remainingSec = Math.max(0, Math.ceil(remain));
    if (ms <= 0) {
      s.remainingSec = 0;
      s.finished = true;
      sprintRaf = null;
      onRefresh();
      return;
    }
    applySprintRing(root, remain, dur);
    progressEl.textContent = `闪回 · ${s.remainingSec}s · 连对 ${s.combo}`;
    sprintRaf = requestAnimationFrame(tick);
  };
  sprintRaf = requestAnimationFrame(tick);
}

/**
 * @param {HTMLElement} root
 * @param {() => void} onRefresh
 * @param {object} [prevSession]
 */
function bindArenaChrome(root, onRefresh, prevSession) {
  root.querySelectorAll("[data-arena-back]").forEach((btn) => {
    btn.addEventListener("click", () => backToHub(onRefresh));
  });
  root.querySelectorAll("[data-arena-again]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-arena-again");
      const prev = prevSession || state.arenaSession || {};
      if (kind === "sprint") {
        startSprint({
          dayKey: prev.dayKey,
          direction: prev.direction,
          durationSec: prev.durationSec,
          onRefresh
        });
        return;
      }
      if (kind === "detective") {
        startDetective(prev.dayKey, onRefresh);
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
    const misses = Array.isArray(session.misses) ? session.misses : [];
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
          ${missesResultHtml(misses)}
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
      ${source}
      <form class="rv-arena-form" id="rv-arena-detective-form">
        <label class="rv-arena-label" for="rv-arena-answer">填入单词</label>
        <div class="rv-arena-input-row">
          <input type="text" id="rv-arena-answer" class="rv-arena-input" autocomplete="off" spellcheck="false"
            ${answered ? "disabled" : ""}
            value="${escapeHtml(item.userAnswer || "")}"
            placeholder="输入英文词">
          ${
            item.phonetic
              ? `<button type="button" class="rv-arena-hint-btn" data-show-phonetic ${
                  answered ? "disabled" : ""
                }>音标</button>`
              : ""
          }
        </div>
        <p class="rv-arena-phonetic" data-phonetic hidden>${escapeHtml(item.phonetic || "")}</p>
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
  const phoneticBtn = root.querySelector("[data-show-phonetic]");
  const phoneticEl = root.querySelector("[data-phonetic]");
  if (phoneticBtn && phoneticEl) {
    phoneticBtn.addEventListener("click", () => {
      phoneticEl.hidden = !phoneticEl.hidden;
    });
  }

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

      if (!result.ok) {
        const item = session.items[session.index];
        if (item) {
          persistArenaMiss("detective", {
            wordId: item.id,
            word: item.word,
            translation: item.translation,
            phonetic: item.phonetic
          });
        }
      }

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
