export async function getAllCaptures() {
  const res = await chrome.runtime.sendMessage({ type: "rc-get-all" });
  const list = (res && res.captures) || [];
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCapture(payload) {
  return chrome.runtime.sendMessage({ type: "rc-save", ...payload });
}

export async function updateCapture(id, patch) {
  return chrome.runtime.sendMessage({ type: "rc-update", id, patch });
}

export async function deleteCapture(id) {
  return chrome.runtime.sendMessage({ type: "rc-delete", id });
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
