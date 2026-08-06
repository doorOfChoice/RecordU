import { groupBySite } from "../shared/captures.js";
import { inEarlierThanThisWeek, inThisWeek } from "../shared/time.js";

export const state = {
  captures: [],
  words: [],
  quizzes: [],
  settings: null,
  /** @type {"queue"|"words"|"settings"} */
  mode: "queue",
  /** Capture layout when mode is queue: timeline list vs by-site. */
  /** @type {"queue"|"site"} */
  captureView: "queue",
  /** Settings sub-tab when mode is settings. */
  /** @type {"highlight"|"backup"|"llm"} */
  settingsTab: "highlight",
  /** Words sub-tab when mode is words. */
  /** @type {"list"|"quizzes"} */
  wordsTab: "list",
  /** Open quiz id when taking/reviewing a paper; null = list. */
  activeQuizId: null,
  /** @type {"week"|"earlier"|"all"} */
  dateRange: "week",
  focusIndex: 0
};

function matchDate(c) {
  if (state.dateRange === "all") return true;
  if (state.dateRange === "week") return inThisWeek(c.createdAt);
  if (state.dateRange === "earlier") return inEarlierThanThisWeek(c.createdAt);
  return true;
}

export function queueList() {
  return state.captures.filter((c) => matchDate(c));
}

export function browseList() {
  return state.captures.filter((c) => matchDate(c));
}

export function wordsList() {
  return state.words.slice();
}

/** Aggregated sites for site capture view (left rail entries). */
export function siteGroups() {
  return groupBySite(browseList());
}

export function isSiteCaptureView() {
  return state.mode === "queue" && state.captureView === "site";
}

/** Active mode list for focus navigation (captures, site groups, or words). */
export function modeList() {
  if (state.mode === "words") return wordsList();
  if (state.mode === "settings") return [];
  if (state.captureView === "site") return siteGroups();
  return queueList();
}

export function clampFocus() {
  const list = modeList();
  if (!list.length) {
    state.focusIndex = 0;
    return;
  }
  if (state.focusIndex < 0) state.focusIndex = 0;
  if (state.focusIndex >= list.length) state.focusIndex = list.length - 1;
}

export function focusedCapture() {
  if (state.mode !== "queue" || state.captureView === "site") return null;
  const list = modeList();
  return list[state.focusIndex] || null;
}

export function focusedWord() {
  if (state.mode !== "words") return null;
  return wordsList()[state.focusIndex] || null;
}

export function focusedSite() {
  if (!isSiteCaptureView()) return null;
  return siteGroups()[state.focusIndex] || null;
}
