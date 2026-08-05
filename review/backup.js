import { zipSync, unzipSync, strToU8, strFromU8 } from "../vendor/fflate.js";
import {
  exportBackupMeta,
  getFaviconBuffer,
  getScreenshotBuffer,
  importBackupBegin,
  importBackupFinish,
  importFavicon,
  importScreenshot
} from "../shared/api.js";

function dateStamp(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function u8ToBase64(u8) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToU8(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function findShotBytes(files, entry) {
  const wanted = entry.file || `screenshots/${entry.captureId}.jpg`;
  const direct = files[wanted];
  if (direct && direct.length > 32) return direct;

  const id = entry.captureId;
  if (!id) return null;
  for (const [key, val] of Object.entries(files)) {
    if (!val || val.length < 32) continue;
    if (key === wanted || key.endsWith(`/${id}.jpg`) || key.endsWith(`/${id}.png`) || key.includes(id)) {
      return val;
    }
  }
  return null;
}

function findFavBytes(files, entry) {
  if (entry.file && files[entry.file] && files[entry.file].length > 16) {
    return files[entry.file];
  }
  const host = entry.host;
  if (!host) return null;
  for (const [key, val] of Object.entries(files)) {
    if (!val || val.length < 16) continue;
    if (!key.startsWith("favicons/")) continue;
    if (key.includes(host) || key.toLowerCase().includes(String(host).toLowerCase())) {
      return val;
    }
  }
  return null;
}

/**
 * Build and download a RecordU ZIP backup.
 * @param {(msg: string) => void} [onProgress]
 */
export async function downloadBackup(onProgress) {
  const report = typeof onProgress === "function" ? onProgress : () => {};
  report("正在收集数据…");
  const meta = await exportBackupMeta();
  const files = {};
  const shots = Array.isArray(meta.screenshots) ? meta.screenshots : [];
  const favs = Array.isArray(meta.favicons) ? meta.favicons : [];
  let packedShots = 0;
  let skippedShots = 0;
  let packedFavs = 0;
  let skippedFavs = 0;

  for (let i = 0; i < shots.length; i++) {
    const entry = shots[i];
    report(`正在打包截图 ${i + 1}/${shots.length}…`);
    const shot = await getScreenshotBuffer(entry.captureId);
    if (!shot) {
      skippedShots++;
      continue;
    }
    const path = entry.file || `screenshots/${entry.captureId}.jpg`;
    let bytes = null;
    if (typeof shot.base64 === "string" && shot.base64.length > 0) {
      bytes = base64ToU8(shot.base64);
    } else if (shot.buffer && shot.buffer.byteLength > 0) {
      bytes = new Uint8Array(shot.buffer);
    }
    if (!bytes || bytes.length < 32) {
      skippedShots++;
      continue;
    }
    files[path] = bytes;
    packedShots++;
  }

  for (let i = 0; i < favs.length; i++) {
    const entry = favs[i];
    report(`正在打包图标 ${i + 1}/${favs.length}…`);
    if (!entry || !entry.host) {
      skippedFavs++;
      continue;
    }
    const fav = await getFaviconBuffer(entry.host);
    if (!fav || typeof fav.base64 !== "string" || !fav.base64.length) {
      skippedFavs++;
      continue;
    }
    const path = entry.file || `favicons/${entry.host}.png`;
    const bytes = base64ToU8(fav.base64);
    if (!bytes || bytes.length < 16) {
      skippedFavs++;
      continue;
    }
    files[path] = bytes;
    packedFavs++;
  }

  // Only list assets that were actually packed (no embedded pixels in JSON).
  meta.screenshots = shots.filter((s) => {
    const path = s.file || `screenshots/${s.captureId}.jpg`;
    return files[path] && files[path].length >= 32;
  });
  meta.favicons = favs.filter((f) => {
    const path = f.file;
    return path && files[path] && files[path].length >= 16;
  });

  files["manifest.json"] = strToU8(JSON.stringify(meta, null, 2));
  report("正在压缩…");
  const zipped = zipSync(files, { level: 1 });
  const blob = new Blob([zipped], { type: "application/zip" });
  downloadBlob(blob, `RecordU-backup-${dateStamp(meta.exportedAt)}.zip`);
  const parts = [];
  if (skippedShots > 0) parts.push(`截图跳过 ${skippedShots}`);
  if (skippedFavs > 0) parts.push(`图标跳过 ${skippedFavs}`);
  report(parts.length ? `✓ 备份已下载（${parts.join("，")}）` : "✓ 备份已下载");
  return {
    captures: (meta.captures || []).length,
    words: (meta.words || []).length,
    screenshots: packedShots,
    skippedScreenshots: skippedShots,
    favicons: packedFavs,
    skippedFavicons: skippedFavs
  };
}

function findManifest(files) {
  if (files["manifest.json"]) return files["manifest.json"];
  const key = Object.keys(files).find((k) => /(^|\/)manifest\.json$/i.test(k));
  return key ? files[key] : null;
}

/**
 * Restore from a ZIP File. Caller should confirm replace before calling.
 * Empty / missing screenshot files are skipped (do not abort the whole restore).
 * @param {File} file
 * @param {(msg: string) => void} [onProgress]
 */
export async function restoreBackupFromFile(file, onProgress) {
  const report = typeof onProgress === "function" ? onProgress : () => {};
  if (!file) throw new Error("no file");

  report("正在读取备份…");
  const buf = new Uint8Array(await file.arrayBuffer());
  let files;
  try {
    files = unzipSync(buf);
  } catch (e) {
    throw new Error("无法解压 ZIP，请确认文件完整");
  }

  const rawManifest = findManifest(files);
  if (!rawManifest) throw new Error("备份中缺少 manifest.json");

  let meta;
  try {
    meta = JSON.parse(strFromU8(rawManifest));
  } catch (e) {
    throw new Error("manifest.json 无法解析");
  }
  if (!meta || meta.format !== "recordu-backup") {
    throw new Error("不是有效的 RecordU 备份");
  }

  report("正在写入感触与单词…");
  await importBackupBegin({
    format: meta.format,
    version: meta.version,
    settings: meta.settings,
    captures: meta.captures,
    words: meta.words,
    // Legacy: dataUrl-embedded favicons; file-based ones imported below.
    favicons: meta.favicons
  });

  const shots = Array.isArray(meta.screenshots) ? meta.screenshots : [];
  let restoredShots = 0;
  let skippedShots = 0;

  for (let i = 0; i < shots.length; i++) {
    const entry = shots[i];
    report(`正在恢复截图 ${i + 1}/${shots.length}…`);
    if (!entry || !entry.captureId) {
      skippedShots++;
      continue;
    }
    const data = findShotBytes(files, entry);
    if (!data || data.length < 32) {
      skippedShots++;
      continue;
    }
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    try {
      await importScreenshot({
        captureId: entry.captureId,
        mime: entry.mime || "image/jpeg",
        w: typeof entry.w === "number" ? entry.w : 0,
        h: typeof entry.h === "number" ? entry.h : 0,
        base64: u8ToBase64(u8)
      });
      restoredShots++;
    } catch (e) {
      console.warn("[RecordU] skip screenshot", entry.captureId, e);
      skippedShots++;
    }
  }

  const favs = Array.isArray(meta.favicons) ? meta.favicons : [];
  let restoredFavs = 0;
  let skippedFavs = 0;
  for (let i = 0; i < favs.length; i++) {
    const entry = favs[i];
    report(`正在恢复图标 ${i + 1}/${favs.length}…`);
    if (!entry || !entry.host) {
      skippedFavs++;
      continue;
    }
    // Already imported via legacy dataUrl in importBackupBegin.
    if (typeof entry.dataUrl === "string" && entry.dataUrl.startsWith("data:")) {
      restoredFavs++;
      continue;
    }
    const data = findFavBytes(files, entry);
    if (!data || data.length < 16) {
      skippedFavs++;
      continue;
    }
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    try {
      await importFavicon({
        host: entry.host,
        mime: entry.mime || "image/png",
        base64: u8ToBase64(u8)
      });
      restoredFavs++;
    } catch (e) {
      console.warn("[RecordU] skip favicon", entry.host, e);
      skippedFavs++;
    }
  }

  await importBackupFinish();
  const notes = [];
  if (skippedShots > 0) notes.push(`截图跳过 ${skippedShots}`);
  if (skippedFavs > 0) notes.push(`图标跳过 ${skippedFavs}`);
  report(notes.length ? `✓ 已恢复（${notes.join("，")}）` : "✓ 已恢复");
  return {
    captures: (meta.captures || []).length,
    words: (meta.words || []).length,
    screenshots: restoredShots,
    skippedScreenshots: skippedShots,
    favicons: restoredFavs,
    skippedFavicons: skippedFavs
  };
}
