import { zipSync, unzipSync, strToU8, strFromU8 } from "../vendor/fflate.js";
import {
  exportBackupMeta,
  getScreenshotBuffer,
  importBackupBegin,
  importBackupFinish,
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
  let packed = 0;
  let skipped = 0;

  for (let i = 0; i < shots.length; i++) {
    const entry = shots[i];
    report(`正在打包截图 ${i + 1}/${shots.length}…`);
    const shot = await getScreenshotBuffer(entry.captureId);
    if (!shot) {
      skipped++;
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
      skipped++;
      continue;
    }
    files[path] = bytes;
    packed++;
  }

  // Only list screenshots that were actually packed.
  meta.screenshots = shots.filter((s) => {
    const path = s.file || `screenshots/${s.captureId}.jpg`;
    return files[path] && files[path].length >= 32;
  });

  files["manifest.json"] = strToU8(JSON.stringify(meta, null, 2));
  report("正在压缩…");
  const zipped = zipSync(files, { level: 1 });
  const blob = new Blob([zipped], { type: "application/zip" });
  downloadBlob(blob, `RecordU-backup-${dateStamp(meta.exportedAt)}.zip`);
  const msg =
    skipped > 0
      ? `✓ 备份已下载（截图 ${packed} 张，跳过空图 ${skipped}）`
      : "✓ 备份已下载";
  report(msg);
  return {
    captures: (meta.captures || []).length,
    words: (meta.words || []).length,
    screenshots: packed,
    skippedScreenshots: skipped,
    favicons: (meta.favicons || []).length
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

  await importBackupFinish();
  if (skippedShots > 0) {
    report(`✓ 已恢复（截图成功 ${restoredShots}，跳过空/损坏 ${skippedShots}）`);
  } else {
    report("✓ 已恢复");
  }
  return {
    captures: (meta.captures || []).length,
    words: (meta.words || []).length,
    screenshots: restoredShots,
    skippedScreenshots: skippedShots,
    favicons: (meta.favicons || []).length
  };
}
