import { groupBySite } from "../shared/captures.js";
import { inEarlierThanThisWeek, inThisWeek } from "../shared/time.js";

export const state = {
  captures: [],
  /** @type {"queue"|"site"} */
  mode: "queue",
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

/** Aggregated sites for site mode (left rail entries). */
export function siteGroups() {
  return groupBySite(browseList());
}

/** Active mode list for focus navigation (captures or site groups). */
export function modeList() {
  if (state.mode === "queue") return queueList();
  return siteGroups();
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
  if (state.mode === "site") return null;
  const list = modeList();
  return list[state.focusIndex] || null;
}

export function focusedSite() {
  if (state.mode !== "site") return null;
  return siteGroups()[state.focusIndex] || null;
}
