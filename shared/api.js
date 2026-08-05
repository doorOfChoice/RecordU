export async function getAllCaptures() {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-all" });
  const list = (res && res.captures) || [];
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCapture(id) {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-one", id });
  return (res && res.capture) || null;
}

export async function getScreenshotDataUrl(id) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "rc-get-screenshot", id });
    if (chrome.runtime.lastError) return null;
    return (res && res.dataUrl) || null;
  } catch (e) {
    return null;
  }
}

export async function saveCapture(payload) {
  return chrome.runtime.sendMessage({ type: "rc-save", ...payload });
}

export async function saveScreenshotCapture(payload) {
  return chrome.runtime.sendMessage({ type: "rc-save-screenshot", ...payload });
}

export async function updateCapture(id, patch) {
  return chrome.runtime.sendMessage({ type: "rc-update", id, patch });
}

export async function deleteCapture(id) {
  return chrome.runtime.sendMessage({ type: "rc-delete", id });
}

export async function startRegionCapture() {
  return chrome.runtime.sendMessage({ type: "rc-start-region-capture" });
}

export async function fetchFavicon(host) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "rc-favicon", host });
    if (chrome.runtime.lastError) return null;
    return (res && res.dataUrl) || null;
  } catch (e) {
    return null;
  }
}

export async function getAllWords() {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-all-words" });
  const list = (res && res.words) || [];
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function getWord(id) {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-word", id });
  return (res && res.word) || null;
}

export async function saveWord(payload) {
  return chrome.runtime.sendMessage({ type: "rc-save-word", ...payload });
}

export async function updateWord(id, patch) {
  return chrome.runtime.sendMessage({ type: "rc-update-word", id, patch });
}

export async function deleteWord(id) {
  return chrome.runtime.sendMessage({ type: "rc-delete-word", id });
}

export async function getSettings() {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-settings" });
  return (res && res.settings) || null;
}

export async function saveSettings(patch) {
  return chrome.runtime.sendMessage({ type: "rc-save-settings", patch });
}

export async function resetSettings() {
  return chrome.runtime.sendMessage({ type: "rc-reset-settings" });
}

export async function exportBackupMeta() {
  const res = await chrome.runtime.sendMessage({ type: "rc-export-backup-meta" });
  if (!res || !res.ok) throw new Error((res && res.error) || "export backup meta failed");
  return res.meta;
}

export async function getScreenshotBuffer(captureId) {
  const res = await chrome.runtime.sendMessage({
    type: "rc-get-screenshot-buffer",
    captureId
  });
  if (!res || !res.ok) throw new Error((res && res.error) || "get screenshot buffer failed");
  return res.shot || null;
}

export async function getFaviconBuffer(host) {
  const res = await chrome.runtime.sendMessage({
    type: "rc-get-favicon-buffer",
    host
  });
  if (!res || !res.ok) throw new Error((res && res.error) || "get favicon buffer failed");
  return res.fav || null;
}

export async function importBackupBegin(payload) {
  const res = await chrome.runtime.sendMessage({
    type: "rc-import-backup-begin",
    payload
  });
  if (!res || !res.ok) throw new Error((res && res.error) || "import backup begin failed");
  return res;
}

export async function importScreenshot(payload) {
  const res = await chrome.runtime.sendMessage({
    type: "rc-import-screenshot",
    ...payload
  });
  if (!res || !res.ok) throw new Error((res && res.error) || "import screenshot failed");
  return res;
}

export async function importFavicon(payload) {
  const res = await chrome.runtime.sendMessage({
    type: "rc-import-favicon",
    ...payload
  });
  if (!res || !res.ok) throw new Error((res && res.error) || "import favicon failed");
  return res;
}

export async function importBackupFinish() {
  const res = await chrome.runtime.sendMessage({ type: "rc-import-backup-finish" });
  if (!res || !res.ok) throw new Error((res && res.error) || "import backup finish failed");
  return res;
}
