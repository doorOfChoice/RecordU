import { escapeHtml } from "../shared/dom.js";
import {
  blankItemsForGrading,
  chunkList,
  enrichWordsForQuiz,
  filterQuizPoolByDay,
  pickRandomWords,
  quizDayOptions,
  quizDifficultyLabel,
  quizWordPool,
  scoreQuiz,
  splitBlanksForGrading
} from "../shared/quiz.js";
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

const QUIZ_GENERATE_CHUNK = 5;

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
  progressEl.textContent = `试卷 · ${list.length} 份`;

  const pool = quizWordPool(state.words || []);
  const canGenerate = pool.length > 0;

  root.innerHTML = `
    <div class="rv-quiz-toolbar">
      <p class="rv-quiz-toolbar-hint">用大模型从未学会词中出题：语境填空、用法辨析、场景连线（会参考备注与原文语境）。</p>
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
                  } · ${escapeHtml(quizDifficultyLabel(q.difficulty))}</span>
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
    const dayOptions = [{ key: "all", label: "全部", count: pool.length }, ...quizDayOptions(pool)];
    const maxCount = Math.min(50, pool.length);
    const choice = await promptQuizGenerate({
      maxCount,
      defaultCount: Math.min(10, maxCount),
      dayOptions
    });
    if (!choice) return;

    const scoped = filterQuizPoolByDay(pool, choice.dayKey);
    if (!scoped.length) {
      await modalAlert({
        title: "无法生成",
        message: "所选日期没有可练习的单词。"
      });
      return;
    }

    genBtn.disabled = true;
    const prev = genBtn.textContent;
    genBtn.textContent = "生成中…";
    try {
      const picked = pickRandomWords(scoped, choice.count);
      const captures = Array.isArray(state.captures) ? state.captures : [];
      const enriched = enrichWordsForQuiz(picked, captures);
      const chunks = chunkList(enriched, QUIZ_GENERATE_CHUNK);
      console.log("[RecordU quiz] ui generate start", {
        count: enriched.length,
        chunks: chunks.length,
        chunkSize: QUIZ_GENERATE_CHUNK,
        concurrent: true,
        captures: captures.length,
        withContext: enriched.filter((w) => w && w.context).length,
        promptLang: choice.promptLang,
        difficulty: choice.difficulty
      });

      let done = 0;
      const setProgress = () => {
        genBtn.textContent =
          chunks.length > 1 ? `生成中 ${done}/${chunks.length}…` : "生成中…";
      };
      setProgress();

      const results = await Promise.all(
        chunks.map(async (chunk, i) => {
          const t0 = Date.now();
          console.log("[RecordU quiz] ui chunk request", {
            chunk: `${i + 1}/${chunks.length}`,
            words: chunk.length
          });
          try {
            const res = await generateQuiz(chunk, choice.promptLang, choice.difficulty);
            console.log("[RecordU quiz] ui chunk response", {
              chunk: `${i + 1}/${chunks.length}`,
              ok: !!(res && res.ok),
              code: res && res.code,
              items: res && Array.isArray(res.items) ? res.items.length : 0,
              error: res && res.error,
              ms: Date.now() - t0,
              runtimeError: chrome.runtime.lastError && chrome.runtime.lastError.message
            });
            return res;
          } finally {
            done += 1;
            setProgress();
          }
        })
      );

      for (const res of results) {
        if (!res || !res.ok) {
          const code = res && res.code;
          let msg = (res && res.error) || "生成失败";
          if (code === "need_key") msg = "请先到设置 → 大模型填写 API Key。";
          else if (code === "timeout") msg = "请求超时，请减少题量或稍后重试。";
          await modalAlert({ title: "生成失败", message: msg });
          return;
        }
      }

      const allItems = [];
      for (const res of results) {
        if (Array.isArray(res.items)) allItems.push(...res.items);
      }
      if (!allItems.length) {
        await modalAlert({ title: "生成失败", message: "模型未返回有效题目。" });
        return;
      }
      console.log("[RecordU quiz] ui save", { items: allItems.length, words: enriched.length });
      const saveRes = await saveQuiz({
        count: enriched.length,
        promptLang: choice.promptLang,
        difficulty: choice.difficulty,
        showSourceWords: !!choice.showSourceWords,
        status: "ready",
        sourceWords: enriched,
        items: allItems,
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
      console.warn("[RecordU quiz] ui generate exception", e);
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
    : `答题中 · ${quiz.count || 0} 词 · ${quiz.promptLang === "zh" ? "中文出题" : "英文出题"} · ${quizDifficultyLabel(quiz.difficulty)}`;

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
  const sourceWords = Array.isArray(quiz.sourceWords) ? quiz.sourceWords : [];
  const sourceWordTags =
    quiz.showSourceWords && sourceWords.length
      ? `<div class="rv-quiz-source-words" aria-label="考点词">
          <div class="rv-quiz-source-words-label">考点词</div>
          <div class="rv-quiz-source-words-list">
            ${sourceWords
              .map((w) => {
                const word = String((w && w.word) || "").trim();
                if (!word) return "";
                const tip = String((w && w.translation) || "").trim();
                return `<span class="rv-quiz-source-word"${
                  tip ? ` title="${escapeHtml(tip)}"` : ""
                }>${escapeHtml(word)}</span>`;
              })
              .filter(Boolean)
              .join("")}
          </div>
        </div>`
      : "";

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
      ${sourceWordTags}
      <ol class="rv-quiz-questions">
        ${items.map((item, i) => questionHtml(item, i, readonly)).join("")}
      </ol>
    </div>
  `;

  root.querySelector("#rv-quiz-back").addEventListener("click", onBack);

  setupMatchUI(root, readonly);

  if (!readonly) {
    root.querySelector("#rv-quiz-submit").addEventListener("click", async () => {
      const submitBtn = root.querySelector("#rv-quiz-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "判分中…";
      }
      try {
        const next = collectAnswers(quiz, root);
        const blanks = blankItemsForGrading(next);
        const { localGrades, needsLlm } = splitBlanksForGrading(blanks);
        let blankGrades = { ...localGrades };

        if (needsLlm.length) {
          const t0 = Date.now();
          console.log("[RecordU quiz] ui grade start", {
            local: Object.keys(localGrades).length,
            needsLlm: needsLlm.length
          });
          try {
            const res = await gradeQuizBlanks(needsLlm, next.promptLang === "zh" ? "zh" : "en");
            console.log("[RecordU quiz] ui grade response", {
              ok: !!(res && res.ok),
              code: res && res.code,
              grades: res && res.grades ? Object.keys(res.grades).length : 0,
              error: res && res.error,
              ms: Date.now() - t0
            });
            if (res && res.ok && res.grades) {
              blankGrades = { ...blankGrades, ...res.grades };
            } else {
              const code = res && res.code;
              let msg = (res && res.error) || "填空判分失败，将按近似匹配计分";
              if (code === "need_key") {
                msg = "未配置 API Key，填空将按近似匹配计分。可到设置 → 大模型填写。";
              } else if (code === "timeout") {
                msg = "判分超时，将按近似匹配计分。";
              }
              await modalAlert({ title: "填空判分", message: msg });
            }
          } catch (e) {
            console.warn("[RecordU quiz] ui grade exception", e);
            await modalAlert({
              title: "填空判分",
              message: `${e && e.message ? e.message : e}；将按近似匹配计分`
            });
          }
        } else {
          console.log("[RecordU quiz] ui grade local-only", Object.keys(localGrades).length);
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
      } finally {
        if (submitBtn && submitBtn.isConnected) {
          submitBtn.disabled = false;
          submitBtn.textContent = "交卷";
        }
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
    const links = Array.isArray(item.links) ? item.links : [];
    return `
      <li class="rv-quiz-q" data-qid="${escapeHtml(item.id)}" data-type="match">
        <div class="rv-quiz-q-head"><span class="rv-quiz-q-num is-match">${index + 1}. 连线</span>${mark}</div>
        <p class="rv-quiz-q-hint">先点左侧一项，再点右侧对应项。</p>
        <div class="rv-quiz-match" data-match-id="${escapeHtml(item.id)}" data-readonly="${
          readonly ? "1" : "0"
        }" data-correct="${escapeHtml(links.join(","))}">
          <svg class="rv-quiz-match-lines" aria-hidden="true"></svg>
          <div class="rv-quiz-match-col">
            ${left
              .map(
                (t, i) =>
                  `<button type="button" class="rv-quiz-match-chip" data-side="left" data-index="${i}" data-label="${escapeHtml(
                    t
                  )}" ${user[i] >= 0 ? `data-linked="${user[i]}"` : ""} ${
                    readonly ? "disabled" : ""
                  }>${escapeHtml(t)}</button>`
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
                .map((t, i) => `${escapeHtml(t)} → ${escapeHtml(right[links[i]] || "")}`)
                .join("；")}</p>`
            : ""
        }
      </li>`;
  }

  return "";
}

function setupMatchUI(root, readonly) {
  root.querySelectorAll(".rv-quiz-match").forEach((box) => {
    const svg = box.querySelector(".rv-quiz-match-lines");
    if (!svg) return;

    const links = [];
    box.querySelectorAll('[data-side="left"]').forEach((chip) => {
      const i = Number(chip.dataset.index);
      const v = chip.dataset.linked;
      links[i] = v == null ? -1 : Number(v);
    });
    box._links = links;

    const draw = () => drawMatchLines(box, svg);
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    draw();

    if (readonly) return;
    bindMatchInteractions(box, svg, draw);
  });
}

function matchAnchor(chip, boxRect, fromLeft) {
  const r = chip.getBoundingClientRect();
  return {
    x: fromLeft ? r.left - boxRect.left : r.right - boxRect.left,
    y: r.top + r.height / 2 - boxRect.top
  };
}

function matchLineEl(x1, y1, x2, y2, cls) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("class", cls);
  return el;
}

function drawMatchLines(box, svg) {
  const b = box.getBoundingClientRect();
  if (!b.width || !b.height) return;
  svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
  svg.textContent = "";

  const readonly = box.dataset.readonly === "1";
  const correct = box.dataset.correct
    ? box.dataset.correct.split(",").map((s) => Number(s))
    : [];
  const links = box._links || [];
  const leftChips = box.querySelectorAll('[data-side="left"]');
  const rightChips = box.querySelectorAll('[data-side="right"]');

  leftChips.forEach((chip) => {
    const i = Number(chip.dataset.index);
    const li = links[i];
    const isOk = li >= 0 && li === correct[i];

    if (readonly) {
      if (li >= 0 && rightChips[li]) {
        const p1 = matchAnchor(chip, b, false);
        const p2 = matchAnchor(rightChips[li], b, true);
        svg.appendChild(
          matchLineEl(p1.x, p1.y, p2.x, p2.y, isOk ? "rv-quiz-line is-ok" : "rv-quiz-line is-bad")
        );
      }
      if (!isOk && correct[i] >= 0 && rightChips[correct[i]]) {
        const q1 = matchAnchor(chip, b, false);
        const q2 = matchAnchor(rightChips[correct[i]], b, true);
        svg.appendChild(matchLineEl(q1.x, q1.y, q2.x, q2.y, "rv-quiz-line is-guide"));
      }
      return;
    }

    if (li < 0 || !rightChips[li]) return;
    const p1 = matchAnchor(chip, b, false);
    const p2 = matchAnchor(rightChips[li], b, true);
    svg.appendChild(matchLineEl(p1.x, p1.y, p2.x, p2.y, "rv-quiz-line"));
  });
}

function bindMatchInteractions(box, svg, draw) {
  let leftPick = -1;
  const leftChips = box.querySelectorAll('[data-side="left"]');
  const links = box._links;

  const setPicked = (index) => {
    leftPick = index;
    leftChips.forEach((c) => c.classList.toggle("is-picked", Number(c.dataset.index) === leftPick));
  };

  const renderChips = () => {
    leftChips.forEach((c) => {
      const i = Number(c.dataset.index);
      if (links[i] >= 0) c.dataset.linked = String(links[i]);
      else delete c.dataset.linked;
    });
    draw();
  };

  const removePreview = () => {
    const prev = svg.querySelector(".rv-quiz-line.is-preview");
    if (prev) prev.remove();
  };

  box.addEventListener("click", (e) => {
    const chip = e.target.closest(".rv-quiz-match-chip");
    if (!chip || chip.disabled) return;
    const side = chip.dataset.side;
    const index = Number(chip.dataset.index);
    if (side === "left") {
      setPicked(index);
      return;
    }
    if (side === "right" && leftPick >= 0) {
      for (let i = 0; i < links.length; i++) {
        if (links[i] === index) links[i] = -1;
      }
      links[leftPick] = index;
      renderChips();
      setPicked(-1);
    }
  });

  box.addEventListener("mousemove", (e) => {
    if (leftPick < 0 || !leftChips[leftPick]) {
      removePreview();
      return;
    }
    const b = box.getBoundingClientRect();
    const p1 = matchAnchor(leftChips[leftPick], b, false);
    const x2 = e.clientX - b.left;
    const y2 = e.clientY - b.top;
    let prev = svg.querySelector(".rv-quiz-line.is-preview");
    if (!prev) {
      prev = matchLineEl(p1.x, p1.y, x2, y2, "rv-quiz-line is-preview");
      svg.appendChild(prev);
    } else {
      prev.setAttribute("x1", p1.x);
      prev.setAttribute("y1", p1.y);
      prev.setAttribute("x2", x2);
      prev.setAttribute("y2", y2);
    }
  });

  box.addEventListener("mouseleave", removePreview);
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
