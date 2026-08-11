let voices = [];
let voicesReady = false;
let readyResolvers = [];

/** 听感自然的英文语音优先（Chrome 谷歌语音 / macOS Samantha / Windows 自然语音等）。 */
const PREFERRED_VOICE_NAMES = [
  "Google US English",
  "Samantha",
  "Microsoft Aria Online (Natural)",
  "Microsoft Jenny Online (Natural)",
  "Microsoft Guy Online (Natural)",
  "Aria Natural",
  "Jenny Natural",
  "Guy Natural",
  "Victoria",
  "Susan",
  "Karen",
  "Moira",
  "Daniel"
];

function syncVoices() {
  if (typeof speechSynthesis === "undefined") return [];
  const list = speechSynthesis.getVoices();
  if (list.length) {
    voices = list;
    if (!voicesReady) {
      voicesReady = true;
      const resolvers = readyResolvers;
      readyResolvers = [];
      resolvers.forEach((resolve) => resolve());
    }
  }
  return list;
}

/** 优先自然语音，其次 en-US，再任意英文语音。 */
function pickEnglishVoice() {
  const list = syncVoices();
  if (!list.length) return null;
  for (const name of PREFERRED_VOICE_NAMES) {
    const hit = list.find((v) => v.lang === "en-US" && v.name.includes(name));
    if (hit) return hit;
  }
  const english = list.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  return english.find((v) => v.lang === "en-US") || english[0] || null;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  syncVoices();
  speechSynthesis.addEventListener("voiceschanged", syncVoices);
}

/** 用浏览器自带语音朗读单词（en-US）。 */
export async function speakWord(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = String(text || "").trim();
  if (!clean) return;
  speechSynthesis.cancel();
  if (!voicesReady) {
    await Promise.race([
      new Promise((resolve) => readyResolvers.push(resolve)),
      new Promise((resolve) => setTimeout(resolve, 300))
    ]);
    speechSynthesis.cancel();
  }
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "en-US";
  utter.rate = 0.7;
  utter.pitch = 0.95;
  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}
