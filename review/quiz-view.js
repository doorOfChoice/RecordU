import { escapeHtml } from "../shared/dom.js";
import { blankItemsForGrading, pickRandomWords, quizWordPool, scoreQuiz } from "../shared/quiz.js";
import {
  deleteQuiz,
  generateQuiz,
  getAllQuizzes,
  gradeQuizBlanks,
  saveQuiz,
  updateQuiz
} from "../shared/api.js";
import { alert as modalAlert, confirm as modalConfirm, promptQuizGenerate } from "../modal.js";
import { state } from "./state.js";

function statusMeta(q) {
  if (q.status === "done") {
    const s = q.score;
    return {
      key: "done",
      label: s && s.total ? `已完成 ${s.correct}/${s.total}` : "已完成"
    };
  }
  if (q.status === "in_progress") {
    return { key: "progress", label: "进行中" };
  }
  return { key: "ready", label: "未做" };
}

function formatQuizTime(ts) {
  const d = new Date(ts || Date.now());
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}月${day}日 ${hh}:${mm}`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {() => void} opts.onRefresh
 * @param {(id: string) => void} opts.onOpen
 */
export function renderQuizList({ root, progressEl, onRefresh, onOpen }) {
  const list = Array.isArray(state.quizzes) ? state.quizzes : [];
  progressEl.textContent = `试题 · ${list.length} 份`;

  const pool = quizWordPool(state.words || []);
  const canGenerate = pool.length > 0;

  root.innerHTML = `
    <div class="rv-quiz-toolbar">
      <p class="rv-quiz-toolbar-hint">用大模型从未学会词中出题，卷面含选择、填空、连线。</p>
      <button type="button" class="btn btn-primary rv-quiz-gen-btn" id="rv-quiz-gen" ${canGenerate ? "" : "disabled"}>生成试卷</button>
    </div>
    ${
      list.length
        ? `<ul class="rv-quiz-list">
            ${list
              .map((q) => {
                const st = statusMeta(q);
                return `
              <li class="rv-quiz-item is-${escapeHtml(st.key)}" data-id="${escapeHtml(q.id)}">
                <button type="button" class="rv-quiz-item-main" data-act="open">
                  <span class="rv-quiz-item-title">${escapeHtml(formatQuizTime(q.createdAt))} · ${q.count || 0} 词 · ${
                    q.promptLang === "zh" ? "中文出题" : "英文出题"
                  }</span>
                  <span class="rv-quiz-item-status is-${escapeHtml(st.key)}">${escapeHtml(st.label)}</span>
                </button>
                <button type="button" class="rv-quiz-item-del" data-act="delete" aria-label="删除试卷">删除</button>
              </li>`;
              })
              .join("")}
          </ul>`
        : `<p class="rv-quiz-empty">还没有试卷。点右上角「生成试卷」开始练习。</p>`
    }
  `;

  const genBtn = root.querySelector("#rv-quiz-gen");
  genBtn.addEventListener("click", async () => {
    if (!canGenerate) {
      await modalAlert({
        title: "无法生成",
        message: "没有可练习的未学会且有释义的单词。"
      });
      return;
    }
    const maxCount = Math.min(50, pool.length);
    const choice = await promptQuizGenerate({
      maxCount,
      defaultCount: Math.min(10, maxCount)
    });
    if (!choice) return;

    genBtn.disabled = true;
    const prev = genBtn.textContent;
    genBtn.textContent = "生成中…";
    try {
      const picked = pickRandomWords(pool, choice.count);
      const res = await generateQuiz(picked, choice.promptLang);
      if (!res || !res.ok) {
        const code = res && res.code;
        let msg = (res && res.error) || "生成失败";
        if (code === "need_key") msg = "请先到设置 → 大模型填写 API Key。";
        await modalAlert({ title: "生成失败", message: msg });
        return;
      }
      const saveRes = await saveQuiz({
        count: picked.length,
        promptLang: choice.promptLang,
        status: "ready",
        sourceWords: picked,
        items: res.items,
        score: null,
        finishedAt: null
      });
      if (!saveRes || !saveRes.ok || !saveRes.quiz) {
        await modalAlert({ title: "保存失败", message: "试卷未能写入本地。" });
        return;
      }
      state.quizzes = await getAllQuizzes();
      onOpen(saveRes.quiz.id);
    } catch (e) {
      await modalAlert({
        title: "生成失败",
        message: e && e.message ? e.message : String(e)
      });
    } finally {
      genBtn.disabled = !canGenerate;
      genBtn.textContent = prev;
    }
  });

  root.querySelectorAll(".rv-quiz-item").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-act="open"]').addEventListener("click", () => onOpen(id));
    el.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      const ok = await modalConfirm({
        title: "删除这份试卷？",
        message: "删除后无法恢复。",
        confirmText: "删除",
        cancelText: "取消",
        danger: true
      });
      if (!ok) return;
      await deleteQuiz(id);
      if (state.activeQuizId === id) state.activeQuizId = null;
      state.quizzes = await getAllQuizzes();
      onRefresh();
    });
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {HTMLElement} opts.progressEl
 * @param {object} opts.quiz
 * @param {() => void} opts.onBack
 * @param {(quiz: object) => void} opts.onUpdated
 */
export function renderQuizTake({ root, progressEl, quiz, onBack, onUpdated }) {
  const readonly = quiz.status === "done";
  progressEl.textContent = readonly
    ? `试卷回顾 · ${quiz.score ? `${quiz.score.correct}/${quiz.score.total}` : "已完成"}`
    : `答题中 · ${quiz.count || 0} 词 · ${quiz.promptLang === "zh" ? "中文出题" : "英文出题"}`;

  if (!readonly && quiz.status === "ready") {
    quiz.status = "in_progress";
    updateQuiz(quiz.id, { status: "in_progress" }).then((res) => {
      if (res && res.quiz && typeof onUpdated === "function") {
        // keep list status fresh without remounting take view
        const list = state.quizzes || [];
        state.quizzes = list.map((q) => (q.id === res.quiz.id ? { ...q, status: "in_progress" } : q));
      }
    });
  }

  const items = Array.isArray(quiz.items) ? quiz.items : [];

  root.innerHTML = `
    <div class="rv-quiz-take">
      <div class="rv-quiz-take-bar">
        <button type="button" class="btn" id="rv-quiz-back">返回列表</button>
        ${
          readonly
            ? `<span class="rv-quiz-take-score is-done">得分 ${escapeHtml(
                quiz.score ? `${quiz.score.correct}/${quiz.score.total}` : "—"
              )}</span>`
            : `<button type="button" class="btn btn-primary rv-quiz-submit-btn" id="rv-quiz-submit">交卷</button>`
        }
      </div>
      <ol class="rv-quiz-questions">
        ${items.map((item, i) => questionHtml(item, i, readonly)).join("")}
      </ol>
    </div>
  `;

  root.querySelector("#rv-quiz-back").addEventListener("click", onBack);

  if (!readonly) {
    bindMatchInteractions(root);
    root.querySelector("#rv-quiz-submit").addEventListener("click", async () => {
      const submitBtn = root.querySelector("#rv-quiz-submit");
      const next = collectAnswers(quiz, root);
      const blanks = blankItemsForGrading(next);
      let blankGrades = {};

      if (blanks.length) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "判分中…";
        }
        try {
          const res = await gradeQuizBlanks(blanks, next.promptLang === "zh" ? "zh" : "en");
          if (res && res.ok && res.grades) {
            blankGrades = res.grades;
          } else {
            const code = res && res.code;
            let msg = (res && res.error) || "填空判分失败，将按近似匹配计分";
            if (code === "need_key") {
              msg = "未配置 API Key，填空将按近似匹配计分。可到设置 → 大模型填写。";
            }
            await modalAlert({ title: "填空判分", message: msg });
          }
        } catch (e) {
          await modalAlert({
            title: "填空判分",
            message: `${e && e.message ? e.message : e}；将按近似匹配计分`
          });
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "交卷";
          }
        }
      }

      const score = scoreQuiz(next, { blankGrades });
      next.status = "done";
      next.score = score;
      next.finishedAt = Date.now();
      const res = await updateQuiz(next.id, {
        items: next.items,
        status: next.status,
        score: next.score,
        finishedAt: next.finishedAt
      });
      if (res && res.quiz) {
        onUpdated(res.quiz);
      } else {
        onUpdated(next);
      }
    });
  }
}

function questionHtml(item, index, readonly) {
  const mark =
    readonly && item.correct != null
      ? item.correct
        ? `<span class="rv-quiz-mark is-ok">正确</span>`
        : `<span class="rv-quiz-mark is-bad">错误</span>`
      : "";

  if (item.type === "choice") {
    const options = item.options || [];
    return `
      <li class="rv-quiz-q" data-qid="${escapeHtml(item.id)}" data-type="choice">
        <div class="rv-quiz-q-head"><span class="rv-quiz-q-num is-choice">${index + 1}. 选择</span>${mark}</div>
        <p class="rv-quiz-q-prompt">${escapeHtml(item.prompt)}</p>
        <div class="rv-quiz-choices" role="radiogroup">
          ${options
            .map((opt, oi) => {
              const checked = item.userAnswer != null && Number(item.userAnswer) === oi;
              const isAns = readonly && Number(item.answerIndex) === oi;
              return `
              <label class="rv-quiz-choice${isAns ? " is-answer" : ""}${
                readonly && checked && !item.correct ? " is-wrong" : ""
              }">
                <input type="radio" name="q-${escapeHtml(item.id)}" value="${oi}" ${
                  checked ? "checked" : ""
                } ${readonly ? "disabled" : ""}>
                <span>${escapeHtml(opt)}</span>
              </label>`;
            })
            .join("")}
        </div>
      </li>`;
  }

  if (item.type === "blank") {
    return `
      <li class="rv-quiz-q" data-qid="${escapeHtml(item.id)}" data-type="blank">
        <div class="rv-quiz-q-head"><span class="rv-quiz-q-num is-blank">${index + 1}. 填空</span>${mark}</div>
        <p class="rv-quiz-q-prompt">${escapeHtml(item.prompt)}</p>
        <input type="text" class="rv-quiz-blank" value="${escapeHtml(
          item.userAnswer == null ? "" : String(item.userAnswer)
        )}" ${readonly ? "disabled" : ""} placeholder="输入答案">
        ${
          readonly
            ? `<p class="rv-quiz-answer-key">标准答案：${escapeHtml(item.answer || "")}</p>`
            : ""
        }
      </li>`;
  }

  if (item.type === "match") {
    const left = item.left || [];
    const right = item.right || [];
    const user = Array.isArray(item.userAnswer) ? item.userAnswer : left.map(() => -1);
    return `
      <li class="rv-quiz-q" data-qid="${escapeHtml(item.id)}" data-type="match">
        <div class="rv-quiz-q-head"><span class="rv-quiz-q-num is-match">${index + 1}. 连线</span>${mark}</div>
        <p class="rv-quiz-q-hint">先点左侧一项，再点右侧对应项。</p>
        <div class="rv-quiz-match" data-match-id="${escapeHtml(item.id)}">
          <div class="rv-quiz-match-col">
            ${left
              .map(
                (t, i) =>
                  `<button type="button" class="rv-quiz-match-chip" data-side="left" data-index="${i}" data-label="${escapeHtml(
                    t
                  )}" ${readonly ? "disabled" : ""}>${escapeHtml(t)}${
                    user[i] >= 0 ? `<i class="rv-quiz-match-link">→ ${user[i] + 1}</i>` : ""
                  }</button>`
              )
              .join("")}
          </div>
          <div class="rv-quiz-match-col">
            ${right
              .map(
                (t, i) =>
                  `<button type="button" class="rv-quiz-match-chip" data-side="right" data-index="${i}" data-label="${escapeHtml(
                    t
                  )}" ${readonly ? "disabled" : ""}><b>${i + 1}.</b> ${escapeHtml(t)}</button>`
              )
              .join("")}
          </div>
        </div>
        ${
          readonly
            ? `<p class="rv-quiz-answer-key">正确对应：${left
                .map((t, i) => `${escapeHtml(t)} → ${escapeHtml(right[item.links[i]] || "")}`)
                .join("；")}</p>`
            : ""
        }
      </li>`;
  }

  return "";
}

function bindMatchInteractions(root) {
  root.querySelectorAll(".rv-quiz-match").forEach((box) => {
    let leftPick = -1;
    const leftLen = box.querySelectorAll('[data-side="left"]').length;
    const links = Array(leftLen).fill(-1);

    // restore from chip labels already rendered — re-parse → N
    box.querySelectorAll('[data-side="left"]').forEach((chip) => {
      const i = Number(chip.dataset.index);
      const m = /→\s*(\d+)/.exec(chip.textContent || "");
      if (m) links[i] = Number(m[1]) - 1;
    });
    box._links = links;

    box.addEventListener("click", (e) => {
      const chip = e.target.closest(".rv-quiz-match-chip");
      if (!chip || chip.disabled) return;
      const side = chip.dataset.side;
      const index = Number(chip.dataset.index);
      if (side === "left") {
        leftPick = index;
        box.querySelectorAll('[data-side="left"]').forEach((c) => {
          c.classList.toggle("is-picked", Number(c.dataset.index) === leftPick);
        });
        return;
      }
      if (side === "right" && leftPick >= 0) {
        // clear previous use of this right index
        for (let i = 0; i < links.length; i++) {
          if (links[i] === index) links[i] = -1;
        }
        links[leftPick] = index;
        box._links = links;
        box.querySelectorAll('[data-side="left"]').forEach((c) => {
          const i = Number(c.dataset.index);
          const text = c.dataset.label || "";
          c.innerHTML =
            escapeHtml(text) +
            (links[i] >= 0 ? `<i class="rv-quiz-match-link">→ ${links[i] + 1}</i>` : "");
          c.classList.remove("is-picked");
        });
        leftPick = -1;
      }
    });
  });
}

function collectAnswers(quiz, root) {
  const next = {
    ...quiz,
    items: (quiz.items || []).map((item) => ({ ...item }))
  };
  for (const item of next.items) {
    const el = root.querySelector(`.rv-quiz-q[data-qid="${CSS.escape(item.id)}"]`);
    if (!el) continue;
    if (item.type === "choice") {
      const checked = el.querySelector('input[type="radio"]:checked');
      item.userAnswer = checked ? Number(checked.value) : null;
    } else if (item.type === "blank") {
      const input = el.querySelector(".rv-quiz-blank");
      item.userAnswer = input ? input.value.trim() : "";
    } else if (item.type === "match") {
      const box = el.querySelector(".rv-quiz-match");
      item.userAnswer = box && Array.isArray(box._links) ? box._links.slice() : (item.left || []).map(() => -1);
    }
  }
  if (next.status === "ready") next.status = "in_progress";
  return next;
}
